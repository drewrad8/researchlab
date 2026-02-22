'use strict';

// ---------------------------------------------------------------------------
// Knowledge graph builder
// ---------------------------------------------------------------------------

const VALID_NODE_TYPES = new Set([
  'domain', 'contaminant', 'health-effect', 'solution',
  'product', 'recommendation', 'context', 'investigation'
]);

const VALID_EDGE_TYPES = new Set([
  'causation', 'evidence', 'composition', 'addresses',
  'gap', 'contextualizes', 'investigates'
]);

// Old edge type names → new names (for backward compatibility)
const EDGE_TYPE_ALIASES = {
  'solution': 'addresses',
  'context': 'contextualizes',
  'investigation': 'investigates'
};

// Confidence category → numeric range mapping
const CONFIDENCE_RANGES = {
  verified:   { min: 0.85, max: 1.0 },
  plausible:  { min: 0.5,  max: 0.84 },
  unverified: { min: 0.2,  max: 0.49 },
  disputed:   { min: 0.05, max: 0.19 }
};

// Valid source→target node type combinations per edge type.
// '*' means any node type is allowed in that position.
const EDGE_CONSTRAINTS = {
  causation:      { source: ['contaminant', 'context'], target: ['health-effect'] },
  evidence:       { source: ['*'], target: ['*'] },
  composition:    { source: ['domain'], target: ['contaminant', 'solution', 'context', 'health-effect', 'product', 'recommendation', 'investigation'] },
  addresses:      { source: ['solution', 'product', 'recommendation'], target: ['health-effect', 'contaminant'] },
  gap:            { source: ['*'], target: ['*'] },
  contextualizes: { source: ['context'], target: ['*'] },
  investigates:   { source: ['investigation'], target: ['*'] }
};

/**
 * Resolve an edge type, normalizing old names to new names.
 * @param {string} type
 * @returns {string} normalized type
 */
function normalizeEdgeType(type) {
  return EDGE_TYPE_ALIASES[type] || type;
}

/**
 * Derive a default numeric confidence score from a categorical label.
 * Returns the midpoint of the range for the category.
 * @param {string} category - one of verified, plausible, unverified, disputed
 * @returns {number|undefined}
 */
function confidenceToScore(category) {
  const range = CONFIDENCE_RANGES[category];
  if (!range) return undefined;
  return Math.round(((range.min + range.max) / 2) * 100) / 100;
}

/**
 * Build a graph node.
 * Required: id, label, type.
 * Optional: severity, parent, summary, keyStats, confidenceScore (0-1).
 */
function buildNode(id, label, type, opts = {}) {
  if (!id || !label || !type) {
    throw new Error(`buildNode: id, label, type are required (got ${id}, ${label}, ${type})`);
  }
  if (!VALID_NODE_TYPES.has(type)) {
    throw new Error(`buildNode: invalid type "${type}". Valid: ${[...VALID_NODE_TYPES].join(', ')}`);
  }
  const node = { id, label, type };
  if (opts.severity)              node.severity              = opts.severity;
  if (opts.confidence)            node.confidence            = opts.confidence;
  if (opts.parent)                node.parent                = opts.parent;
  if (opts.summary)               node.summary               = opts.summary;
  if (opts.keyStats)              node.keyStats              = opts.keyStats;
  if (opts.investigationPathway)  node.investigationPathway  = opts.investigationPathway;
  if (opts.confidenceRationale)   node.confidenceRationale   = opts.confidenceRationale;

  // Numeric confidence score: use explicit value, or derive from categorical confidence
  if (typeof opts.confidenceScore === 'number') {
    node.confidenceScore = Math.max(0, Math.min(1, opts.confidenceScore));
  } else if (opts.confidence && CONFIDENCE_RANGES[opts.confidence]) {
    node.confidenceScore = confidenceToScore(opts.confidence);
  }

  return node;
}

/**
 * Build a graph edge.
 * Required: source, target, label, type.
 * Optional: citation (string or array of citation objects), confidence (0-1), weight (number).
 * Old edge type names (solution, context, investigation) are accepted and normalized.
 */
