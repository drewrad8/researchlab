'use strict';

const fs   = require('fs');
const path = require('path');

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

/**
 * Match sources to a research topic by checking tag overlap with topic words.
 * Returns sources sorted by relevance (number of matching tags).
 *
 * @param {string} topic - The research topic text
 * @param {number} maxResults - Maximum sources to return (default 5)
 * @returns {object[]} Matching sources with a `_matchScore` field
 */
// Common stop words that inflate scores when topics are verbose
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

function matchSources(topic, maxResults = 3) {
  const sources = loadAll();
  if (!sources.length) return [];

  // Normalize topic into searchable tokens, filtering stop words
  const topicLower = topic.toLowerCase();
  const topicTokens = topicLower
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));

  const scored = sources.map((src) => {
    const tags = (src.tags || []).map((t) => t.toLowerCase());
    let score = 0;

    for (const tag of tags) {
      // Exact token match (strong signal)
      if (topicTokens.includes(tag)) {
        score += 3;
        continue;
      }
      // Multi-word tag appears as substring in topic (strong signal)
      if (tag.includes('-') && topicLower.includes(tag.replace(/-/g, ' '))) {
        score += 3;
        continue;
      }
      // Tag appears as substring in topic
      if (topicLower.includes(tag)) {
        score += 2;
        continue;
      }
      // Topic token appears as substring in hyphenated tag parts
      const tagParts = tag.split('-');
      for (const token of topicTokens) {
        if (tagParts.includes(token)) {
          score += 1;
          break;
        }
      }
    }

    return { ...src, _matchScore: score };
  });

  const MIN_SCORE = 3;
  return scored
    .filter((s) => s._matchScore >= MIN_SCORE)
    .sort((a, b) => b._matchScore - a._matchScore)
    .slice(0, maxResults);
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
