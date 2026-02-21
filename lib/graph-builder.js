'use strict';

// ---------------------------------------------------------------------------
// Knowledge graph builder
// ---------------------------------------------------------------------------

const VALID_NODE_TYPES = new Set([
  'domain', 'contaminant', 'health-effect', 'solution',
  'product', 'recommendation', 'context', 'investigation'
]);

const VALID_EDGE_TYPES = new Set([
  'causation', 'evidence', 'composition', 'solution',
  'gap', 'context', 'investigation'
]);

/**
 * Build a graph node.
 * Required: id, label, type.
 * Optional: severity, parent, summary, keyStats.
 */
function buildNode(id, label, type, opts = {}) {
  if (!id || !label || !type) {
    throw new Error(`buildNode: id, label, type are required (got ${id}, ${label}, ${type})`);
  }
  if (!VALID_NODE_TYPES.has(type)) {
    throw new Error(`buildNode: invalid type "${type}". Valid: ${[...VALID_NODE_TYPES].join(', ')}`);
  }
  const node = { id, label: label.toUpperCase(), type };
  if (opts.severity)              node.severity              = opts.severity;
  if (opts.confidence)            node.confidence            = opts.confidence;
  if (opts.parent)                node.parent                = opts.parent;
  if (opts.summary)               node.summary               = opts.summary;
  if (opts.keyStats)              node.keyStats              = opts.keyStats;
  if (opts.investigationPathway)  node.investigationPathway  = opts.investigationPathway;
  if (opts.confidenceRationale)   node.confidenceRationale   = opts.confidenceRationale;
  return node;
}

/**
 * Build a graph edge.
 * Required: source, target, label, type.
 * Optional: citation.
 */
function buildEdge(source, target, label, type, citation) {
  if (!source || !target || !label || !type) {
    throw new Error(`buildEdge: source, target, label, type are required`);
  }
  if (!VALID_EDGE_TYPES.has(type)) {
    throw new Error(`buildEdge: invalid type "${type}". Valid: ${[...VALID_EDGE_TYPES].join(', ')}`);
  }
  const edge = { source, target, label: label.toUpperCase(), type };
  if (citation) edge.citation = citation;
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
 * Validate a complete graph object.
 * Returns { valid: boolean, errors: string[] }.
 */
function validateGraph(graph) {
  const errors = [];

  if (!graph || typeof graph !== 'object') {
    return { valid: false, errors: ['Graph must be a non-null object'] };
  }

  // --- nodes ---
  if (!Array.isArray(graph.nodes)) {
    errors.push('graph.nodes must be an array');
  } else {
    const nodeIds = new Set();
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
        else if (!VALID_EDGE_TYPES.has(e.type)) {
          errors.push(`edges[${i}]: invalid type "${e.type}"`);
        }
        if (e.source && !nodeIds.has(e.source)) {
          errors.push(`edges[${i}]: source "${e.source}" not found in nodes`);
        }
        if (e.target && !nodeIds.has(e.target)) {
          errors.push(`edges[${i}]: target "${e.target}" not found in nodes`);
        }
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

  return { valid: errors.length === 0, errors };
}

module.exports = {
  buildNode,
  buildEdge,
  buildTopic,
  validateGraph,
  VALID_NODE_TYPES,
  VALID_EDGE_TYPES
};
