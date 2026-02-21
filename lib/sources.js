'use strict';

const fs   = require('fs');
const path = require('path');
const { expandToken } = require('./synonyms');

const SOURCES_FILE = path.join(
  process.env.HOME || require('os').homedir(),
  '.researchlab',
  'sources.json'
);

/**
 * Load the full source registry.
 */
function loadAll() {
  if (!fs.existsSync(SOURCES_FILE)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(SOURCES_FILE, 'utf8'));
    return data.sources || [];
  } catch (_) {
    return [];
  }
}

/**
 * Save the full source registry.
 */
function saveAll(sources) {
  const data = {
    _meta: {
      description: 'Registry of data sources available to research workers. Matched to topics by tags.',
      updated: new Date().toISOString().slice(0, 10),
    },
    sources,
  };
  fs.mkdirSync(path.dirname(SOURCES_FILE), { recursive: true });
  fs.writeFileSync(SOURCES_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// Stop words
// ---------------------------------------------------------------------------
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her',
  'was', 'one', 'our', 'out', 'has', 'had', 'how', 'its', 'may', 'who',
  'did', 'get', 'let', 'say', 'she', 'too', 'use', 'way', 'about', 'also',
  'any', 'been', 'best', 'both', 'come', 'each', 'from', 'have', 'just',
  'know', 'like', 'look', 'make', 'more', 'most', 'much', 'must', 'name',
  'need', 'never', 'next', 'only', 'over', 'part', 'real', 'same', 'some',
  'take', 'than', 'that', 'them', 'then', 'they', 'this', 'time', 'very',
  'want', 'well', 'what', 'when', 'will', 'with', 'work', 'year', 'your',
  'avoid', 'nothing', 'face', 'value', 'find', 'ensure', 'research',
  'affects', 'downstream', 'sources', 'natural', 'everything',
]);

// ---------------------------------------------------------------------------
// Tokenization helpers
// ---------------------------------------------------------------------------

/**
 * Tokenize a string: lowercase, split on non-alphanumeric, drop short/stop tokens.
 */
function tokenize(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

/**
 * Generate bigrams from an array of tokens.
 */
function bigrams(tokens) {
  const result = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    result.push(tokens[i] + ' ' + tokens[i + 1]);
  }
  return result;
}

/**
 * Check whether a token appears in text at a word boundary (prevents
 * 'car' matching 'cardiac'). Uses a pre-escaped regex with \b anchors.
 */
function wordBoundaryMatch(token, text) {
  try {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('\\b' + escaped + '\\b').test(text);
  } catch (_) {
    return text.includes(token);
  }
}

// ---------------------------------------------------------------------------
// BM25 scoring
// ---------------------------------------------------------------------------

/**
 * Compute IDF for a term given the number of sources containing it
 * and the total number of sources.  Uses the Lucene/Elasticsearch variant:
 *   IDF(t) = log(1 + (N - df + 0.5) / (df + 0.5))
 */
function idf(docFreq, totalDocs) {
  return Math.log(1 + (totalDocs - docFreq + 0.5) / (docFreq + 0.5));
}

/**
 * Compute BM25 score for a single term in a single field.
 *
 * @param {number} tf - term frequency in the field
 * @param {number} fieldLen - number of tokens in the field
 * @param {number} avgFieldLen - average field length across collection
 * @param {number} idfValue - pre-computed IDF for the term
 * @param {number} k1 - TF saturation (default 1.2)
 * @param {number} b  - length normalization (default 0.75)
 */
function bm25TermScore(tf, fieldLen, avgFieldLen, idfValue, k1 = 1.2, b = 0.75) {
  if (tf === 0) return 0;
  const norm = 1 - b + b * (fieldLen / (avgFieldLen || 1));
  return idfValue * ((tf * (k1 + 1)) / (tf + k1 * norm));
}

// ---------------------------------------------------------------------------
// Core matching
// ---------------------------------------------------------------------------

/**
 * Build tokenized fields for a source. Returns { name, tags, desc } each as
 * an array of lowercased tokens, plus a combined text string for bigram search.
 */
function buildSourceDoc(src) {
  const nameTokens = tokenize(src.name || '');
  const tagTokens = (src.tags || []).flatMap((t) => tokenize(t));
  const descTokens = tokenize(src.description || '');
  const combined = [
    (src.name || '').toLowerCase(),
    (src.tags || []).join(' ').toLowerCase(),
    (src.description || '').toLowerCase(),
  ].join(' ');
  return { nameTokens, tagTokens, descTokens, combined };
}

/**
 * Count occurrences of a token (word-boundary aware) in a token array.
 */
function countInTokens(token, tokens) {
  let count = 0;
  for (const t of tokens) {
    if (t === token) count++;
  }
  return count;
}

/**
 * Match sources to a research topic using multi-field BM25-style scoring
 * with synonym expansion, bigram matching, and dynamic thresholds.
 *
 * Fields and weights:
 *   name        — 4x
 *   tags        — 2x
 *   description — 1x
 *
 * @param {string} topic - The research topic text
 * @param {number} maxResults - Maximum sources to return (default 3)
 * @returns {object[]} Matching sources with a `_matchScore` field
 */