function buildEdge(source, target, label, type, opts = {}) {
  // Support legacy positional signature: buildEdge(source, target, label, type, citation)
  if (typeof opts === 'string' || Array.isArray(opts)) {
    opts = { citation: opts };
  }

  if (!source || !target || !label || !type) {
    throw new Error(`buildEdge: source, target, label, type are required`);
  }

  const normalized = normalizeEdgeType(type);
  if (!VALID_EDGE_TYPES.has(normalized)) {
    throw new Error(`buildEdge: invalid type "${type}". Valid: ${[...VALID_EDGE_TYPES].join(', ')}`);
  }

  const edge = { source, target, label, type: normalized };

  // Citation: accept string or array of citation objects
  if (opts.citation) {
    if (typeof opts.citation === 'string') {
      edge.citation = opts.citation;
    } else if (Array.isArray(opts.citation)) {
      edge.citation = opts.citation;
    }
  }

  // Edge-level confidence (0-1)
  if (typeof opts.confidence === 'number') {
    edge.confidence = Math.max(0, Math.min(1, opts.confidence));
  }

  // Edge weight (number of supporting sources)
  if (typeof opts.weight === 'number') {
    edge.weight = opts.weight;
  }

  return edge;
}

/**
 * Build a topic entry for the topics map.
 * @param {string} title
 * @param {Array<{heading: string, content: string, keyStats?: string[], chart?: string}>} sections
 * @param {Array<{text: string, url?: string, pmid?: string, year?: string}>} citations
 * @returns {object}
 */
function buildTopic(title, sections, citations) {
  if (!title) throw new Error('buildTopic: title is required');
  const topic = { title, sections: sections || [] };
  if (citations && citations.length > 0) {
    topic.citations = citations;
  }
  return topic;
}

/**
 * Build graph-level metadata.
 * @param {object} graph - the graph object with nodes, edges, topics
 * @param {object} opts - { topic, projectId, pipelineVersion }
 * @returns {object} metadata object
 */
function buildGraphMeta(graph, opts = {}) {
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  const topics = graph.topics || {};

  // Compute confidence distribution from nodes
  const confidenceDistribution = {};
  for (const n of nodes) {
    if (n.confidence) {
      confidenceDistribution[n.confidence] = (confidenceDistribution[n.confidence] || 0) + 1;
    }
  }

  return {
    topic: opts.topic || null,
    projectId: opts.projectId || null,
    createdAt: new Date().toISOString(),
    pipelineVersion: opts.pipelineVersion || null,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    topicCount: Object.keys(topics).length,
    confidenceDistribution
  };
}

/**
 * Compute topology metrics for a graph.
 * @param {object} graph - the graph object with nodes and edges
 * @returns {object} { density, averageDegree, connectedComponentCount }
 */
function computeTopologyMetrics(graph) {
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  const n = nodes.length;

  // Density = |edges| / (|nodes| * (|nodes| - 1)) for directed graphs
  const density = n > 1 ? edges.length / (n * (n - 1)) : 0;

  // Average degree = 2 * |edges| / |nodes| (undirected interpretation)
  const averageDegree = n > 0 ? (2 * edges.length) / n : 0;

  // Connected component count via union-find (treating graph as undirected)
  const parent = {};
  const nodeIds = nodes.map(nd => nd.id);
  for (const id of nodeIds) parent[id] = id;

  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  function union(a, b) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }

  for (const e of edges) {
    if (parent[e.source] !== undefined && parent[e.target] !== undefined) {
      union(e.source, e.target);
    }
  }

  const roots = new Set();
  for (const id of nodeIds) roots.add(find(id));
  const connectedComponentCount = n > 0 ? roots.size : 0;

  return {
    density: Math.round(density * 10000) / 10000,
    averageDegree: Math.round(averageDegree * 100) / 100,
    connectedComponentCount
  };
}

/**
 * Validate a complete graph object.
 * Returns { valid: boolean, errors: string[], warnings: string[] }.
 */
