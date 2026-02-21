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
const VERIFY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes for verification workers

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
    `KEY TASKS: 1. Analyze the topic and identify 5-8 focused sub-questions that, answered together, provide comprehensive coverage. 2. ALWAYS include at least one sub-question specifically about actionable recommendations: what specific products, brands, routines, or actions should the user take based on the research? This question should investigate specific brand names and products, not just generic categories. 3. For each sub-question, estimate what knowledge graph nodes and edges it will produce. 4. Write the output as JSON to: ${path.join(dir, 'plan.json')}`,
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
      `KEY TASKS: 1. Research each question thoroughly. Use web searches, citations, quantitative data. 2. Where relevant, query structured data sources (APIs listed below) for specific numbers and datasets. 3. When the topic involves products, brands, or consumer decisions: research SPECIFIC brands and products by name. Check ingredient lists, verify marketing claims against evidence, look for FDA warning letters or consumer complaints, compare across brands. Do not just list generic categories -- name the actual products people should buy or avoid and explain why. 4. Write findings as JSON to: ${outFile}`,
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
// Phase 2.5: VERIFICATION (skeptical cross-referencing)
// ---------------------------------------------------------------------------

async function phaseVerification(project, plan, researchFiles, emitEvent) {
  emitEvent('phase', { phase: 'verifying', status: 'started' });

  const dir = projectDir(project.id);
  const verifyDir = path.join(dir, 'verification');
  ensureDir(verifyDir);

  // Match data sources for verification (use all available, not just top 3)
  const matchedSources = sources.matchSources(project.topic, 10);
  const sourcesBlock = sources.formatForWorker(matchedSources);

  // Read all research files to build the claims manifest
  const allResearch = [];
  for (const f of researchFiles) {
    try { allResearch.push(readJSON(f)); } catch { /* skip corrupted */ }
  }

  // Worker 1: Claim extraction and cross-referencing
  const claimsOutFile = path.join(verifyDir, 'claims-audit.json');
  const claimsTaskDesc = [
    `PURPOSE: Extract every factual claim from the research and verify each against independent sources. Be maximally skeptical -- assume nothing is true until proven by multiple independent sources.`,
    `TOPIC: "${project.topic}"`,
    `RESEARCH FILES TO AUDIT: ${researchFiles.join(', ')}`,
    `KEY TASKS:`,
    `1. Read all research files. Extract every factual claim that includes a specific number, statistic, date, causal relationship, or mechanism.`,
    `2. For EACH claim, attempt to verify it via web search using at least 2 independent sources that are NOT the original citation. Look for: the original study (check sample size, methodology, funding), replication studies, contradicting evidence, meta-analyses.`,
    `3. Assess each claim's confidence: VERIFIED (2+ independent confirmations), PLAUSIBLE (1 independent confirmation), UNVERIFIED (no independent confirmation found), DISPUTED (contradicting evidence found), RETRACTED (source was retracted or corrected).`,
    `4. Check data source reliability: for each cited source, check if it's peer-reviewed, check for retractions, check author credentials and funding conflicts, check the journal's impact factor or reputation.`,
    `5. Write the audit to: ${claimsOutFile}`,
    sourcesBlock ? `AVAILABLE DATA SOURCES FOR CROSS-REFERENCE: ${sourcesBlock}` : '',
    `OUTPUT FORMAT: { "claims": [ { "id": "c1", "text": "the claim text", "originalCitation": "Author (Year)", "originalSource": "where this appeared in research", "confidence": "VERIFIED|PLAUSIBLE|UNVERIFIED|DISPUTED|RETRACTED", "verificationSources": [ { "text": "Independent source", "url": "...", "agrees": true/false, "notes": "..." } ], "sourceReliability": { "peerReviewed": true/false, "sampleSize": "N=...", "fundingConflicts": "none|description", "retractionStatus": "none|retracted|corrected", "journalReputation": "high|medium|low|predatory" }, "notes": "any qualifications, caveats, or context" } ], "summary": { "total": N, "verified": N, "plausible": N, "unverified": N, "disputed": N, "retracted": N } }`,
    `END STATE: ${claimsOutFile} exists with a thorough audit of every factual claim. Every claim with a specific number or causal mechanism MUST be checked. Write the file, then signal done via Ralph.`
  ].filter(Boolean).join(' ');

  // Worker 2: Contradictions and gaps analysis
  const gapsOutFile = path.join(verifyDir, 'gaps-contradictions.json');
  const gapsTaskDesc = [
    `PURPOSE: Find contradictions between research findings and identify knowledge gaps where evidence is weak or missing.`,
    `TOPIC: "${project.topic}"`,
    `RESEARCH FILES TO ANALYZE: ${researchFiles.join(', ')}`,
    `KEY TASKS:`,
    `1. Read all research files. Identify any places where different workers' findings contradict each other.`,
    `2. Search for recent systematic reviews, meta-analyses, and Cochrane reviews on the topic to find the current scientific consensus.`,
    `3. Identify where the research makes strong claims but the underlying evidence is weak (small sample sizes, single studies, animal-only data, in-vitro only).`,
    `4. Flag any citations that appear to be from predatory journals, preprints that were never peer-reviewed, or sources with known bias.`,
    `5. Identify gaps: important questions the research should have addressed but didn't.`,
    `6. Write the analysis to: ${gapsOutFile}`,
    `OUTPUT FORMAT: { "contradictions": [ { "id": "x1", "claim1": "...", "source1": "...", "claim2": "...", "source2": "...", "resolution": "which is more likely correct and why", "confidenceInResolution": "high|medium|low" } ], "weakEvidence": [ { "claim": "...", "weakness": "description of why evidence is weak", "strengthOfClaim": "strong|moderate|weak|very-weak" } ], "suspectSources": [ { "citation": "...", "reason": "predatory journal|preprint|biased|retracted|...", "recommendation": "keep|downgrade|remove" } ], "gaps": [ { "question": "...", "importance": "critical|high|medium|low" } ] }`,
    `END STATE: ${gapsOutFile} exists with thorough contradiction, weak-evidence, and gap analysis. Write the file, then signal done via Ralph.`
  ].join(' ');

  // Spawn both verification workers in parallel
  const verifyWorkers = [];

  const claimsSpawn = await strategos.spawn(
    PROJECT_ROOT,
    `REVIEW: verify claims "${project.topic}"`,
    project.projectPath || process.cwd(),
    project.parentWorkerId || null,
    claimsTaskDesc
  );
  const claimsWorkerId = claimsSpawn.id || claimsSpawn.workerId;
  if (!claimsWorkerId) throw new Error('Claims verification worker spawn failed');
  verifyWorkers.push({ label: 'claims', workerId: claimsWorkerId, outFile: claimsOutFile });
  emitEvent('worker', { phase: 'verifying', workerId: claimsWorkerId, label: 'claims', action: 'spawned' });

  const gapsSpawn = await strategos.spawn(
    PROJECT_ROOT,
    `REVIEW: gaps and contradictions "${project.topic}"`,
    project.projectPath || process.cwd(),
    project.parentWorkerId || null,
    gapsTaskDesc
  );
  const gapsWorkerId = gapsSpawn.id || gapsSpawn.workerId;
  if (!gapsWorkerId) throw new Error('Gaps analysis worker spawn failed');
  verifyWorkers.push({ label: 'gaps', workerId: gapsWorkerId, outFile: gapsOutFile });
  emitEvent('worker', { phase: 'verifying', workerId: gapsWorkerId, label: 'gaps', action: 'spawned' });

  // Wait for both
  const results = await Promise.allSettled(
    verifyWorkers.map(async (w) => {
      try {
        await strategos.waitForDone(w.workerId, VERIFY_TIMEOUT_MS);
        emitEvent('worker', { phase: 'verifying', workerId: w.workerId, label: w.label, action: 'done' });
      } catch (err) {
        emitEvent('worker', { phase: 'verifying', workerId: w.workerId, label: w.label, action: 'failed', error: err.message });
        throw err;
      }
    })
  );

  // Clean up workers
  for (const w of verifyWorkers) {
    try { await strategos.deleteWorker(w.workerId); } catch { /* best effort */ }
  }

  // Collect outputs
  const verificationFiles = [];
  for (const w of verifyWorkers) {
    if (fs.existsSync(w.outFile)) {
      verificationFiles.push(w.outFile);
    }
  }

  // Summarize verification results for synthesis
  let verificationSummary = '';
  if (fs.existsSync(claimsOutFile)) {
    try {
      const audit = readJSON(claimsOutFile);
      const s = audit.summary || {};
      verificationSummary += `CLAIMS AUDIT: ${s.total || '?'} claims checked. ${s.verified || 0} verified, ${s.plausible || 0} plausible, ${s.unverified || 0} unverified, ${s.disputed || 0} disputed, ${s.retracted || 0} retracted. `;
    } catch { /* skip */ }
  }
  if (fs.existsSync(gapsOutFile)) {
    try {
      const gaps = readJSON(gapsOutFile);
      const contCount = (gaps.contradictions || []).length;
      const weakCount = (gaps.weakEvidence || []).length;
      const suspectCount = (gaps.suspectSources || []).length;
      const gapCount = (gaps.gaps || []).length;
      verificationSummary += `GAPS ANALYSIS: ${contCount} contradictions, ${weakCount} weak-evidence claims, ${suspectCount} suspect sources, ${gapCount} knowledge gaps identified.`;
    } catch { /* skip */ }
  }

  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length > 0) {
    emitEvent('phase', { phase: 'verifying', status: 'partial_failure', failed: failures.length });
  }

  emitEvent('phase', {
    phase: 'verifying',
    status: 'done',
    verificationFiles: verificationFiles.length,
    summary: verificationSummary
  });

  return { verificationFiles, verificationSummary };
}

