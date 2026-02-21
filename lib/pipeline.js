'use strict';

const fs   = require('fs');
const path = require('path');
const strategos = require('./strategos');
const { validateGraph } = require('./graph-builder');
const store = require('./project-store');
const sources = require('./sources');
const researchIndex = require('./research-index');

const PROJECT_ROOT = 'research';
const TIMEOUT_MS   = 45 * 60 * 1000; // 45 minutes (synthesis of large graphs can take 20+min)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function projectDir(projectId) {
  return path.join(
    process.env.HOME || require('os').homedir(),
    '.researchlab', 'projects', projectId
  );
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJSON(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Chunk an array into groups of at most `size`.
 */
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Phase 1: PLANNING
// ---------------------------------------------------------------------------

async function phasePlanning(project, emitEvent) {
  emitEvent('phase', { phase: 'planning', status: 'started' });

  const dir = projectDir(project.id);
  ensureDir(dir);

  const taskDesc = [
    `PURPOSE: Break the research topic into sub-questions for parallel investigation.`,
    `TOPIC: "${project.topic}"`,
    `KEY TASKS: 1. Analyze the topic and identify 5-8 focused sub-questions that, answered together, provide comprehensive coverage. 2. For each sub-question, estimate what knowledge graph nodes and edges it will produce. 3. Write the output as JSON to: ${path.join(dir, 'plan.json')}`,
    `OUTPUT FORMAT (write this exact JSON structure): { "subQuestions": [ { "id": "q1", "question": "...", "scope": "brief description of what to investigate" } ], "expectedNodes": ["node-id-1", "node-id-2"], "expectedEdges": ["source->target", "source->target"] }`,
    `END STATE: plan.json exists at the path above and contains 5-8 sub-questions with node/edge estimates. Write the file, then signal done via Ralph.`
  ].join(' ');

  const spawnResult = await strategos.spawn(
    PROJECT_ROOT,
    `RESEARCH: plan "${project.topic}"`,
    project.projectPath || process.cwd(),
    project.parentWorkerId || null,
    taskDesc
  );

  const workerId = spawnResult.id || spawnResult.workerId;
  if (!workerId) throw new Error('Planning worker spawn failed: no worker id returned');

  emitEvent('worker', { phase: 'planning', workerId, action: 'spawned' });

  try {
    await strategos.waitForDone(workerId, TIMEOUT_MS);
  } catch (err) {
    throw new Error(`Planning phase failed: ${err.message}`);
  }

  emitEvent('worker', { phase: 'planning', workerId, action: 'done' });

  // Read the plan
  const planPath = path.join(dir, 'plan.json');
  if (!fs.existsSync(planPath)) {
    throw new Error('Planning worker completed but plan.json was not written');
  }

  const plan = readJSON(planPath);
  if (!plan.subQuestions || plan.subQuestions.length === 0) {
    throw new Error('plan.json contains no subQuestions');
  }

  // Clean up worker
  try { await strategos.deleteWorker(workerId); } catch { /* best effort */ }

  emitEvent('phase', { phase: 'planning', status: 'done', subQuestions: plan.subQuestions.length });
  return plan;
}

// ---------------------------------------------------------------------------
// Phase 2: RESEARCH (parallel workers)
// ---------------------------------------------------------------------------

async function phaseResearch(project, plan, emitEvent) {
  emitEvent('phase', { phase: 'researching', status: 'started', workerCount: 0 });

  const dir = projectDir(project.id);
  const researchDir = path.join(dir, PROJECT_ROOT);
  ensureDir(researchDir);

  // Match data sources relevant to this topic
  const matchedSources = sources.matchSources(project.topic);
  const sourcesBlock = sources.formatForWorker(matchedSources);

  // Check for prior research on related topics
  const priorResearch = researchIndex.search(project.topic);
  const priorBlock = priorResearch.length
    ? `PRIOR RESEARCH (related topics already investigated -- reference but do not duplicate): ${priorResearch.map((r) => r.topic + ' (' + r.stats.nodes + ' nodes, ' + r.stats.citations + ' citations)').join('; ')}`
    : '';

  // Distribute sub-questions across 3-5 workers (1-2 questions each)
  const questions = plan.subQuestions;
  const workerCount = Math.min(5, Math.max(3, Math.ceil(questions.length / 2)));
  const batches = chunk(questions, Math.ceil(questions.length / workerCount));

  emitEvent('phase', { phase: 'researching', status: 'spawning', workerCount: batches.length });

  const workers = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const outFile = path.join(researchDir, `worker-${i}.json`);

    const questionsBlock = batch.map(
      (q) => `[${q.id}] ${q.question}${q.scope ? ' (scope: ' + q.scope + ')' : ''}`
    ).join('; ');

    const taskParts = [
      `PURPOSE: Research specific sub-questions about "${project.topic}" and produce structured findings.`,
      `QUESTIONS TO ANSWER: ${questionsBlock}`,
      `KEY TASKS: 1. Research each question thoroughly. Use web searches, citations, quantitative data. 2. Where relevant, query structured data sources (APIs listed below) for specific numbers and datasets. 3. Write findings as JSON to: ${outFile}`,
    ];

    if (sourcesBlock) taskParts.push(sourcesBlock);
    if (priorBlock) taskParts.push(priorBlock);

    taskParts.push(
      `OUTPUT FORMAT (write this exact JSON structure): { "sections": [ { "questionId": "q1", "heading": "Short descriptive heading", "content": "Detailed prose with specific data, numbers, sources", "citations": [{"text": "Author (Year)", "url": "...", "pmid": "...", "year": "YYYY"}], "keyStats": ["stat1", "stat2"] } ] }`,
      `END STATE: ${outFile} exists with thorough, cited research sections for each assigned question. Write the file, then signal done via Ralph.`
    );

    const taskDesc = taskParts.join(' ');

    const spawnResult = await strategos.spawn(
      PROJECT_ROOT,
      `RESEARCH: worker-${i} "${project.topic}"`,
      project.projectPath || process.cwd(),
      project.parentWorkerId || null,
      taskDesc
    );

    const workerId = spawnResult.id || spawnResult.workerId;
    if (!workerId) throw new Error(`Research worker ${i} spawn failed`);

    workers.push({ index: i, workerId, outFile });
    emitEvent('worker', { phase: 'researching', workerId, index: i, action: 'spawned' });
  }

  // Wait for all research workers in parallel
  const results = await Promise.allSettled(
    workers.map(async (w) => {
      try {
        await strategos.waitForDone(w.workerId, TIMEOUT_MS);
        emitEvent('worker', { phase: 'researching', workerId: w.workerId, index: w.index, action: 'done' });
      } catch (err) {
        emitEvent('worker', { phase: 'researching', workerId: w.workerId, index: w.index, action: 'failed', error: err.message });
        throw err;
      }
    })
  );

  // Check for failures -- proceed if at least half succeeded
  const failures = results.filter((r) => r.status === 'rejected');
  const successes = results.filter((r) => r.status === 'fulfilled');

  if (failures.length > 0) {
    const msgs = failures.map((f) => f.reason?.message || String(f.reason));
    emitEvent('phase', { phase: 'researching', status: 'partial_failure', failed: failures.length, succeeded: successes.length, errors: msgs });
  }

  if (successes.length === 0) {
    throw new Error(`All ${failures.length} research worker(s) failed: ${failures.map((f) => f.reason?.message || String(f.reason)).join('; ')}`);
  }

  // Clean up workers
  for (const w of workers) {
    try { await strategos.deleteWorker(w.workerId); } catch { /* best effort */ }
  }

  // Collect output files that actually exist (skip failed workers)
  const researchFiles = [];
  for (const w of workers) {
    if (fs.existsSync(w.outFile)) {
      researchFiles.push(w.outFile);
    }
  }

  if (researchFiles.length === 0) {
    throw new Error('No research output files were produced');
  }

  emitEvent('phase', { phase: 'researching', status: 'done', fileCount: researchFiles.length });
  return researchFiles;
}

