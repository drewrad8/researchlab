'use strict';

const fs   = require('fs');
const path = require('path');
const strategos = require('./strategos');
const { validateGraph } = require('./graph-builder');
const store = require('./project-store');
const sources = require('./sources');
const researchIndex = require('./research-index');
const investigationTree = require('./investigation-tree');

const PROJECT_ROOT = 'research';
const TIMEOUT_MS   = 45 * 60 * 1000; // 45 minutes
const ADJUDICATE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

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

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/**
 * Load prior research and extract enriched summaries from graph.json files.
 * Returns topic names plus recommendation/product/solution node summaries.
 */
function loadPriorResearchEnriched(topic) {
  const priorResearch = researchIndex.search(topic);
  if (!priorResearch.length) return '';

  const parts = [];
  for (const entry of priorResearch.slice(0, 5)) {
    let detail = `${entry.topic} (${entry.stats.nodes} nodes, ${entry.stats.citations} citations)`;

    // Try to load the actual graph.json and extract key findings
    try {
      const graphPath = path.join(
        process.env.HOME || require('os').homedir(),
        '.researchlab', 'projects', entry.projectId, 'graph.json'
      );
      if (fs.existsSync(graphPath)) {
        const graph = readJSON(graphPath);
        const keyNodes = (graph.nodes || [])
          .filter(n => ['recommendation', 'product', 'solution'].includes(n.type))
          .slice(0, 8)
          .map(n => `${n.label}: ${n.summary || 'no summary'}`)
          .join('; ');
        if (keyNodes) {
          detail += ` -- Key findings: ${keyNodes}`;
        }
      }
    } catch { /* skip if graph can't be read */ }

    parts.push(detail);
  }

  return `PRIOR RESEARCH (related topics already investigated -- reference but do not duplicate): ${parts.join(' | ')}`;
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
    `KEY TASKS: 1. Analyze the topic and identify 5-8 focused sub-questions that, answered together, provide comprehensive coverage. 2. ALWAYS include at least one sub-question specifically about actionable recommendations: what specific products, brands, routines, or actions should the user take based on the research? 3. For each sub-question, estimate what knowledge graph nodes and edges it will produce. 4. For each sub-question, list expectedEvidenceTypes -- the types of evidence likely to be encountered (SCI=scientific study, GOV=government data, ORG=organizational claim, EXP=expert opinion, STA=statistical claim, FIN=financial data, DOC=document/record, MED=media report, HIS=historical claim, TES=testimonial, TEC=technical/product claim). 5. Write the output as JSON to: ${path.join(dir, 'plan.json')}`,
    `OUTPUT FORMAT (write this exact JSON structure): { "subQuestions": [ { "id": "q1", "question": "...", "scope": "brief description of what to investigate", "expectedEvidenceTypes": ["SCI", "GOV", "TEC"] } ], "expectedNodes": ["node-id-1", "node-id-2"], "expectedEdges": ["source->target", "source->target"] }`,
    `END STATE: plan.json exists at the path above and contains 5-8 sub-questions with node/edge estimates and expectedEvidenceTypes. Write the file, then signal done via Ralph.`
  ].join(' ');

  const spawnResult = await strategos.spawn(
    PROJECT_ROOT,
    `RESEARCH: plan "${project.topic}"`,
    project.projectPath || process.cwd(),
    project.parentWorkerId || null,
    taskDesc.length > 9500 ? taskDesc.slice(0, 9500) : taskDesc
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

  const planPath = path.join(dir, 'plan.json');
  if (!fs.existsSync(planPath)) {
    throw new Error('Planning worker completed but plan.json was not written');
  }

  const plan = readJSON(planPath);
  if (!plan.subQuestions || plan.subQuestions.length === 0) {
    throw new Error('plan.json contains no subQuestions');
  }

  try { await strategos.deleteWorker(workerId); } catch { /* best effort */ }

  emitEvent('phase', { phase: 'planning', status: 'done', subQuestions: plan.subQuestions.length });
  return plan;
}

// ---------------------------------------------------------------------------
// Phase 2: CLASSIFY (new — evidence type classification)
// ---------------------------------------------------------------------------

