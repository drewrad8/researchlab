'use strict';

const fs   = require('fs');
const path = require('path');

const RESEARCHLAB_DIR = path.join(
  process.env.HOME || require('os').homedir(),
  '.researchlab'
);
const INDEX_FILE = path.join(RESEARCHLAB_DIR, 'index.json');

// ---------------------------------------------------------------------------
// Synonym / related-terms map for common research domains.
// Each group is a set of terms that should match each other.
// ---------------------------------------------------------------------------
const SYNONYM_GROUPS = [
  ['skincare', 'dermatology', 'skin', 'skin-health', 'complexion', 'epidermis'],
  ['water', 'contamination', 'pollution', 'water-quality', 'waterborne', 'wastewater'],
  ['nutrition', 'diet', 'food', 'dietary', 'nutrient', 'macronutrient', 'micronutrient'],
  ['health', 'wellness', 'wellbeing', 'well-being', 'medical', 'medicine', 'healthcare'],
  ['climate', 'global-warming', 'greenhouse', 'carbon', 'emissions', 'climate-change'],
  ['ai', 'artificial-intelligence', 'machine-learning', 'ml', 'deep-learning', 'neural-network'],
  ['cybersecurity', 'security', 'infosec', 'cyber', 'hacking', 'vulnerability'],
  ['genetics', 'genomics', 'dna', 'gene', 'genome', 'hereditary', 'genetic'],
  ['psychology', 'mental-health', 'cognition', 'cognitive', 'behavioral', 'psychiatric'],
  ['energy', 'renewable', 'solar', 'wind', 'battery', 'electricity', 'power-generation'],
  ['education', 'learning', 'pedagogy', 'teaching', 'curriculum', 'academic'],
  ['economy', 'economics', 'economic', 'finance', 'financial', 'market', 'fiscal'],
  ['environment', 'ecology', 'ecological', 'ecosystem', 'biodiversity', 'conservation'],
  ['agriculture', 'farming', 'crop', 'soil', 'irrigation', 'agronomy'],
  ['pharmaceutical', 'drug', 'medication', 'pharma', 'therapeutic', 'treatment'],
  ['technology', 'tech', 'digital', 'computing', 'software', 'hardware'],
];

// Build a fast lookup: token → Set of related tokens
const SYNONYM_MAP = new Map();
for (const group of SYNONYM_GROUPS) {
  for (const term of group) {
    const lower = term.toLowerCase();
    if (!SYNONYM_MAP.has(lower)) SYNONYM_MAP.set(lower, new Set());
    for (const related of group) {
      SYNONYM_MAP.get(lower).add(related.toLowerCase());
    }
  }
}

/**
 * Expand a single token into itself plus all known synonyms.
 */
function expandToken(token) {
  const expanded = new Set([token]);
  const related = SYNONYM_MAP.get(token);
  if (related) {
    for (const r of related) expanded.add(r);
  }
  return expanded;
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
 * Tokenize a string: lowercase, split on non-alphanumeric, drop short tokens.
 */
function tokenize(str) {
  return (str || '').toLowerCase().split(/[\s\-_/,.;:()]+/).filter((t) => t.length > 1);
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
// Core index operations
// ---------------------------------------------------------------------------

/**
 * Load the research index (all completed research entries).
 */
function load() {
  if (!fs.existsSync(INDEX_FILE)) return { entries: [], updated: null };
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  } catch (_) {
    return { entries: [], updated: null };
  }
}

/**
 * Save the research index.
 */
function save(index) {
  index.updated = new Date().toISOString();
  fs.mkdirSync(RESEARCHLAB_DIR, { recursive: true });
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf8');
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
 *  - Exact token match in topic (3 pts, +1 bonus for early position)
 *  - Synonym match in topic (2 pts)
 *  - Exact token match in tags (2 pts)
 *  - Synonym match in tags (1 pt)
 *  - Exact match in searchTerms (1.5 pts)
 *  - Synonym match in searchTerms (0.75 pts)
 *  - Bigram match in topic (4 pts — phrase match is high signal)
 *  - Bigram match in tags/searchTerms (2.5 pts)
 */
function search(query) {
  const queryTokens = tokenize(query).filter((t) => t.length > 2);
  if (queryTokens.length === 0) return [];

  const queryBigrams = bigrams(queryTokens);

  // Expand each query token with synonyms
  const expandedSets = queryTokens.map((t) => expandToken(t));

  const entries = getAll();
  const scored = [];

  for (const entry of entries) {
    let score = 0;

    const topicLower = (entry.topic || '').toLowerCase();
    const topicTokens = tokenize(entry.topic);
    const tagStr = (entry.tags || []).join(' ').toLowerCase();
    const tagTokens = tokenize(tagStr);
    const searchTermsStr = (entry.searchTerms || []).join(' ').toLowerCase();
    const searchTermTokens = entry.searchTerms || [];

    // Build full text for bigram matching
    const topicFull = topicLower;
    const combinedFull = tagStr + ' ' + searchTermsStr;

    // Score each query token
    for (let qi = 0; qi < queryTokens.length; qi++) {
      const token = queryTokens[qi];
      const synonyms = expandedSets[qi];

      // --- Topic matching ---
      if (topicLower.includes(token)) {
        score += 3;
        // Position bonus: earlier match in topic = more relevant
        const pos = topicLower.indexOf(token);
        if (pos < topicLower.length * 0.5) score += 1;
      } else {
        // Check synonyms against topic tokens
        for (const syn of synonyms) {
          if (syn === token) continue;
          if (topicLower.includes(syn)) {
            score += 2;
            break;
          }
        }
      }

      // --- Tag matching ---
      if (tagStr.includes(token)) {
        score += 2;
      } else {
        for (const syn of synonyms) {
          if (syn === token) continue;
          if (tagStr.includes(syn)) {
            score += 1;
            break;
          }
        }
      }

      // --- searchTerms matching ---
      if (searchTermsStr.includes(token)) {
        score += 1.5;
      } else {
        for (const syn of synonyms) {
          if (syn === token) continue;
          if (searchTermsStr.includes(syn)) {
            score += 0.75;
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

    // Multi-token coverage bonus: reward entries matching many distinct tokens
    const distinctHits = queryTokens.filter((t) => {
      const syns = expandToken(t);
      const allText = topicLower + ' ' + tagStr + ' ' + searchTermsStr;
      for (const s of syns) {
        if (allText.includes(s)) return true;
      }
      return false;
    }).length;
    if (distinctHits > 1) {
      score += distinctHits * 0.5;
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

  return scored.map((s) => s.entry);
}

/**
 * Rebuild the index by scanning all project directories.
 * Useful if the index file was lost or corrupted.
 */
function rebuild() {
  const projectsDir = path.join(RESEARCHLAB_DIR, 'projects');
  if (!fs.existsSync(projectsDir)) return { entries: [], updated: null };

  const index = { entries: [], updated: null };
  const dirs = fs.readdirSync(projectsDir, { withFileTypes: true });

  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const projectFile = path.join(projectsDir, dir.name, 'project.json');
    const graphFile = path.join(projectsDir, dir.name, 'graph.json');

    if (!fs.existsSync(projectFile) || !fs.existsSync(graphFile)) continue;

    try {
      const project = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
      const graph = JSON.parse(fs.readFileSync(graphFile, 'utf8'));

      if (project.status !== 'complete') continue;

      record(project, graph);
    } catch (_) {
      // skip corrupted entries
    }
  }

  return load();
}

module.exports = { load, record, getAll, search, rebuild };