function validateGraph(graph) {
  const errors = [];
  const warnings = [];

  if (!graph || typeof graph !== 'object') {
    return { valid: false, errors: ['Graph must be a non-null object'], warnings: [] };
  }

  // --- nodes ---
  if (!Array.isArray(graph.nodes)) {
    errors.push('graph.nodes must be an array');
  } else {
    const nodeIds = new Set();
    const nodeTypeMap = {};
    for (let i = 0; i < graph.nodes.length; i++) {
      const n = graph.nodes[i];
      if (!n.id)    errors.push(`nodes[${i}]: missing id`);
      if (!n.label) errors.push(`nodes[${i}]: missing label`);
      if (!n.type)  errors.push(`nodes[${i}]: missing type`);
      else if (!VALID_NODE_TYPES.has(n.type)) {
        errors.push(`nodes[${i}]: invalid type "${n.type}"`);
      }
      if (n.id) {
        if (nodeIds.has(n.id)) errors.push(`nodes[${i}]: duplicate id "${n.id}"`);
        nodeIds.add(n.id);
        if (n.type) nodeTypeMap[n.id] = n.type;
      }
    }

    // Validate parent references
    for (let i = 0; i < graph.nodes.length; i++) {
      const n = graph.nodes[i];
      if (n.parent && !nodeIds.has(n.parent)) {
        errors.push(`nodes[${i}]: parent "${n.parent}" not found in nodes`);
      }
    }

    // --- edges ---
    if (!Array.isArray(graph.edges)) {
      errors.push('graph.edges must be an array');
    } else {
      for (let i = 0; i < graph.edges.length; i++) {
        const e = graph.edges[i];
        if (!e.source) errors.push(`edges[${i}]: missing source`);
        if (!e.target) errors.push(`edges[${i}]: missing target`);
        if (!e.label)  errors.push(`edges[${i}]: missing label`);
        if (!e.type)   errors.push(`edges[${i}]: missing type`);
        else {
          // Normalize old edge type names for validation
          const normalized = normalizeEdgeType(e.type);
          if (!VALID_EDGE_TYPES.has(normalized)) {
            errors.push(`edges[${i}]: invalid type "${e.type}"`);
          } else {
            // Edge type constraint validation (warnings, non-fatal)
            const constraint = EDGE_CONSTRAINTS[normalized];
            if (constraint && e.source && e.target) {
              const srcType = nodeTypeMap[e.source];
              const tgtType = nodeTypeMap[e.target];
              if (srcType && !constraint.source.includes('*') && !constraint.source.includes(srcType)) {
                warnings.push(`edges[${i}]: type "${normalized}" typically expects source type [${constraint.source.join(', ')}], got "${srcType}"`);
              }
              if (tgtType && !constraint.target.includes('*') && !constraint.target.includes(tgtType)) {
                warnings.push(`edges[${i}]: type "${normalized}" typically expects target type [${constraint.target.join(', ')}], got "${tgtType}"`);
              }
            }
          }
        }
        if (e.source && !nodeIds.has(e.source)) {
          errors.push(`edges[${i}]: source "${e.source}" not found in nodes`);
        }
        if (e.target && !nodeIds.has(e.target)) {
          errors.push(`edges[${i}]: target "${e.target}" not found in nodes`);
        }
      }

      // Connectivity check: warn about isolated non-domain nodes
      const connectedNodes = new Set();
      for (const e of graph.edges) {
        if (e.source) connectedNodes.add(e.source);
        if (e.target) connectedNodes.add(e.target);
      }
      const isolated = graph.nodes.filter(n => n.id && !connectedNodes.has(n.id) && n.type !== 'domain');
      if (isolated.length > 0) {
        warnings.push(`${isolated.length} isolated non-domain node(s): ${isolated.slice(0, 3).map(n => n.id).join(', ')}${isolated.length > 3 ? '...' : ''}`);
      }
    }
  }

  // --- topics ---
  if (!graph.topics || typeof graph.topics !== 'object') {
    errors.push('graph.topics must be an object');
  } else {
    for (const [key, topic] of Object.entries(graph.topics)) {
      if (!topic.title) errors.push(`topics["${key}"]: missing title`);
      if (!Array.isArray(topic.sections)) {
        errors.push(`topics["${key}"]: sections must be an array`);
      }
      if (topic.citations && !Array.isArray(topic.citations)) {
        errors.push(`topics["${key}"]: citations must be an array`);
      }
    }

    // Check topic coverage: every non-domain node should have a topic entry
    if (Array.isArray(graph.nodes)) {
      const nonDomain = graph.nodes.filter((n) => n.type !== 'domain');
      const missing = nonDomain.filter((n) => !graph.topics[n.id]);
      if (missing.length > 0) {
        const coverage = ((nonDomain.length - missing.length) / nonDomain.length * 100).toFixed(0);
        errors.push(`topic coverage: ${coverage}% (${missing.length} non-domain nodes missing topics: ${missing.slice(0, 5).map((n) => n.id).join(', ')}${missing.length > 5 ? '...' : ''})`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

module.exports = {
  buildNode,
  buildEdge,
  buildTopic,
  buildGraphMeta,
  validateGraph,
  computeTopologyMetrics,
  normalizeEdgeType,
  confidenceToScore,
  VALID_NODE_TYPES,
  VALID_EDGE_TYPES,
  EDGE_TYPE_ALIASES,
  EDGE_CONSTRAINTS,
  CONFIDENCE_RANGES
};