// ---------------------------------------------------------------------------
// Phase 3: SYNTHESIS
// ---------------------------------------------------------------------------

async function phaseSynthesis(project, plan, researchFiles, emitEvent) {
  emitEvent('phase', { phase: 'synthesizing', status: 'started' });

  const dir = projectDir(project.id);
  const graphPath = path.join(dir, 'graph.json');

  // List research files for the synthesis worker
  const fileList = researchFiles.join(', ');

  const taskDesc = [
    `PURPOSE: Synthesize all research into a knowledge graph in researchlab knowledge graph format.`,
    `TOPIC: "${project.topic}"`,
    `INPUT FILES: Plan: ${path.join(dir, 'plan.json')} -- Research: ${fileList}`,

    `KEY TASKS: 1. Read all research files. 2. Plan node/edge/topic structure. 3. Write graph.json using a Python script (MANDATORY -- do NOT use the Write tool for graph.json, it will exceed token limits). 4. Validate the output.`,

    `WRITING STRATEGY (CRITICAL -- follow exactly): Because the graph JSON is too large for a single Write tool call, you MUST use a Python script to build and write the JSON. Write a Python script that: (a) constructs nodes, edges, and topics as Python dicts/lists, (b) calls json.dump() to write ${graphPath}. Use the Bash tool to run: python3 /tmp/build_graph.py`,

    `GRAPH SCHEMA: { "nodes": [ { "id": "slug-id", "label": "UPPERCASE LABEL", "type": "domain|contaminant|health-effect|solution|product|context|investigation", "severity": "critical|high|moderate|low", "parent": "parent-node-id-if-any", "summary": "1-2 sentence summary", "keyStats": { "key": "value" } } ], "edges": [ { "source": "node-id", "target": "node-id", "label": "UPPERCASE VERB", "type": "causation|evidence|composition|solution|gap|context|investigation", "citation": "optional citation text" } ], "topics": { "node-id": { "title": "Topic Title", "sections": [{ "heading": "Section Heading", "content": "Detailed paragraph(s) -- aim for 500-1500 chars per section, preserving specific data and citations from research" }], "citations": [{ "text": "Author (Year)", "url": "...", "pmid": "...", "year": "YYYY" }] } } }`,

    `NODE TYPES: domain (top-level categories), contaminant (harmful substances), health-effect (health impacts), solution (actions/mitigations), product (specific products), context (background/regulatory), investigation (areas needing further study). EDGE TYPES: causation (A causes B), evidence (A is evidence for B), composition (A contains B), solution (A solves B), gap (knowledge gap), context (contextual relationship), investigation (needs investigation).`,

    `MANDATORY RULES: 1. Every node.label MUST be UPPERCASE. 2. Every edge.label MUST be UPPERCASE. 3. Node ids are kebab-case slugs. 4. Domain nodes have no parent; child nodes reference parent domain via "parent" field. 5. EVERY non-domain node MUST have a corresponding entry in the "topics" dict -- NO EXCEPTIONS. If you create a node, you MUST create its topic entry with at least one section of substantive content (not just the summary restated). 6. Topic sections must preserve specific data, statistics, and findings from the research files -- do not summarize away the detail. 7. Include all citations from the research that are relevant to each topic.`,

    `QUALITY CHECKS (verify before signaling done): 1. Count of topics entries == count of non-domain nodes (100% coverage required). 2. No dangling edges (every edge source/target must be a valid node id). 3. Every topic has at least 1 section with >200 chars of content.`,

    `END STATE: ${graphPath} exists with valid graph JSON where every non-domain node has a topics entry. Write the file via Python script, then signal done via Ralph.`
  ].join(' ');

  const spawnResult = await strategos.spawn(
    PROJECT_ROOT,
    `RESEARCH: synthesize "${project.topic}"`,
    project.projectPath || process.cwd(),
    project.parentWorkerId || null,
    taskDesc
  );

  const workerId = spawnResult.id || spawnResult.workerId;
  if (!workerId) throw new Error('Synthesis worker spawn failed');

  emitEvent('worker', { phase: 'synthesizing', workerId, action: 'spawned' });

  try {
    await strategos.waitForDone(workerId, TIMEOUT_MS);
  } catch (err) {
    throw new Error(`Synthesis phase failed: ${err.message}`);
  }

  emitEvent('worker', { phase: 'synthesizing', workerId, action: 'done' });

  // Clean up worker
  try { await strategos.deleteWorker(workerId); } catch { /* best effort */ }

  // Read and validate the graph
  if (!fs.existsSync(graphPath)) {
    throw new Error('Synthesis worker completed but graph.json was not written');
  }

  const graph = readJSON(graphPath);
  const validation = validateGraph(graph);

  if (!validation.valid) {
    emitEvent('validation', { valid: false, errors: validation.errors });
    // Write errors alongside graph for debugging
    writeJSON(path.join(dir, 'validation-errors.json'), validation.errors);
    // Non-fatal: graph exists but has issues
  } else {
    emitEvent('validation', { valid: true });
  }

  emitEvent('phase', {
    phase: 'synthesizing',
    status: 'done',
    nodeCount: graph.nodes?.length || 0,
    edgeCount: graph.edges?.length || 0,
    topicCount: Object.keys(graph.topics || {}).length
  });

  return graph;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Start the full research pipeline.
 *
 * @param {object} project - Must have: id, topic. Optional: projectPath, parentWorkerId.
 * @param {function} emitEvent - SSE emitter: emitEvent(type, data).
 * @returns {Promise<object>} The final graph.json data.
 */
async function start(project, emitEvent) {
  if (!project?.id || !project?.topic) {
    throw new Error('project must have id and topic');
  }
  if (typeof emitEvent !== 'function') {
    emitEvent = () => {}; // no-op if not provided
  }

  const dir = projectDir(project.id);
  ensureDir(dir);
  store.update(project.id, { status: 'planning', statusDetail: 'Pipeline started' });
  emitEvent('pipeline', { status: 'started', projectId: project.id, topic: project.topic });

  try {
    // Phase 1: Planning
    store.update(project.id, { status: 'planning', statusDetail: 'Phase 1: Planning' });
    const plan = await phasePlanning(project, emitEvent);
    writeJSON(path.join(dir, 'plan.json'), plan);

    // Phase 2: Research
    store.update(project.id, { status: 'researching', statusDetail: 'Phase 2: Research' });
    const researchFiles = await phaseResearch(project, plan, emitEvent);

    // Phase 3: Synthesis
    store.update(project.id, { status: 'synthesizing', statusDetail: 'Phase 3: Synthesis' });
    const graph = await phaseSynthesis(project, plan, researchFiles, emitEvent);

    store.update(project.id, { status: 'complete', statusDetail: 'Pipeline complete' });

    // Record in research index
    const matchedSources = sources.matchSources(project.topic);
    researchIndex.record(project, graph, {
      sourcesUsed: matchedSources.map((s) => s.id),
    });

    emitEvent('complete', {
      status: 'done',
      projectId: project.id,
      nodeCount: graph.nodes?.length || 0,
      edgeCount: graph.edges?.length || 0
    });

    return graph;
  } catch (err) {
    store.update(project.id, { status: 'error', statusDetail: err.message });
    emitEvent('error_event', { status: 'error', projectId: project.id, error: err.message });
    throw err;
  }
}

module.exports = { start };