function matchSources(topic, maxResults = 3) {
  const sources = loadAll();
  if (!sources.length) return [];

  // Tokenize topic
  const topicTokens = tokenize(topic);
  if (!topicTokens.length) return [];

  const topicBigrams = bigrams(topicTokens);

  // Expand each topic token with synonyms
  const expandedSets = topicTokens.map((t) => expandToken(t));
  // Collect all query terms (original + synonyms) for IDF computation
  const allQueryTerms = new Set();
  for (const s of expandedSets) {
    for (const t of s) allQueryTerms.add(t);
  }

  // Build document representations
  const docs = sources.map((src) => buildSourceDoc(src));

  // Compute average field lengths across the collection
  const n = docs.length;
  let sumName = 0, sumTag = 0, sumDesc = 0;
  for (const d of docs) {
    sumName += d.nameTokens.length;
    sumTag  += d.tagTokens.length;
    sumDesc += d.descTokens.length;
  }
  const avgNameLen = sumName / n;
  const avgTagLen  = sumTag / n;
  const avgDescLen = sumDesc / n;

  // Pre-compute document frequency for each query term across all fields
  const dfMap = new Map();
  for (const term of allQueryTerms) {
    let df = 0;
    for (const d of docs) {
      const found =
        d.nameTokens.includes(term) ||
        d.tagTokens.includes(term) ||
        d.descTokens.includes(term);
      if (found) df++;
    }
    dfMap.set(term, df);
  }

  // Field weights (BM25F-style)
  const W_NAME = 4;
  const W_TAGS = 2;
  const W_DESC = 1;

  // Score each source
  const scored = sources.map((src, i) => {
    const doc = docs[i];
    let score = 0;

    // For each original query token, score across fields using BM25
    for (let qi = 0; qi < topicTokens.length; qi++) {
      const token = topicTokens[qi];
      const synonyms = expandedSets[qi];

      // Score this token (and its synonyms) against each field
      for (const term of synonyms) {
        const termIdf = idf(dfMap.get(term) || 0, n);
        const isSynonym = term !== token;
        // Synonyms get 60% weight to prefer exact matches
        const synPenalty = isSynonym ? 0.6 : 1.0;

        // Name field (weight 4x)
        const tfName = countInTokens(term, doc.nameTokens);
        if (tfName > 0) {
          score += W_NAME * synPenalty *
            bm25TermScore(tfName, doc.nameTokens.length, avgNameLen, termIdf);
        }

        // Tags field (weight 2x)
        const tfTag = countInTokens(term, doc.tagTokens);
        if (tfTag > 0) {
          score += W_TAGS * synPenalty *
            bm25TermScore(tfTag, doc.tagTokens.length, avgTagLen, termIdf);
        }

        // Description field (weight 1x)
        const tfDesc = countInTokens(term, doc.descTokens);
        if (tfDesc > 0) {
          score += W_DESC * synPenalty *
            bm25TermScore(tfDesc, doc.descTokens.length, avgDescLen, termIdf);
        }
      }
    }

    // Bigram matching — phrase-level relevance bonus
    for (const bg of topicBigrams) {
      if (wordBoundaryMatch(bg, doc.combined)) {
        score += 3;
      }
    }

    return { ...src, _matchScore: Math.round(score * 100) / 100 };
  });

  // Dynamic threshold: return results above 40% of the top score,
  // or always return at least the best match if any match exists.
  scored.sort((a, b) => b._matchScore - a._matchScore);

  const topScore = scored.length > 0 ? scored[0]._matchScore : 0;
  if (topScore <= 0) return [];

  const threshold = topScore * 0.4;
  const filtered = scored.filter((s) => s._matchScore >= threshold && s._matchScore > 0);

  // Always include at least the top result if it scored above zero
  if (filtered.length === 0 && scored[0]._matchScore > 0) {
    return [scored[0]].slice(0, maxResults);
  }

  return filtered.slice(0, maxResults);
}

/**
 * Format matched sources into a text block suitable for inclusion in
 * worker task descriptions.
 */
function formatForWorker(matchedSources) {
  if (!matchedSources.length) return '';

  const lines = ['AVAILABLE DATA SOURCES (use these APIs to supplement web research):'];

  for (const src of matchedSources) {
    lines.push(`--- ${src.name} (${src.id}) ---`);
    lines.push(`  ${src.description}`);
    lines.push(`  Base URL: ${src.baseUrl}`);

    // Show 1-2 most relevant endpoints
    const endpoints = src.endpoints || {};
    const epKeys = Object.keys(endpoints).slice(0, 2);
    for (const key of epKeys) {
      lines.push(`  ${key}: ${src.baseUrl}${endpoints[key]}`);
    }

    if (src.auth) lines.push(`  Auth: ${src.auth}`);
    if (src.notes) lines.push(`  Notes: ${src.notes}`);
    if (src.exampleQueries && src.exampleQueries.length) {
      lines.push(`  Example: ${src.exampleQueries[0]}`);
    }
  }

  return lines.join(' ');
}

/**
 * Get a source by ID.
 */
function getById(id) {
  return loadAll().find((s) => s.id === id) || null;
}

/**
 * Add or update a source in the registry.
 */
function upsert(source) {
  if (!source.id) throw new Error('Source must have an id');
  const sources = loadAll();
  const idx = sources.findIndex((s) => s.id === source.id);
  if (idx >= 0) {
    sources[idx] = { ...sources[idx], ...source };
  } else {
    sources.push(source);
  }
  saveAll(sources);
  return source;
}

/**
 * Remove a source by ID.
 */
function remove(id) {
  const sources = loadAll();
  const filtered = sources.filter((s) => s.id !== id);
  if (filtered.length === sources.length) return false;
  saveAll(filtered);
  return true;
}

module.exports = { loadAll, matchSources, formatForWorker, getById, upsert, remove };
