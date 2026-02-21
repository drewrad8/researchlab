'use strict';

const fs   = require('fs');
const path = require('path');

const { expandToken } = require('./synonyms');

const RESEARCHLAB_DIR = path.join(
  process.env.HOME || require('os').homedir(),
  '.researchlab'
);
const INDEX_FILE = path.join(RESEARCHLAB_DIR, 'index.json');

const DEBUG = !!process.env.RESEARCHLAB_DEBUG;

// ---------------------------------------------------------------------------
// Text processing helpers
// ---------------------------------------------------------------------------

/**
 * Tokenize a string: lowercase, split on non-alphanumeric, drop short tokens.
 */
function tokenize(str) {
  return (str || '').toLowerCase().split(/[\s\-_/,.;:()]+/).filter((t) => t.length > 1);
}

/**
 * Generate bigrams from an array of tokens.
 * e.g. ['water', 'quality', 'test'] → ['water quality', 'quality test']
 */
function bigrams(tokens) {
  const result = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    result.push(tokens[i] + ' ' + tokens[i + 1]);
  }
  return result;
}

/**
 * Extract searchable terms from a knowledge graph.
 * Pulls node labels, summaries, domain names, and product/entity names.
 */
function extractSearchTerms(graph) {
  const terms = new Set();
  for (const node of graph.nodes || []) {
    // Node labels and ids
    for (const field of [node.label, node.id, node.name]) {
      if (field) {
        for (const tok of tokenize(field)) terms.add(tok);
      }
    }
    // Summaries — extract meaningful words
    if (node.summary) {
      for (const tok of tokenize(node.summary)) {
        if (tok.length > 3) terms.add(tok);
      }
    }
    // Type-specific: products, entities, domains
    if (node.type === 'product' || node.type === 'entity' || node.type === 'domain') {
      if (node.label) terms.add(node.label.toLowerCase());
      if (node.id) terms.add(node.id.toLowerCase());
    }
  }
  // Topic names from graph.topics
  for (const topicKey of Object.keys(graph.topics || {})) {
    for (const tok of tokenize(topicKey)) terms.add(tok);
  }
  return [...terms];
}

// ---------------------------------------------------------------------------
// IDF computation
// ---------------------------------------------------------------------------

/**
 * Compute IDF weights for a set of tokens across all index entries.
 * Uses the BM25 IDF variant: log(1 + (N - df + 0.5) / (df + 0.5))
 *
 * @param {string[]} tokens - query tokens to compute IDF for
 * @param {object[]} entries - all index entries
 * @returns {Map<string, number>} token → IDF weight
 */
function computeIDF(tokens, entries) {
  const N = entries.length;
  const idfMap = new Map();

  if (N === 0) {
    for (const t of tokens) idfMap.set(t, 1);
    return idfMap;
  }

  // Count how many entries contain each token (including synonym expansion)
  const dfCounts = new Map();
  for (const t of tokens) dfCounts.set(t, 0);

  for (const entry of entries) {
    // Build a combined token set for the entry (boundary-safe)
    const entryTokens = new Set();
    for (const tok of tokenize(entry.topic)) entryTokens.add(tok);
    for (const tag of (entry.tags || [])) {
      for (const tok of tokenize(tag)) entryTokens.add(tok);
    }
    for (const st of (entry.searchTerms || [])) {
      entryTokens.add(st.toLowerCase());
    }

    for (const t of tokens) {
      const syns = expandToken(t);
      for (const s of syns) {
        if (entryTokens.has(s)) {
          dfCounts.set(t, (dfCounts.get(t) || 0) + 1);
          break; // count each entry at most once per token
        }
      }
    }
  }

  // Compute BM25-style IDF
  for (const t of tokens) {
    const df = dfCounts.get(t) || 0;
    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
    idfMap.set(t, idf);
  }

  return idfMap;
}

// ---------------------------------------------------------------------------
// Core index operations
// ---------------------------------------------------------------------------

/**
 * Load the research index (all completed research entries).
 * Runs lightweight migration to backfill missing fields from schema changes.
 */
function load() {
  if (!fs.existsSync(INDEX_FILE)) return { entries: [], updated: null, needsRebuild: false };
  try {
    const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    let needsRebuild = false;

    for (const entry of (index.entries || [])) {
      if (!Array.isArray(entry.searchTerms)) {
        entry.searchTerms = [];
        needsRebuild = true;
      }
      if (!Array.isArray(entry.tags)) {
        entry.tags = [];
      }
      if (!entry.stats || typeof entry.stats !== 'object') {
        entry.stats = { nodes: 0, edges: 0, topics: 0, citations: 0, nodeTypes: {} };
        needsRebuild = true;
      }
    }

    index.needsRebuild = needsRebuild;
    return index;
  } catch (_) {
    return { entries: [], updated: null, needsRebuild: false };
  }
}

/**
 * Save the research index.
 */