async function phaseClassify(project, plan, emitEvent) {
  emitEvent('phase', { phase: 'classifying', status: 'started' });

  const dir = projectDir(project.id);
  const evidenceDir = path.join(dir, 'evidence');
  ensureDir(evidenceDir);

  // Match data sources relevant to this topic
  const matchedSources = sources.matchSources(project.topic);
  const sourcesBlock = sources.formatForWorker(matchedSources);

  // Load enriched prior research
  const priorBlock = loadPriorResearchEnriched(project.topic);

  // Distribute sub-questions across 3-5 workers
  const questions = plan.subQuestions;
  const workerCount = Math.min(5, Math.max(3, Math.ceil(questions.length / 2)));
  const batches = chunk(questions, Math.ceil(questions.length / workerCount));

  emitEvent('phase', { phase: 'classifying', status: 'spawning', workerCount: batches.length });

  const classificationDecisionTree = [
    'EVIDENCE TYPE CLASSIFICATION DECISION TREE (follow exactly):',
    'Is it a published research study (journal article, preprint, thesis)? YES → SCI',
    'Is it data from a government agency or regulatory body? YES → GOV',
    'Is it a claim made by an organization (company, NGO, institution)?',
    '  Is the claim primarily about a product specs or ingredients? YES → TEC, NO → ORG',
    'Is it a statement by a named expert citing their expertise? YES → EXP',
    'Is it primarily a specific number, percentage, or statistic? YES → STA',
    'Does it involve money, funding, or financial relationships? YES → FIN',
    'Is it a primary document (legal filing, contract, memo, patent)? YES → DOC',
    'Is it a news/media report? YES → MED',
    'Is it a claim about historical events? YES → HIS',
    'Is it a personal account, testimonial, or review? YES → TES',
    'Default → MED'
  ].join(' ');

  const workers = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const outFile = path.join(evidenceDir, `manifest-${i}.json`);

    const questionsBlock = batch.map(
      (q) => `[${q.id}] ${q.question}${q.scope ? ' (scope: ' + q.scope + ')' : ''}${q.expectedEvidenceTypes ? ' (expected types: ' + q.expectedEvidenceTypes.join(', ') + ')' : ''}`
    ).join('; ');

    const taskParts = [
      `PURPOSE: Perform initial broad research on sub-questions about "${project.topic}" and classify all encountered evidence by type using the evidence taxonomy.`,
      `QUESTIONS TO RESEARCH: ${questionsBlock}`,
      classificationDecisionTree,
      `KEY TASKS: 1. For each sub-question, perform a broad search to find all relevant evidence. 2. Classify each piece of evidence into exactly one primary type using the decision tree above. 3. Rate each source's reliability (A=Established, B=Generally Reliable, C=Mixed Record, D=Questionable, E=Unreliable, F=Unknown). 4. Rate each piece of information's credibility (1=Confirmed, 2=Probably True, 3=Possibly True, 4=Doubtful, 5=Improbable, 6=Cannot Judge). 5. Write the evidence manifest as JSON to: ${outFile}`,
    ];

    if (sourcesBlock) taskParts.push(sourcesBlock);
    if (priorBlock) taskParts.push(priorBlock);

    taskParts.push(
      `OUTPUT FORMAT (write this exact JSON structure): { "subQuestionId": "${batch[0].id}", "subQuestions": [${batch.map(q => '"' + q.id + '"').join(', ')}], "evidenceItems": [ { "id": "e1", "type": "SCI|GOV|ORG|EXP|STA|FIN|DOC|MED|HIS|TES|TEC", "sourceRating": "A|B|C|D|E|F", "infoRating": "1|2|3|4|5|6", "description": "Brief description of the evidence", "citation": { "text": "Author (Year)", "url": "...", "pmid": "..." }, "triggeredPathway": "P-SCI|P-GOV|P-ORG|P-EXP|P-STA|P-FIN|P-DOC|P-MED|P-HIS|P-TES|P-TEC" } ] }`,
      `PATHWAY MAPPING: SCI→P-SCI, GOV→P-GOV, ORG→P-ORG, EXP→P-EXP, STA→P-STA, FIN→P-FIN, DOC→P-DOC, MED→P-MED, HIS→P-HIS, TES→P-TES, TEC→P-TEC`,
      `END STATE: ${outFile} exists with classified evidence items for each assigned sub-question. Each evidence item has a type, source/info ratings, and triggered pathway. Write the file, then signal done via Ralph.`
    );

    let taskDesc = taskParts.join(' ');
    if (taskDesc.length > 9500) taskDesc = taskDesc.slice(0, 9500);

    const spawnResult = await strategos.spawn(
      PROJECT_ROOT,
      `RESEARCH: classify-${i} "${project.topic}"`,
      project.projectPath || process.cwd(),
      project.parentWorkerId || null,
      taskDesc
    );

    const workerId = spawnResult.id || spawnResult.workerId;
    if (!workerId) throw new Error(`Classification worker ${i} spawn failed`);

    workers.push({ index: i, workerId, outFile });
    emitEvent('worker', { phase: 'classifying', workerId, index: i, action: 'spawned' });
  }

  // Wait for all classification workers
  const results = await Promise.allSettled(
    workers.map(async (w) => {
      try {
        await strategos.waitForDone(w.workerId, TIMEOUT_MS);
        emitEvent('worker', { phase: 'classifying', workerId: w.workerId, index: w.index, action: 'done' });
      } catch (err) {
        emitEvent('worker', { phase: 'classifying', workerId: w.workerId, index: w.index, action: 'failed', error: err.message });
        throw err;
      }
    })
  );

  const failures = results.filter((r) => r.status === 'rejected');
  const successes = results.filter((r) => r.status === 'fulfilled');

  if (failures.length > 0) {
    emitEvent('phase', { phase: 'classifying', status: 'partial_failure', failed: failures.length, succeeded: successes.length });
  }

  if (successes.length === 0) {
    throw new Error(`All ${failures.length} classification worker(s) failed`);
  }

  // Clean up workers
  for (const w of workers) {
    try { await strategos.deleteWorker(w.workerId); } catch { /* best effort */ }
  }

  // Collect manifests
  const manifests = [];
  for (const w of workers) {
    if (fs.existsSync(w.outFile)) {
      try {
        manifests.push(readJSON(w.outFile));
      } catch { /* skip corrupted */ }
    }
  }

  if (manifests.length === 0) {
    throw new Error('No evidence manifests were produced');
  }

  // Count total evidence items
  const totalEvidence = manifests.reduce(
    (acc, m) => acc + (m.evidenceItems ? m.evidenceItems.length : 0), 0
  );

  emitEvent('phase', {
    phase: 'classifying', status: 'done',
    manifestCount: manifests.length, totalEvidence
  });

  return manifests;
}

