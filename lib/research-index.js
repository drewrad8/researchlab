'use strict';

const fs   = require('fs');
const path = require('path');

const RESEARCHLAB_DIR = path.join(
  process.env.HOME || require('os').homedir(),
  '.researchlab'
);
const INDEX_FILE = path.join(RESEARCHLAB_DIR, 'index.json');

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
 * Search past research by topic keywords.
 * Useful for checking if a similar topic has already been researched.
 */
function search(query) {
  const queryLower = query.toLowerCase();
  const tokens = queryLower.split(/\s+/).filter((t) => t.length > 2);

  return getAll().filter((entry) => {
    const topicLower = (entry.topic || '').toLowerCase();
    const tagStr = (entry.tags || []).join(' ').toLowerCase();
    return tokens.some(
      (t) => topicLower.includes(t) || tagStr.includes(t)
    );
  });
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