function save(index) {
  index.updated = new Date().toISOString();
  // needsRebuild is transient — strip before persisting
  const toWrite = { entries: index.entries, updated: index.updated };
  fs.mkdirSync(RESEARCHLAB_DIR, { recursive: true });
  fs.writeFileSync(INDEX_FILE, JSON.stringify(toWrite, null, 2), 'utf8');
}

/**
 * Record a completed research project in the index.
 * Called automatically when a pipeline finishes synthesis.
 *
 * @param {object} project - The project record (id, topic, created, ...)
 * @param {object} graph - The final graph.json data
 * @param {object} meta - Optional metadata: timing, workerCount, etc.
 */
function record(project, graph, meta = {}) {
  const index = load();

  const nodeCount = (graph.nodes || []).length;
  const edgeCount = (graph.edges || []).length;
  const topicCount = Object.keys(graph.topics || {}).length;
  const citationCount = Object.values(graph.topics || {}).reduce(
    (acc, t) => acc + (t.citations || []).length, 0
  );

  const nodeTypes = {};
  for (const n of graph.nodes || []) {
    nodeTypes[n.type] = (nodeTypes[n.type] || 0) + 1;
  }

  const entry = {
    projectId: project.id,
    topic: project.topic,
    completed: new Date().toISOString(),
    created: project.created || null,
    stats: {
      nodes: nodeCount,
      edges: edgeCount,
      topics: topicCount,
      citations: citationCount,
      nodeTypes,
    },
    // Data sources that were matched/offered to workers
    sourcesUsed: meta.sourcesUsed || [],
    // Timing breakdown if available
    timing: meta.timing || null,
    // Tags derived from graph domains
    tags: (graph.nodes || [])
      .filter((n) => n.type === 'domain')
      .map((n) => n.id),
    // Searchable terms extracted from graph entities and summaries
    searchTerms: extractSearchTerms(graph),
  };

  // Upsert by projectId
  const existing = index.entries.findIndex((e) => e.projectId === project.id);
  if (existing >= 0) {
    index.entries[existing] = entry;
  } else {
    index.entries.push(entry);
  }

  save(index);
  return entry;
}

/**
 * Get all entries, newest first.
 */
function getAll() {
  const index = load();
  return index.entries.sort(
    (a, b) => (b.completed || '').localeCompare(a.completed || '')
  );
}

/**
 * Search past research by topic keywords with relevance ranking.
 *
 * Scoring factors:
 *  - Word-boundary-safe matching (tokenize-then-compare, no substring false positives)
 *  - IDF weighting: rare tokens contribute more than common ones (BM25-style IDF)
 *  - Exact token match in topic (3 × IDF, +1 bonus for early position)
 *  - Synonym match in topic (2 × IDF)
 *  - Exact token match in tags (2 × IDF)
 *  - Synonym match in tags (1 × IDF)
 *  - Exact match in searchTerms (1.5 × IDF)
 *  - Synonym match in searchTerms (0.75 × IDF)
 *  - Bigram match in topic (4 pts — phrase match is high signal)
 *  - Bigram match in tags/searchTerms (2.5 pts)
 *  - Coverage bonus: proportion of query tokens matched, scaled by query length
 */