// ---------------------------------------------------------------------------
// Phase 3: INVESTIGATE (investigation tree execution)
// ---------------------------------------------------------------------------

async function phaseInvestigate(project, manifests, emitEvent) {
  emitEvent('phase', { phase: 'investigating', status: 'started' });

  const dir = projectDir(project.id);

  const pathwayResults = await investigationTree.runInvestigationPhase(
    dir, manifests, emitEvent,
    { parentWorkerId: project.parentWorkerId, projectPath: project.projectPath || process.cwd() }
  );

  emitEvent('phase', {
    phase: 'investigating', status: 'done',
    pathwayCount: pathwayResults.length
  });

  return pathwayResults;
}

// ---------------------------------------------------------------------------
// Phase 4: ADJUDICATE (confidence scoring + contrarian + reconciliation)
// ---------------------------------------------------------------------------

async function phaseAdjudicate(project, plan, manifests, pathwayResults, emitEvent) {
  emitEvent('phase', { phase: 'adjudicating', status: 'started' });

  const dir = projectDir(project.id);
  const adjDir = path.join(dir, 'adjudication');
  ensureDir(adjDir);

  // Build a map from evidence ID to pathway results
  const evidenceResultMap = new Map();
  const allEvidence = [];
  for (const manifest of manifests) {
    if (manifest.evidenceItems) {
      for (const item of manifest.evidenceItems) {
        allEvidence.push(item);
      }
    }
  }

  for (let i = 0; i < pathwayResults.length && i < allEvidence.length; i++) {
    evidenceResultMap.set(allEvidence[i].id, pathwayResults[i]);
  }

  // For each sub-question, produce adjudicated evidence
  const questions = plan.subQuestions || [];
  const adjudicatedFiles = [];

  for (let qi = 0; qi < questions.length; qi++) {
    const q = questions[qi];
    const outFile = path.join(adjDir, `${q.id}-adjudicated.json`);

    // Collect evidence items for this sub-question
    const qEvidence = [];
    for (const manifest of manifests) {
      if (!manifest.evidenceItems) continue;
      const subs = manifest.subQuestions || [manifest.subQuestionId];
      if (subs.includes(q.id)) {
        qEvidence.push(...manifest.evidenceItems);
      }
    }

    // Build adjudicated evidence records
    const adjudicatedEvidence = [];
    const consensusClaims = [];

    for (const item of qEvidence) {
      const pr = evidenceResultMap.get(item.id);
      const confidence = pr ? pr.confidence : { confidence: 'U', label: 'UNVERIFIED', rationale: 'No pathway results' };

      adjudicatedEvidence.push({
        evidenceId: item.id,
        evidenceType: item.type,
        description: item.description,
        sourceRating: item.sourceRating,
        infoRating: item.infoRating,
        confidence: confidence.confidence,
        confidenceLabel: confidence.label,
        confidenceRationale: confidence.rationale,
        pathwayId: pr ? pr.pathwayId : null,
        pathwayLevelsCompleted: pr ? (pr.results || []).filter(Boolean).length : 0,
        flags: [],
        citation: item.citation
      });
    }

    // Check for consensus claims (>80% agreement) that trigger P-CON
    const confidenceCounts = {};
    for (const ae of adjudicatedEvidence) {
      confidenceCounts[ae.confidence] = (confidenceCounts[ae.confidence] || 0) + 1;
    }
    const total = adjudicatedEvidence.length;
    if (total > 0) {
      const verifiedCount = (confidenceCounts['V'] || 0) + (confidenceCounts['P'] || 0);
      const consensusLevel = verifiedCount / total;

      if (consensusLevel > 0.8 && total >= 3) {
        consensusClaims.push({
          claim: q.question,
          consensusLevel,
          contrarianAnalysisTriggered: true,
          contrarianResult: 'pending'
        });

        // Spawn P-CON pathway
        try {
          const conEvidence = {
            id: `${q.id}-consensus`,
            type: 'SCI',
            triggeredPathway: 'P-CON',
            description: `Consensus (${(consensusLevel * 100).toFixed(0)}%) on: ${q.question}`,
            sourceRating: 'B',
            infoRating: '2',
            consensusLevel
          };

          const conResult = await investigationTree.runPathway(
            dir, conEvidence, emitEvent,
            { parentWorkerId: project.parentWorkerId, projectPath: project.projectPath || process.cwd() }
          );

          if (conResult && conResult.results && conResult.results.length > 0) {
            const lastResult = conResult.results.filter(Boolean).pop();
            const adj = lastResult?.findings?.adjustmentRecommendation;
            consensusClaims[consensusClaims.length - 1].contrarianResult =
              adj || 'no-change';

            // If contrarian analysis recommends downgrade, apply it
            if (adj === 'downgrade-one-level' || adj === 'downgrade') {
              for (const ae of adjudicatedEvidence) {
                if (ae.confidence === 'V') {
                  ae.confidence = 'P';
                  ae.confidenceLabel = 'PLAUSIBLE';
                  ae.confidenceRationale += '; Downgraded by contrarian analysis';
                  ae.flags.push('contrarian-downgrade');
                }
              }
            }
          }
        } catch { /* contrarian analysis is best-effort */ }
      }
    }

    // Cross-project reconciliation: check if other projects have conflicting findings
    try {
      const priorResearch = researchIndex.search(q.question);
      if (priorResearch.length > 0) {
        for (const prior of priorResearch.slice(0, 3)) {
          if (prior.projectId === project.id) continue; // skip self
          const priorGraphPath = path.join(
            process.env.HOME || require('os').homedir(),
            '.researchlab', 'projects', prior.projectId, 'graph.json'
          );
          if (fs.existsSync(priorGraphPath)) {
            try {
              const priorGraph = readJSON(priorGraphPath);
              const disputedNodes = (priorGraph.nodes || []).filter(n => n.confidence === 'disputed');
              if (disputedNodes.length > 0) {
                for (const ae of adjudicatedEvidence) {
                  ae.flags.push(`cross-project-dispute: ${prior.topic} has ${disputedNodes.length} disputed nodes`);
                }
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch { /* cross-project reconciliation is best-effort */ }

    const adjRecord = {
      subQuestionId: q.id,
      question: q.question,
      adjudicatedEvidence,
      consensusClaims,
      completed: new Date().toISOString()
    };

    writeJSON(outFile, adjRecord);
    adjudicatedFiles.push(outFile);
  }

  emitEvent('phase', {
    phase: 'adjudicating', status: 'done',
    adjudicatedCount: adjudicatedFiles.length
  });

  return adjudicatedFiles;
}

// ---------------------------------------------------------------------------
// Phase 5: SYNTHESIS (modified to consume adjudicated evidence)
// ---------------------------------------------------------------------------

async function phaseSynthesis(project, plan, adjudicatedFiles, emitEvent) {
  emitEvent('phase', { phase: 'synthesizing', status: 'started' });

  const dir = projectDir(project.id);
  const graphPath = path.join(dir, 'graph.json');

  // Build adjudicated evidence context
  const adjFileList = adjudicatedFiles.join(', ');

  // Build confidence summary from adjudicated files
  let confidenceSummary = '';
  const allAdj = [];
  for (const f of adjudicatedFiles) {
    try {
      const adj = readJSON(f);
      allAdj.push(adj);
    } catch { /* skip */ }
  }

  const confCounts = { V: 0, P: 0, U: 0, D: 0, R: 0 };
  for (const adj of allAdj) {
    for (const ae of (adj.adjudicatedEvidence || [])) {
      confCounts[ae.confidence] = (confCounts[ae.confidence] || 0) + 1;
    }
  }
  const totalEvidence = Object.values(confCounts).reduce((a, b) => a + b, 0);
  confidenceSummary = `EVIDENCE CONFIDENCE SUMMARY: ${totalEvidence} evidence items. VERIFIED: ${confCounts.V}, PLAUSIBLE: ${confCounts.P}, UNVERIFIED: ${confCounts.U}, DISPUTED: ${confCounts.D}, RETRACTED: ${confCounts.R}.`;

  // Also list investigation pathway files
  const investigationDir = path.join(dir, 'investigation');
  let investigationFiles = [];
  if (fs.existsSync(investigationDir)) {
    try {
      investigationFiles = fs.readdirSync(investigationDir)
        .filter(f => f.endsWith('.json') && f !== 'summary.json')
        .map(f => path.join(investigationDir, f));
    } catch { /* skip */ }
  }

  const taskDesc = [
    `PURPOSE: Synthesize adjudicated evidence into a knowledge graph. Use confidence ratings directly -- do not re-evaluate evidence quality.`,
    `TOPIC: "${project.topic}"`,
    `INPUT FILES: Plan: ${path.join(dir, 'plan.json')} -- Adjudicated evidence: ${adjFileList}${investigationFiles.length ? ' -- Investigation details: ' + investigationFiles.slice(0, 10).join(', ') + (investigationFiles.length > 10 ? '...' : '') : ''}`,

    confidenceSummary,

    `ADJUDICATED EVIDENCE USAGE (CRITICAL): 1. Read all adjudicated evidence files. Each contains evidence items with confidence ratings (V=VERIFIED, P=PLAUSIBLE, U=UNVERIFIED, D=DISPUTED, R=RETRACTED) and rationales. 2. Map confidence ratings directly to graph node "confidence" field: V→"verified", P→"plausible", U→"unverified", D→"disputed". 3. RETRACTED evidence: exclude from graph entirely. 4. DISPUTED evidence: include with "disputed" confidence and add an "investigation" node explaining the dispute. 5. UNVERIFIED evidence: include with "unverified" confidence and note this in topic text. 6. Include confidenceRationale from adjudication in topic sections. 7. Include investigationPathway (e.g. "P-SCI") in nodes where available. 8. Never present UNVERIFIED or DISPUTED claims as established fact. 9. Include contrarian analysis results where consensus claims were challenged.`,

    `KEY TASKS: 1. Read all adjudicated evidence files AND investigation files. 2. Plan node/edge/topic structure based on evidence with confidence levels. 3. Write graph.json using a Python script (MANDATORY). 4. Validate the output.`,

    `WRITING STRATEGY (CRITICAL): Use a Python script to build and write the JSON. Write a Python script that constructs nodes, edges, and topics as Python dicts/lists, then calls json.dump() to write ${graphPath}. Run: python3 /tmp/build_graph.py`,

    `GRAPH SCHEMA: { "nodes": [ { "id": "slug-id", "label": "UPPERCASE LABEL", "type": "domain|contaminant|health-effect|solution|product|context|investigation", "severity": "critical|high|moderate|low", "confidence": "verified|plausible|unverified|disputed", "investigationPathway": "P-SCI|P-GOV|...", "confidenceRationale": "why this confidence level", "parent": "parent-node-id-if-any", "summary": "1-2 sentence summary", "keyStats": { "key": "value" } } ], "edges": [ { "source": "node-id", "target": "node-id", "label": "UPPERCASE VERB", "type": "causation|evidence|composition|solution|gap|context|investigation", "citation": "optional citation text" } ], "topics": { "node-id": { "title": "Topic Title", "sections": [{ "heading": "Section Heading", "content": "Detailed paragraph(s) with specific data and citations" }], "citations": [{ "text": "Author (Year)", "url": "...", "pmid": "...", "year": "YYYY" }] } } }`,

    `NODE TYPES: domain, contaminant, health-effect, solution, product, recommendation, context, investigation. EDGE TYPES: causation, evidence, composition, solution, gap, context, investigation.`,

    `ACTIONABLE RECOMMENDATIONS (MANDATORY): Include a "recommendations" domain node with child "recommendation" type nodes containing SPECIFIC brand names and products. Each recommendation must cite the evidence and its confidence level.`,

    `MANDATORY RULES: 1. Every node.label MUST be UPPERCASE. 2. Every edge.label MUST be UPPERCASE. 3. Node ids are kebab-case slugs. 4. Domain nodes have no parent; child nodes reference parent via "parent" field. 5. EVERY non-domain node MUST have a corresponding entry in the "topics" dict. 6. Topic sections must preserve specific data, statistics, and citations. 7. Nodes with "confidence" set to "unverified" or "disputed" MUST have topic sections noting this. 8. The recommendations domain MUST exist with at least 3 recommendation child nodes. 9. Include investigationPathway and confidenceRationale on nodes where available from adjudicated evidence.`,

    `QUALITY CHECKS: 1. Topics entries == non-domain node count. 2. No dangling edges. 3. Every topic has at least 1 section with >200 chars. 4. No DISPUTED or RETRACTED claims presented as fact. 5. Recommendations domain exists with brand-specific nodes.`,

    `END STATE: ${graphPath} exists with valid graph JSON. Write via Python script, then signal done via Ralph.`
  ].filter(Boolean).join(' ');

  const spawnResult = await strategos.spawn(
    PROJECT_ROOT,
    `RESEARCH: synthesize "${project.topic}"`,
    project.projectPath || process.cwd(),
    project.parentWorkerId || null,
    taskDesc.length > 9500 ? taskDesc.slice(0, 9500) : taskDesc
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

  try { await strategos.deleteWorker(workerId); } catch { /* best effort */ }

  if (!fs.existsSync(graphPath)) {
    throw new Error('Synthesis worker completed but graph.json was not written');
  }

  const graph = readJSON(graphPath);
  const validation = validateGraph(graph);

  if (!validation.valid) {
    emitEvent('validation', { valid: false, errors: validation.errors });
    writeJSON(path.join(dir, 'validation-errors.json'), validation.errors);
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
 * Architecture: plan → classify → investigate → adjudicate → synthesize
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

    // Phase 2: Classify
    store.update(project.id, { status: 'classifying', statusDetail: 'Phase 2: Classify evidence' });
    const manifests = await phaseClassify(project, plan, emitEvent);

    // Phase 3: Investigate (investigation tree)
    store.update(project.id, { status: 'investigating', statusDetail: 'Phase 3: Investigation pathways' });
    const pathwayResults = await phaseInvestigate(project, manifests, emitEvent);

    // Phase 4: Adjudicate (confidence scoring + contrarian + reconciliation)
    store.update(project.id, { status: 'adjudicating', statusDetail: 'Phase 4: Adjudicate evidence' });
    const adjudicatedFiles = await phaseAdjudicate(project, plan, manifests, pathwayResults, emitEvent);

    // Phase 5: Synthesis (consume adjudicated evidence)
    store.update(project.id, { status: 'synthesizing', statusDetail: 'Phase 5: Synthesis' });
    const graph = await phaseSynthesis(project, plan, adjudicatedFiles, emitEvent);

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