// ---------------------------------------------------------------------------
// Phase 3: SYNTHESIS
// ---------------------------------------------------------------------------

async function phaseSynthesis(project, plan, researchFiles, emitEvent, verification) {
  emitEvent('phase', { phase: 'synthesizing', status: 'started' });

  const dir = projectDir(project.id);
  const graphPath = path.join(dir, 'graph.json');

  // List research files for the synthesis worker
  const fileList = researchFiles.join(', ');

  // Build verification context for the synthesis worker
  const verifyFiles = (verification && verification.verificationFiles) || [];
  const verifySummary = (verification && verification.verificationSummary) || '';
  const verifyBlock = verifyFiles.length
    ? `VERIFICATION DATA (CRITICAL -- you MUST incorporate this): Verification files: ${verifyFiles.join(', ')}. Summary: ${verifySummary}. RULES FOR USING VERIFICATION DATA: 1. Read the claims-audit.json and gaps-contradictions.json files. 2. For any claim marked DISPUTED or RETRACTED, either exclude it from the graph or add an "investigation" node explaining the dispute. 3. For claims marked UNVERIFIED, include them but add a "confidence" field to the node set to "unverified" and note this in the topic text. 4. For suspect sources flagged for removal, do not cite them. For those flagged for downgrade, note the qualification. 5. Add "investigation" type nodes for critical knowledge gaps identified. 6. In topic sections, explicitly note the confidence level of key claims (e.g., "Multiple RCTs confirm..." vs "A single small study suggests..."). 7. Never present an unverified or disputed claim as established fact.`
    : '';

  const taskDesc = [
    `PURPOSE: Synthesize all research into a knowledge graph in researchlab knowledge graph format. Incorporate verification findings to ensure accuracy.`,
    `TOPIC: "${project.topic}"`,
    `INPUT FILES: Plan: ${path.join(dir, 'plan.json')} -- Research: ${fileList}`,

    verifyBlock,

    `KEY TASKS: 1. Read all research files AND verification files. 2. Plan node/edge/topic structure, accounting for verification confidence levels. 3. Write graph.json using a Python script (MANDATORY -- do NOT use the Write tool for graph.json, it will exceed token limits). 4. Validate the output.`,

    `WRITING STRATEGY (CRITICAL -- follow exactly): Because the graph JSON is too large for a single Write tool call, you MUST use a Python script to build and write the JSON. Write a Python script that: (a) constructs nodes, edges, and topics as Python dicts/lists, (b) calls json.dump() to write ${graphPath}. Use the Bash tool to run: python3 /tmp/build_graph.py`,

    `GRAPH SCHEMA: { "nodes": [ { "id": "slug-id", "label": "UPPERCASE LABEL", "type": "domain|contaminant|health-effect|solution|product|context|investigation", "severity": "critical|high|moderate|low", "confidence": "verified|plausible|unverified|disputed", "parent": "parent-node-id-if-any", "summary": "1-2 sentence summary", "keyStats": { "key": "value" } } ], "edges": [ { "source": "node-id", "target": "node-id", "label": "UPPERCASE VERB", "type": "causation|evidence|composition|solution|gap|context|investigation", "citation": "optional citation text" } ], "topics": { "node-id": { "title": "Topic Title", "sections": [{ "heading": "Section Heading", "content": "Detailed paragraph(s) -- aim for 500-1500 chars per section, preserving specific data and citations from research" }], "citations": [{ "text": "Author (Year)", "url": "...", "pmid": "...", "year": "YYYY" }] } } }`,

    `NODE TYPES: domain (top-level categories), contaminant (harmful substances), health-effect (health impacts), solution (actions/mitigations), product (specific products with brand names), recommendation (actionable next-step for the user), context (background/regulatory), investigation (areas needing further study). EDGE TYPES: causation (A causes B), evidence (A is evidence for B), composition (A contains B), solution (A solves B), gap (knowledge gap), context (contextual relationship), investigation (needs investigation).`,

    `ACTIONABLE RECOMMENDATIONS (MANDATORY): The graph MUST include a "recommendations" domain node with child "recommendation" type nodes. These are the most important output -- they tell the user exactly what to DO based on the research. For each recommendation: 1. Include SPECIFIC brand names and product names -- not just generic categories. Research which brands are reputable and which make unsubstantiated claims. 2. Include a "routine" or "action-plan" node if the topic involves a practice (skincare routine, diet plan, exercise regimen, etc.) with step-by-step instructions. 3. In the topic sections for recommendation nodes, include: WHY this product/action is recommended (cite the research), WHICH specific brands/products to buy (with reasoning for why THESE brands over others), WHAT to avoid (specific brands/products that make false claims or use harmful ingredients), and WHERE to buy (general availability -- drugstore, specialty, online). 4. Investigate brand claims skeptically: cross-reference marketed ingredients against actual ingredient lists, check for FDA warning letters, check consumer complaints. A brand saying "natural" or "clinically proven" means nothing without evidence.`,

    `MANDATORY RULES: 1. Every node.label MUST be UPPERCASE. 2. Every edge.label MUST be UPPERCASE. 3. Node ids are kebab-case slugs. 4. Domain nodes have no parent; child nodes reference parent domain via "parent" field. 5. EVERY non-domain node MUST have a corresponding entry in the "topics" dict -- NO EXCEPTIONS. If you create a node, you MUST create its topic entry with at least one section of substantive content (not just the summary restated). 6. Topic sections must preserve specific data, statistics, and findings from the research files -- do not summarize away the detail. 7. Include all citations from the research that are relevant to each topic. 8. Nodes with "confidence" field set to "unverified" or "disputed" MUST have their topic sections clearly note this uncertainty. 9. The recommendations domain MUST exist with at least 3 actionable recommendation child nodes.`,

    `QUALITY CHECKS (verify before signaling done): 1. Count of topics entries == count of non-domain nodes (100% coverage required). 2. No dangling edges (every edge source/target must be a valid node id). 3. Every topic has at least 1 section with >200 chars of content. 4. No DISPUTED or RETRACTED claims presented as established fact. 5. Recommendations domain exists with actionable, brand-specific product nodes.`,

    `END STATE: ${graphPath} exists with valid graph JSON where every non-domain node has a topics entry, verification confidence is reflected, and actionable recommendations with specific brands/products are included. Write the file via Python script, then signal done via Ralph.`
  ].filter(Boolean).join(' ');

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

    // Phase 2.5: Verification
    store.update(project.id, { status: 'verifying', statusDetail: 'Phase 2.5: Verification' });
    const verification = await phaseVerification(project, plan, researchFiles, emitEvent);

    // Phase 3: Synthesis (with verification data)
    store.update(project.id, { status: 'synthesizing', statusDetail: 'Phase 3: Synthesis' });
    const graph = await phaseSynthesis(project, plan, researchFiles, emitEvent, verification);

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