function search(query) {
  const queryTokens = tokenize(query).filter((t) => t.length > 2);
  if (queryTokens.length === 0) return [];

  const queryBigrams = bigrams(queryTokens);

  // Expand each query token with synonyms
  const expandedSets = queryTokens.map((t) => expandToken(t));

  const entries = getAll();

  // Compute IDF weights for query tokens across the collection
  const idfWeights = computeIDF(queryTokens, entries);

  const scored = [];

  for (const entry of entries) {
    let score = 0;

    // Build boundary-safe token sets for each field
    const topicTokens = new Set(tokenize(entry.topic));
    const tagTokens = new Set();
    for (const tag of (entry.tags || [])) {
      for (const tok of tokenize(tag)) tagTokens.add(tok);
    }
    const searchTermSet = new Set(
      (entry.searchTerms || []).map((s) => s.toLowerCase())
    );

    // Build full text for bigram matching (bigrams still use substring)
    const topicFull = (entry.topic || '').toLowerCase();
    const tagStr = (entry.tags || []).join(' ').toLowerCase();
    const searchTermsStr = (entry.searchTerms || []).join(' ').toLowerCase();
    const combinedFull = tagStr + ' ' + searchTermsStr;

    // Track which query tokens matched (for coverage bonus)
    const matchedTokens = new Set();

    // Score each query token with IDF weighting and boundary-safe matching
    for (let qi = 0; qi < queryTokens.length; qi++) {
      const token = queryTokens[qi];
      const synonyms = expandedSets[qi];
      const idf = idfWeights.get(token) || 1;

      // --- Topic matching (boundary-safe via token set) ---
      if (topicTokens.has(token)) {
        score += 3 * idf;
        matchedTokens.add(qi);
        // Position bonus: earlier match in topic = more relevant
        const topicArr = tokenize(entry.topic);
        const pos = topicArr.indexOf(token);
        if (pos >= 0 && pos < topicArr.length * 0.5) score += 1;
      } else {
        // Check synonyms against topic tokens (boundary-safe)
        for (const syn of synonyms) {
          if (syn === token) continue;
          if (topicTokens.has(syn)) {
            score += 2 * idf;
            matchedTokens.add(qi);
            break;
          }
        }
      }

      // --- Tag matching (boundary-safe via token set) ---
      if (tagTokens.has(token)) {
        score += 2 * idf;
        matchedTokens.add(qi);
      } else {
        for (const syn of synonyms) {
          if (syn === token) continue;
          if (tagTokens.has(syn)) {
            score += 1 * idf;
            matchedTokens.add(qi);
            break;
          }
        }
      }

      // --- searchTerms matching (boundary-safe via token set) ---
      if (searchTermSet.has(token)) {
        score += 1.5 * idf;
        matchedTokens.add(qi);
      } else {
        for (const syn of synonyms) {
          if (syn === token) continue;
          if (searchTermSet.has(syn)) {
            score += 0.75 * idf;
            matchedTokens.add(qi);
            break;
          }
        }
      }
    }

    // --- Bigram matching (phrase-level relevance) ---
    for (const bg of queryBigrams) {
      if (topicFull.includes(bg)) {
        score += 4;
      }
      if (combinedFull.includes(bg)) {
        score += 2.5;
      }
    }

    // --- Coverage bonus ---
    // Reward entries that match a higher proportion of query tokens.
    // If a query has 5 tokens and all 5 match, that scores higher than 2 of 5.
    const coverage = matchedTokens.size / queryTokens.length;
    if (matchedTokens.size > 1) {
      // Scale bonus by both coverage ratio and query length
      score += coverage * queryTokens.length * 0.5;
    }

    if (score > 0) {
      scored.push({ entry, score });
    }
  }

  // Sort by score descending, then by completion date descending as tiebreaker
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.entry.completed || '').localeCompare(a.entry.completed || '');
  });

  // Debug logging when RESEARCHLAB_DEBUG is set
  if (DEBUG && scored.length > 0) {
    const top = scored.slice(0, 5);
    console.log('[research-index] search debug:');
    console.log('  query: "%s"', query);
    console.log('  tokens: [%s]', queryTokens.join(', '));
    console.log('  IDF weights: %s', JSON.stringify(Object.fromEntries(idfWeights)));
    console.log('  top results (%d total):', scored.length);
    for (const s of top) {
      console.log('    %s  %s (%s)', s.score.toFixed(2), s.entry.topic, s.entry.projectId);
    }
  }

  return scored.map((s) => s.entry);
}

/**
 * Rebuild the index by scanning all project directories.
 * Useful if the index file was lost or corrupted, or after schema changes
 * that require re-extraction (e.g. searchTerms backfill).
 *
 * Handles edge cases: missing graph files, empty graphs, malformed JSON,
 * projects with error status that still produced a valid graph.
 */
function rebuild() {
  const projectsDir = path.join(RESEARCHLAB_DIR, 'projects');
  if (!fs.existsSync(projectsDir)) return { entries: [], updated: null };

  // Start fresh — clear existing index before rebuilding
  const freshIndex = { entries: [], updated: null };
  save(freshIndex);

  let dirs;
  try {
    dirs = fs.readdirSync(projectsDir, { withFileTypes: true });
  } catch (e) {
    console.error('[research-index] rebuild: cannot read projects dir:', e.message);
    return load();
  }

  let indexed = 0;
  let skipped = 0;

  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const projectFile = path.join(projectsDir, dir.name, 'project.json');
    const graphFile = path.join(projectsDir, dir.name, 'graph.json');

    if (!fs.existsSync(projectFile)) { skipped++; continue; }
    if (!fs.existsSync(graphFile)) { skipped++; continue; }

    try {
      const projectRaw = fs.readFileSync(projectFile, 'utf8');
      const project = JSON.parse(projectRaw);

      const graphRaw = fs.readFileSync(graphFile, 'utf8');
      const graph = JSON.parse(graphRaw);

      // Skip projects that never completed (but allow 'error' if graph exists)
      if (project.status !== 'complete' && project.status !== 'error') {
        skipped++;
        continue;
      }

      // Skip empty or structurally invalid graphs
      if (!graph || typeof graph !== 'object') { skipped++; continue; }
      if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) { skipped++; continue; }

      record(project, graph);
      indexed++;
    } catch (e) {
      console.error(`[research-index] rebuild: skipping ${dir.name}: ${e.message}`);
      skipped++;
    }
  }

  console.log(`[research-index] rebuild complete: ${indexed} indexed, ${skipped} skipped`);
  return load();
}

module.exports = { load, record, getAll, search, rebuild };
