'use strict';

const fs   = require('fs');
const path = require('path');
const strategos = require('./strategos');
const { validateGraph } = require('./graph-builder');
const store = require('./project-store');
const sources = require('./sources');
const researchIndex = require('./research-index');
const investigationTree = require('./investigation-tree');

// Graceful optional dependency: source-screening module
let sourceScreening = null;
try {
  sourceScreening = require('./source-screening');
} catch { /* source-screening not available — pre-screening will be skipped */ }

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
 * Normalize manifest field names: classify workers may produce "evidence" / "type" / "subQuestion"
 * but downstream consumers (investigation-tree, adjudication) expect "evidenceItems" / "evidenceType" / "subQuestionId"
 */
function normalizeManifest(manifest) {
  if (manifest.evidence && !manifest.evidenceItems) {
    manifest.evidenceItems = manifest.evidence;
  }
  if (Array.isArray(manifest.evidenceItems)) {
    for (const item of manifest.evidenceItems) {
      if (item.type && !item.evidenceType) {
        item.evidenceType = item.type;
      }
      if (item.subQuestion && !item.subQuestionId) {
        item.subQuestionId = item.subQuestion;
      }
    }
  }
  return manifest;
}

/**
 * Load plan.json for a project. Returns parsed JSON or null.
 */
function loadPlan(projectId) {
  const planPath = path.join(projectDir(projectId), 'plan.json');
  if (!fs.existsSync(planPath)) return null;
  try { return readJSON(planPath); } catch { return null; }
}

/**
 * Load all evidence manifest files, applying normalizeManifest to each.
 * Returns array of manifests or null.
 */
function loadManifests(projectId) {
  const evidenceDir = path.join(projectDir(projectId), 'evidence');
  if (!fs.existsSync(evidenceDir)) return null;
  try {
    const files = fs.readdirSync(evidenceDir).filter(f => f.startsWith('manifest-') && f.endsWith('.json'));
    if (files.length === 0) return null;
    const manifests = [];
    for (const f of files) {
      try {
        manifests.push(normalizeManifest(readJSON(path.join(evidenceDir, f))));
      } catch { /* skip corrupted */ }
    }
    return manifests.length > 0 ? manifests : null;
  } catch { return null; }
}

/**
 * Load adjudicated file paths from adjudication directory.
 * Returns array of absolute file paths or null.
 */
function loadAdjudicatedFiles(projectId) {
  const adjDir = path.join(projectDir(projectId), 'adjudication');
  if (!fs.existsSync(adjDir)) return null;
  try {
    const files = fs.readdirSync(adjDir)
      .filter(f => f.endsWith('-adjudicated.json'))
      .map(f => path.join(adjDir, f));
    return files.length > 0 ? files : null;
  } catch { return null; }
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
// Phase 0: PROTOCOL (Cochrane-inspired protocol registration)
// ---------------------------------------------------------------------------

async function phaseProtocol(project, emitEvent) {
  emitEvent('phase', { phase: 'protocol', status: 'started' });

  const dir = projectDir(project.id);
  ensureDir(dir);

  const protocolPath = path.join(dir, 'protocol.json');

  const taskDesc = [
    `PURPOSE: Generate a formal research protocol that locks the methodology before any investigation begins. This ensures reproducibility and auditability per Cochrane systematic review standards.`,
    `TOPIC: "${project.topic}"`,
    `KEY TASKS: 1. Formulate the research question in structured format using adapted PICO (Population/Context, Intervention/Factor, Comparator/Alternative, Outcome/Impact). 2. Define inclusion criteria (what types of evidence, sources, date ranges to include). 3. Define exclusion criteria (what to exclude and why — e.g., retracted studies, non-peer-reviewed for medical claims, sources older than N years). 4. Document the search strategy: which source types to consult (academic databases, government sources, industry reports, etc.), key search terms, and date ranges. 5. Specify the assessment methodology per evidence type: how SCI evidence will be assessed vs GOV vs EXP etc. 6. Write the output as JSON to: ${protocolPath}`,
    `OUTPUT FORMAT (write this exact JSON structure): { "researchQuestion": { "population": "who/what is being studied", "intervention": "factor or intervention of interest", "comparator": "alternative or control condition", "outcome": "expected outcomes to measure" }, "inclusionCriteria": [ "criterion 1", "criterion 2" ], "exclusionCriteria": [ "criterion 1", "criterion 2" ], "searchStrategy": { "sourceTypes": ["academic", "government", "industry"], "keyTerms": ["term1", "term2"], "dateRange": "YYYY-YYYY or 'no restriction'", "databases": ["PubMed", "Google Scholar", "etc"] }, "assessmentMethodology": { "SCI": "RoB 2 for RCTs, ROBINS-I for observational", "GOV": "Cross-reference with official registries", "EXP": "Check credentials and conflicts of interest", "default": "NATO Admiralty System (A-F reliability, 1-6 credibility)" }, "sensitivityAnalyses": ["description of planned sensitivity check 1"], "protocolVersion": "1.0", "createdAt": "ISO-8601 timestamp" }`,
    `END STATE: ${protocolPath} exists with a complete, frozen research protocol. Write the file, then signal done via Ralph.`
  ].join(' ');

  const spawnResult = await strategos.spawn(
    PROJECT_ROOT,
    `RESEARCH: protocol "${project.topic}"`.slice(0, 200),
    project.projectPath || process.cwd(),
    project.parentWorkerId || null,
    taskDesc.length > 9500 ? taskDesc.slice(0, 9500) : taskDesc
  );

  const workerId = spawnResult.id || spawnResult.workerId;
  if (!workerId) throw new Error('Protocol worker spawn failed: no worker id returned');

  emitEvent('worker', { phase: 'protocol', workerId, action: 'spawned' });

  try {
    await strategos.waitForDone(workerId, TIMEOUT_MS);
  } catch (err) {
    throw new Error(`Protocol phase failed: ${err.message}`);
  }

  emitEvent('worker', { phase: 'protocol', workerId, action: 'done' });

  if (!fs.existsSync(protocolPath)) {
    throw new Error('Protocol worker completed but protocol.json was not written');
  }

  const protocol = readJSON(protocolPath);

  try { await strategos.deleteWorker(workerId); } catch { /* best effort */ }

  emitEvent('phase', { phase: 'protocol', status: 'done' });
  return protocol;
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
    `RESEARCH: plan "${project.topic}"`.slice(0, 200),
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
// Phase 2: CLASSIFY (evidence type classification)
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

  // Evidence hierarchy tiers (GRADE-aligned starting confidence)
  const evidenceHierarchyBlock = [
    'EVIDENCE HIERARCHY (assign startingTier per GRADE framework):',
    'Tier 1: Meta-analyses, systematic reviews (SCI subtypes) → startingTier=1, startingConfidence="potential-High"',
    'Tier 2: RCTs, large cohort studies, government official data (SCI, GOV) → startingTier=2, startingConfidence="potential-High"',
    'Tier 3: Observational studies, organizational reports (SCI, ORG) → startingTier=3, startingConfidence="potential-Moderate"',
    'Tier 4: Expert opinion, case reports, technical claims, media, historical, testimonials, financial, documents (EXP, TEC, MED, HIS, TES, FIN, DOC) → startingTier=4, startingConfidence="potential-Low"',
    'Include startingTier and startingConfidence in each evidence item output.'
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
      evidenceHierarchyBlock,
      `KEY TASKS: 1. For each sub-question, perform a broad search to find all relevant evidence. 2. Classify each piece of evidence into exactly one primary type using the decision tree above. 3. Assign a startingTier (1-4) per the evidence hierarchy above. 4. Rate each source's reliability (A=Established, B=Generally Reliable, C=Mixed Record, D=Questionable, E=Unreliable, F=Unknown). 5. Rate each piece of information's credibility (1=Confirmed, 2=Probably True, 3=Possibly True, 4=Doubtful, 5=Improbable, 6=Cannot Judge). 6. Document your search process in searchLog. 7. Track any assumptions you make in an assumptions array. 8. Write the evidence manifest as JSON to: ${outFile}`,
    ];

    if (sourcesBlock) taskParts.push(sourcesBlock);
    if (priorBlock) taskParts.push(priorBlock);

    taskParts.push(
      `OUTPUT FORMAT (write this exact JSON structure): { "subQuestionId": "${batch[0].id}", "subQuestions": [${batch.map(q => '"' + q.id + '"').join(', ')}], "searchLog": [ { "source": "PubMed|Google Scholar|etc", "query": "search terms used", "resultsFound": 0, "resultsReviewed": 0, "included": 0 } ], "exclusionReasons": [ { "evidenceId": "e-excluded-1", "reason": "why excluded" } ], "assumptions": [ { "text": "assumption description", "classification": "well-supported|reasonable|unsupported", "isLinchpin": false } ], "evidenceItems": [ { "id": "e1", "type": "SCI|GOV|ORG|EXP|STA|FIN|DOC|MED|HIS|TES|TEC", "startingTier": 1, "startingConfidence": "potential-High|potential-Moderate|potential-Low", "sourceRating": "A|B|C|D|E|F", "infoRating": "1|2|3|4|5|6", "description": "Brief description of the evidence", "citation": { "text": "Author (Year)", "url": "...", "pmid": "...", "doi": "..." }, "triggeredPathway": "P-SCI|P-GOV|P-ORG|P-EXP|P-STA|P-FIN|P-DOC|P-MED|P-HIS|P-TES|P-TEC" } ] }`,
      `PATHWAY MAPPING: SCI→P-SCI, GOV→P-GOV, ORG→P-ORG, EXP→P-EXP, STA→P-STA, FIN→P-FIN, DOC→P-DOC, MED→P-MED, HIS→P-HIS, TES→P-TES, TEC→P-TEC`,
      `SEARCH LOG REQUIREMENT: You MUST document every source you search in the searchLog array -- what you searched, how many results you found, how many you reviewed, and how many you included. This is mandatory for PRISMA audit trail compliance.`,
      `ASSUMPTIONS REQUIREMENT: You MUST list all assumptions made during research in the assumptions array. Classify each as well-supported (strong evidence), reasonable (no evidence against), or unsupported (assumed by convention). Flag linchpin assumptions (those the assessment rests on) with isLinchpin=true.`,
      `END STATE: ${outFile} exists with classified evidence items for each assigned sub-question. Each evidence item has a type, starting tier, source/info ratings, and triggered pathway. searchLog and assumptions arrays are populated. Write the file, then signal done via Ralph.`
    );

    let taskDesc = taskParts.join(' ');
    if (taskDesc.length > 9500) taskDesc = taskDesc.slice(0, 9500);

    const spawnResult = await strategos.spawn(
      PROJECT_ROOT,
      `RESEARCH: classify-${i} "${project.topic}"`.slice(0, 200),
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

  // Normalize field names
  for (const manifest of manifests) {
    normalizeManifest(manifest);
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
// Phase 2.5: SOURCE PRE-SCREENING (automated retraction/predatory/bibliometric checks)
// ---------------------------------------------------------------------------

async function phasePreScreening(project, manifests, emitEvent) {
  if (!sourceScreening) {
    emitEvent('phase', { phase: 'pre-screening', status: 'skipped', reason: 'source-screening module not available' });
    return null;
  }

  emitEvent('phase', { phase: 'pre-screening', status: 'started' });

  const dir = projectDir(project.id);

  // Collect all citations from manifests
  const citations = [];
  for (const manifest of manifests) {
    if (!manifest.evidenceItems) continue;
    for (const item of manifest.evidenceItems) {
      if (item.citation) {
        citations.push(item.citation);
      }
    }
  }

  if (citations.length === 0) {
    emitEvent('phase', { phase: 'pre-screening', status: 'skipped', reason: 'no citations to screen' });
    return null;
  }

  emitEvent('phase', { phase: 'pre-screening', status: 'screening', citationCount: citations.length });

  let screeningResults;
  try {
    screeningResults = await sourceScreening.screenBatch(citations);
  } catch (err) {
    emitEvent('phase', { phase: 'pre-screening', status: 'failed', error: err.message });
    return null;
  }

  // Save screening results
  const screeningPath = path.join(dir, 'source-screening.json');
  writeJSON(screeningPath, {
    screenedAt: new Date().toISOString(),
    totalCitations: citations.length,
    results: screeningResults
  });

  // Count flags
  let retracted = 0;
  let predatoryRisk = 0;
  for (const r of screeningResults) {
    if (r.retraction?.retracted) retracted++;
    if (r.journal?.tier === 'D') predatoryRisk++;
  }

  emitEvent('phase', {
    phase: 'pre-screening', status: 'done',
    screened: screeningResults.length,
    retracted,
    predatoryRisk
  });

  return screeningResults;
}

// ---------------------------------------------------------------------------
// Phase 3: INVESTIGATE (investigation tree execution)
// ---------------------------------------------------------------------------

async function phaseInvestigate(project, manifests, emitEvent, maxWorkers) {
  const budget = maxWorkers != null ? maxWorkers : 10;

  if (budget === 0) {
    emitEvent('phase', { phase: 'investigating', status: 'skipped', reason: 'budget is 0' });
    // Return empty results — all evidence passes directly to adjudication
    const allEvidence = [];
    for (const manifest of manifests) {
      if (manifest.evidenceItems && Array.isArray(manifest.evidenceItems)) {
        allEvidence.push(...manifest.evidenceItems);
      }
    }
    return allEvidence.map(() => ({
      pathwayId: null, results: [],
      confidence: { confidence: 'U', label: 'UNVERIFIED', rationale: 'Investigation skipped (budget 0)' },
      crossPathways: []
    }));
  }

  emitEvent('phase', { phase: 'investigating', status: 'started' });

  const dir = projectDir(project.id);

  const pathwayResults = await investigationTree.runInvestigationPhase(
    dir, manifests, emitEvent,
    { parentWorkerId: project.parentWorkerId, projectPath: project.projectPath || process.cwd(), maxWorkers: budget }
  );

  emitEvent('phase', {
    phase: 'investigating', status: 'done',
    pathwayCount: pathwayResults.length
  });

  return pathwayResults;
}

// ---------------------------------------------------------------------------
// Phase 4: ADJUDICATE (confidence scoring + GRADE + ACH + contrarian + reconciliation)
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
        startingTier: item.startingTier || null,
        startingConfidence: item.startingConfidence || null,
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

    // --- GRADE domain assessment (body-of-evidence level for this sub-question) ---
    const gradeAssessment = {
      d1RiskOfBias: 'not serious',
      d2Inconsistency: 'not serious',
      d3Indirectness: 'not serious',
      d4Imprecision: 'not serious',
      d5PublicationBias: 'undetected',
      u1LargeEffect: false,
      u2DoseResponse: false,
      u3OpposingConfounding: false,
      gradeCertainty: 'moderate'
    };

    // Assess D1: Risk of Bias — check if any evidence has bias flags from pathways
    const biasFlags = adjudicatedEvidence.filter(ae => {
      const pr = evidenceResultMap.get(ae.evidenceId);
      return pr?.results?.some(r => r?.findings?.biasFlags?.length > 0);
    });
    if (biasFlags.length > adjudicatedEvidence.length * 0.5) {
      gradeAssessment.d1RiskOfBias = 'very serious';
    } else if (biasFlags.length > adjudicatedEvidence.length * 0.25) {
      gradeAssessment.d1RiskOfBias = 'serious';
    }

    // Assess D2: Inconsistency — check variance in confidence across evidence
    const confValues = adjudicatedEvidence.map(ae => ae.confidence);
    const uniqueConf = [...new Set(confValues)];
    if (uniqueConf.length >= 3 && adjudicatedEvidence.length >= 3) {
      gradeAssessment.d2Inconsistency = 'serious';
    }

    // Assess D4: Imprecision — small evidence base
    if (adjudicatedEvidence.length < 3) {
      gradeAssessment.d4Imprecision = 'serious';
    }

    // Compute GRADE certainty: start from highest tier evidence, apply downgrades
    let certaintyLevel = 4; // high=4, moderate=3, low=2, very-low=1
    const bestTier = Math.min(...adjudicatedEvidence.map(ae => ae.startingTier || 4));
    if (bestTier <= 2) {
      certaintyLevel = 4; // Start high for tier 1-2
    } else if (bestTier === 3) {
      certaintyLevel = 3; // Start moderate for tier 3
    } else {
      certaintyLevel = 2; // Start low for tier 4
    }

    // Apply downgrades
    if (gradeAssessment.d1RiskOfBias === 'very serious') certaintyLevel -= 2;
    else if (gradeAssessment.d1RiskOfBias === 'serious') certaintyLevel -= 1;
    if (gradeAssessment.d2Inconsistency === 'serious') certaintyLevel -= 1;
    if (gradeAssessment.d3Indirectness === 'serious') certaintyLevel -= 1;
    if (gradeAssessment.d4Imprecision === 'serious') certaintyLevel -= 1;
    if (gradeAssessment.d5PublicationBias === 'strongly suspected') certaintyLevel -= 1;

    // Apply upgrades (only if not already downgraded per GRADE rules)
    const wasDowngraded = certaintyLevel < (bestTier <= 2 ? 4 : bestTier === 3 ? 3 : 2);
    if (!wasDowngraded && bestTier >= 3) {
      if (gradeAssessment.u1LargeEffect) certaintyLevel += 1;
      if (gradeAssessment.u2DoseResponse) certaintyLevel += 1;
      if (gradeAssessment.u3OpposingConfounding) certaintyLevel += 1;
    }

    certaintyLevel = Math.max(1, Math.min(4, certaintyLevel));
    const certMap = { 4: 'high', 3: 'moderate', 2: 'low', 1: 'very low' };
    gradeAssessment.gradeCertainty = certMap[certaintyLevel];

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

    // Collect assumptions from manifests for this sub-question
    const allAssumptions = [];
    for (const manifest of manifests) {
      const subs = manifest.subQuestions || [manifest.subQuestionId];
      if (subs.includes(q.id) && manifest.assumptions) {
        allAssumptions.push(...manifest.assumptions);
      }
    }

    // --- Lightweight alternative analysis for all sub-questions (ICD 203 Standard 4) ---
    let alternativeAnalysis = null;
    if (adjudicatedEvidence.length > 0) {
      const primaryConf = adjudicatedEvidence.filter(ae => ae.confidence === 'V' || ae.confidence === 'P');
      const contraryConf = adjudicatedEvidence.filter(ae => ae.confidence === 'D' || ae.confidence === 'U');
      alternativeAnalysis = {
        primaryInterpretationSupport: primaryConf.length,
        alternativeInterpretationSupport: contraryConf.length,
        totalEvidence: adjudicatedEvidence.length,
        alternativeAnalysisRequired: true,
        note: 'Lightweight alternative analysis per ICD 203 Standard 4. Full P-CON pathway reserved for >80% consensus cases.'
      };
    }

    const adjRecord = {
      subQuestionId: q.id,
      question: q.question,
      adjudicatedEvidence,
      gradeAssessment,
      consensusClaims,
      assumptions: allAssumptions,
      alternativeAnalysis,
      completed: new Date().toISOString()
    };

    writeJSON(outFile, adjRecord);
    adjudicatedFiles.push(outFile);
  }

  // --- ACH Analysis: spawn a verification worker for hypothesis testing ---
  try {
    await _runACHAnalysis(project, plan, manifests, adjudicatedFiles, dir, emitEvent);
  } catch { /* ACH is best-effort enhancement */ }

  emitEvent('phase', {
    phase: 'adjudicating', status: 'done',
    adjudicatedCount: adjudicatedFiles.length
  });

  return adjudicatedFiles;
}

// ---------------------------------------------------------------------------
// ACH Analysis (spawned as part of adjudication)
// ---------------------------------------------------------------------------

async function _runACHAnalysis(project, plan, manifests, adjudicatedFiles, dir, emitEvent) {
  emitEvent('phase', { phase: 'ach-analysis', status: 'started' });

  const achOutputPath = path.join(dir, 'verification', 'ach-analysis.json');
  ensureDir(path.dirname(achOutputPath));

  // Build a summary of sub-questions and their evidence for the ACH worker
  const qSummaries = [];
  for (const q of (plan.subQuestions || [])) {
    const adjFile = adjudicatedFiles.find(f => f.includes(`${q.id}-adjudicated`));
    let evidenceCount = 0;
    let evidenceSummary = '';
    if (adjFile && fs.existsSync(adjFile)) {
      try {
        const adj = readJSON(adjFile);
        evidenceCount = (adj.adjudicatedEvidence || []).length;
        evidenceSummary = (adj.adjudicatedEvidence || []).slice(0, 10).map(
          ae => `[${ae.evidenceId}] ${ae.description} (${ae.confidenceLabel}, ${ae.evidenceType})`
        ).join('; ');
      } catch { /* skip */ }
    }
    qSummaries.push(`[${q.id}] "${q.question}" — ${evidenceCount} evidence items: ${evidenceSummary}`);
  }

  const taskDesc = [
    `PURPOSE: Perform Analysis of Competing Hypotheses (ACH) for the research topic "${project.topic}". For each sub-question, generate competing hypotheses and systematically evaluate which hypothesis the evidence best supports, focusing on DIAGNOSTIC evidence that distinguishes between hypotheses.`,
    `TOPIC: "${project.topic}"`,
    `SUB-QUESTIONS AND EVIDENCE: ${qSummaries.join(' | ')}`,
    `ADJUDICATED EVIDENCE FILES: ${adjudicatedFiles.join(', ')}`,
    `KEY TASKS: 1. Read all adjudicated evidence files. 2. For EACH sub-question: (a) Generate 3-5 competing hypotheses that could answer the question. (b) For each evidence item, rate as Consistent (C), Inconsistent (I), or Neutral (N) for EACH hypothesis. (c) Identify DIAGNOSTIC evidence (helps distinguish between hypotheses). Evidence consistent with ALL hypotheses has ZERO diagnostic value. (d) Select the hypothesis LEAST BURDENED by inconsistent evidence (NOT the one with most consistent evidence). (e) Compute a diagnosticity score (0-1) for each evidence item. 3. Write the complete ACH analysis as JSON to: ${achOutputPath}`,
    `OUTPUT FORMAT: { "topic": "${project.topic}", "analysisDate": "ISO-8601", "subQuestionAnalyses": [ { "subQuestionId": "q1", "question": "...", "hypotheses": [ { "id": "H1", "description": "..." } ], "evidenceMatrix": [ { "evidenceId": "e1", "description": "...", "ratings": { "H1": "C|I|N", "H2": "C|I|N" }, "diagnosticity": 0.8, "discriminatesFor": "H2", "discriminatesAgainst": ["H1"] } ], "selectedHypothesis": { "id": "H2", "description": "...", "reasoning": "..." }, "diagnosticEvidenceSummary": "..." } ] }`,
    `ACH METHODOLOGY (Heuer, Psychology of Intelligence Analysis, 1999): The key insight is DIAGNOSTICITY. Evidence consistent with all hypotheses has zero diagnostic value even if it strongly confirms the preferred hypothesis. Work ACROSS the matrix (one evidence row at a time), not DOWN (one hypothesis column at a time). Select the hypothesis least burdened by inconsistent evidence.`,
    `END STATE: ${achOutputPath} exists with complete ACH analysis for all sub-questions. Write the file, then signal done via Ralph.`
  ].join(' ');

  const spawnResult = await strategos.spawn(
    PROJECT_ROOT,
    `RESEARCH: ACH "${project.topic}"`.slice(0, 200),
    project.projectPath || process.cwd(),
    project.parentWorkerId || null,
    taskDesc.length > 9500 ? taskDesc.slice(0, 9500) : taskDesc
  );

  const workerId = spawnResult.id || spawnResult.workerId;
  if (!workerId) {
    emitEvent('phase', { phase: 'ach-analysis', status: 'failed', reason: 'spawn failed' });
    return;
  }

  emitEvent('worker', { phase: 'ach-analysis', workerId, action: 'spawned' });

  try {
    await strategos.waitForDone(workerId, ADJUDICATE_TIMEOUT_MS);
    emitEvent('worker', { phase: 'ach-analysis', workerId, action: 'done' });
  } catch (err) {
    emitEvent('worker', { phase: 'ach-analysis', workerId, action: 'failed', error: err.message });
  }

  try { await strategos.deleteWorker(workerId); } catch { /* best effort */ }

  emitEvent('phase', {
    phase: 'ach-analysis', status: 'done',
    outputExists: fs.existsSync(achOutputPath)
  });
}

// ---------------------------------------------------------------------------
// Phase 5: SYNTHESIS (modified to consume adjudicated evidence + SoF + markup)
// ---------------------------------------------------------------------------

async function phaseSynthesis(project, plan, adjudicatedFiles, emitEvent) {
  emitEvent('phase', { phase: 'synthesizing', status: 'started' });

  const dir = projectDir(project.id);
  const graphPath = path.join(dir, 'graph.json');
  const sofPath = path.join(dir, 'summary-of-findings.json');

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

  // Build GRADE summary from adjudicated files
  let gradeSummary = '';
  const gradeCerts = allAdj.map(adj => adj.gradeAssessment?.gradeCertainty).filter(Boolean);
  if (gradeCerts.length > 0) {
    const certCounts = {};
    for (const c of gradeCerts) certCounts[c] = (certCounts[c] || 0) + 1;
    gradeSummary = `GRADE CERTAINTY SUMMARY: ${Object.entries(certCounts).map(([k, v]) => `${k}: ${v} sub-questions`).join(', ')}.`;
  }

  // Check for ACH analysis output
  const achPath = path.join(dir, 'verification', 'ach-analysis.json');
  const achExists = fs.existsSync(achPath);

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
    `PURPOSE: Synthesize adjudicated evidence into a knowledge graph AND a summary-of-findings table. Use confidence ratings and GRADE assessments directly -- do not re-evaluate evidence quality.`,
    `TOPIC: "${project.topic}"`,
    `INPUT FILES: Plan: ${path.join(dir, 'plan.json')} -- Adjudicated evidence: ${adjFileList}${achExists ? ' -- ACH analysis: ' + achPath : ''}${investigationFiles.length ? ' -- Investigation details: ' + investigationFiles.slice(0, 10).join(', ') + (investigationFiles.length > 10 ? '...' : '') : ''}`,

    confidenceSummary,
    gradeSummary,

    `ADJUDICATED EVIDENCE USAGE (CRITICAL): 1. Read all adjudicated evidence files. Each contains evidence items with confidence ratings (V=VERIFIED, P=PLAUSIBLE, U=UNVERIFIED, D=DISPUTED, R=RETRACTED), GRADE assessments (gradeAssessment with gradeCertainty), and rationales. 2. Map confidence ratings directly to graph node "confidence" field: V→"verified", P→"plausible", U→"unverified", D→"disputed". 3. RETRACTED evidence: exclude from graph entirely. 4. DISPUTED evidence: include with "disputed" confidence and add an "investigation" node explaining the dispute. 5. UNVERIFIED evidence: include with "unverified" confidence and note this in topic text. 6. Include confidenceRationale from adjudication in topic sections. 7. Include investigationPathway (e.g. "P-SCI") in nodes where available. 8. Never present UNVERIFIED or DISPUTED claims as established fact. 9. Include contrarian analysis results where consensus claims were challenged. 10. If ACH analysis exists, reference the selected hypothesis and diagnostic evidence in relevant topic sections.`,

    `KEY TASKS: 1. Read all adjudicated evidence files AND investigation files${achExists ? ' AND ACH analysis' : ''}. 2. Plan node/edge/topic structure based on evidence with confidence levels. 3. Write graph.json using a Python script (MANDATORY). 4. Write summary-of-findings.json (MANDATORY). 5. Validate the output.`,

    `WRITING STRATEGY (CRITICAL): Use a Python script to build and write the JSON. Write a Python script that constructs nodes, edges, and topics as Python dicts/lists, then calls json.dump() to write ${graphPath}. Also write ${sofPath} from the same script. Run: python3 /tmp/build_graph.py`,

    `GRAPH SCHEMA: { "nodes": [ { "id": "slug-id", "label": "UPPERCASE LABEL", "type": "domain|contaminant|health-effect|solution|product|context|investigation", "severity": "critical|high|moderate|low", "confidence": "verified|plausible|unverified|disputed", "investigationPathway": "P-SCI|P-GOV|...", "confidenceRationale": "why this confidence level", "parent": "parent-node-id-if-any", "summary": "1-2 sentence summary", "keyStats": { "key": "value" } } ], "edges": [ { "source": "node-id", "target": "node-id", "label": "UPPERCASE VERB", "type": "causation|evidence|composition|solution|gap|context|investigation", "citation": "optional citation text" } ], "topics": { "node-id": { "title": "Topic Title", "sections": [{ "heading": "Section Heading", "content": "Detailed paragraph(s) with specific data and citations", "statementTypes": [ { "text": "specific statement from the content", "type": "fact|judgment|assumption", "citation": "source if fact", "assumptions": ["underlying assumption if judgment"] } ] }], "citations": [{ "text": "Author (Year)", "url": "...", "pmid": "...", "year": "YYYY" }] } } }`,

    `NODE TYPES: domain, contaminant, health-effect, solution, product, recommendation, context, investigation. EDGE TYPES: causation, evidence, composition, solution, gap, context, investigation.`,

    `ACTIONABLE RECOMMENDATIONS (MANDATORY): Include a "recommendations" domain node with child "recommendation" type nodes containing SPECIFIC brand names and products. Each recommendation must cite the evidence and its confidence level.`,

    `STATEMENT MARKUP (MANDATORY per ICD 203 Standard 3): In EVERY topic section, include a "statementTypes" array that classifies key statements. Types: "fact" = directly supported by cited evidence (include citation), "judgment" = inferred conclusion from evidence and assumptions (include assumptions array), "assumption" = stated premise not directly evidenced. This allows readers to distinguish established facts from analytic judgments.`,

    `SUMMARY OF FINDINGS TABLE (MANDATORY): Also write ${sofPath} with this structure: { "title": "Summary of Findings: ${project.topic}", "generatedAt": "ISO-8601", "findings": [ { "subQuestionId": "q1", "question": "...", "evidenceCount": 12, "studyDesigns": ["3 RCTs", "5 cohort", "4 expert opinion"], "keyResult": "concise key finding", "gradeCertainty": "high|moderate|low|very low", "pipelineConfidence": "V|P|U|D", "confidenceRationale": "why this confidence", "gradeDowngrades": ["domain: severity (reason)"], "gradeUpgrades": [], "limitations": "key limitations" } ] }`,

    `MANDATORY RULES: 1. Every node.label MUST be UPPERCASE. 2. Every edge.label MUST be UPPERCASE. 3. Node ids are kebab-case slugs. 4. Domain nodes have no parent; child nodes reference parent via "parent" field. 5. EVERY non-domain node MUST have a corresponding entry in the "topics" dict. 6. Topic sections must preserve specific data, statistics, and citations. 7. Nodes with "confidence" set to "unverified" or "disputed" MUST have topic sections noting this. 8. The recommendations domain MUST exist with at least 3 recommendation child nodes. 9. Include investigationPathway and confidenceRationale on nodes where available from adjudicated evidence. 10. Include statementTypes in topic sections. 11. Write summary-of-findings.json alongside graph.json.`,

    `QUALITY CHECKS: 1. Topics entries == non-domain node count. 2. No dangling edges. 3. Every topic has at least 1 section with >200 chars. 4. No DISPUTED or RETRACTED claims presented as fact. 5. Recommendations domain exists with brand-specific nodes. 6. summary-of-findings.json exists with entries for each sub-question.`,

    `END STATE: ${graphPath} AND ${sofPath} both exist with valid JSON. Write via Python script, then signal done via Ralph.`
  ].filter(Boolean).join(' ');

  const spawnResult = await strategos.spawn(
    PROJECT_ROOT,
    `RESEARCH: synthesize "${project.topic}"`.slice(0, 200),
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
    topicCount: Object.keys(graph.topics || {}).length,
    sofExists: fs.existsSync(sofPath)
  });

  return graph;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Start the full research pipeline.
 * Architecture: protocol → plan → classify → pre-screen → investigate → adjudicate (+ ACH) → synthesize
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

  // Sanitize topic: strip control characters that cause Strategos to reject task descriptions
  project = { ...project, topic: project.topic.replace(/[\x00-\x1f\x7f]/g, ' ') };

  const dir = projectDir(project.id);
  ensureDir(dir);
  store.update(project.id, { status: 'protocol', statusDetail: 'Pipeline started' });
  emitEvent('pipeline', { status: 'started', projectId: project.id, topic: project.topic });

  try {
    // Phase 0: Protocol (Cochrane-inspired methodology registration)
    store.update(project.id, { status: 'protocol', statusDetail: 'Phase 0: Protocol' });
    const protocol = await phaseProtocol(project, emitEvent);

    // Phase 1: Planning
    store.update(project.id, { status: 'planning', statusDetail: 'Phase 1: Planning' });
    const plan = await phasePlanning(project, emitEvent);
    writeJSON(path.join(dir, 'plan.json'), plan);

    // Phase 2: Classify
    store.update(project.id, { status: 'classifying', statusDetail: 'Phase 2: Classify evidence' });
    const manifests = await phaseClassify(project, plan, emitEvent);

    // Phase 2.5: Source Pre-Screening (automated — skips gracefully if unavailable)
    store.update(project.id, { status: 'pre-screening', statusDetail: 'Phase 2.5: Source pre-screening' });
    await phasePreScreening(project, manifests, emitEvent);

    // Phase 3: Investigate (investigation tree — cluster-based with budget)
    const investigationBudget = project.investigationBudget != null ? project.investigationBudget : 10;
    store.update(project.id, { status: 'investigating', statusDetail: `Phase 3: Investigation pathways (budget: ${investigationBudget})` });
    const pathwayResults = await phaseInvestigate(project, manifests, emitEvent, investigationBudget);

    // Phase 4: Adjudicate (confidence scoring + GRADE + ACH + contrarian + reconciliation)
    store.update(project.id, { status: 'adjudicating', statusDetail: 'Phase 4: Adjudicate evidence' });
    const adjudicatedFiles = await phaseAdjudicate(project, plan, manifests, pathwayResults, emitEvent);

    // Phase 5: Synthesis (consume adjudicated evidence + SoF table + statement markup)
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

/**
 * Resume the research pipeline from a specific phase.
 * Loads prior artifacts from disk and runs from the specified phase forward.
 *
 * @param {object} project - Must have: id, topic. Optional: projectPath, parentWorkerId.
 * @param {string} fromPhase - One of: protocol, planning, classifying, investigating, adjudicating, synthesizing
 * @param {function} emitEvent - SSE emitter: emitEvent(type, data).
 * @returns {Promise<object>} The final graph.json data.
 */
async function resume(project, fromPhase, emitEvent) {
  const validPhases = ['protocol', 'planning', 'classifying', 'investigating', 'adjudicating', 'synthesizing'];
  if (!validPhases.includes(fromPhase)) {
    throw new Error(`Invalid phase "${fromPhase}". Must be one of: ${validPhases.join(', ')}`);
  }
  if (!project?.id || !project?.topic) {
    throw new Error('project must have id and topic');
  }
  if (typeof emitEvent !== 'function') {
    emitEvent = () => {};
  }

  // Sanitize topic
  project = { ...project, topic: project.topic.replace(/[\x00-\x1f\x7f]/g, ' ') };

  const dir = projectDir(project.id);
  ensureDir(dir);
  store.update(project.id, { status: fromPhase, statusDetail: `Resuming from ${fromPhase}` });
  emitEvent('pipeline', { status: 'resuming', projectId: project.id, topic: project.topic, fromPhase });

  const phaseIndex = validPhases.indexOf(fromPhase);

  try {
    // Load prior artifacts needed depending on the starting phase
    let plan = null;
    let manifests = null;
    let pathwayResults = null;
    let adjudicatedFiles = null;

    // If resuming after protocol, we need plan from disk
    if (phaseIndex > 0) {
      plan = loadPlan(project.id);
      if (!plan && phaseIndex >= 1) {
        throw new Error('Cannot resume from ' + fromPhase + ': plan.json not found on disk');
      }
    }

    // If resuming after classifying, we need manifests from disk
    if (phaseIndex > 2) {
      manifests = loadManifests(project.id);
      if (!manifests && phaseIndex >= 3) {
        throw new Error('Cannot resume from ' + fromPhase + ': evidence manifests not found on disk');
      }
    }

    // If resuming at adjudicating, we need manifests + pathway results
    if (phaseIndex >= 4) {
      if (!manifests) manifests = loadManifests(project.id);
      if (!manifests) throw new Error('Cannot resume from ' + fromPhase + ': evidence manifests not found on disk');
    }

    // If resuming at synthesizing, we need adjudicated files
    if (phaseIndex >= 5) {
      adjudicatedFiles = loadAdjudicatedFiles(project.id);
      if (!adjudicatedFiles) throw new Error('Cannot resume from synthesizing: adjudicated files not found on disk');
    }

    // Run phases from the starting phase forward

    // Phase 0: Protocol
    if (phaseIndex <= 0) {
      store.update(project.id, { status: 'protocol', statusDetail: 'Phase 0: Protocol' });
      await phaseProtocol(project, emitEvent);
    }

    // Phase 1: Planning
    if (phaseIndex <= 1) {
      store.update(project.id, { status: 'planning', statusDetail: 'Phase 1: Planning' });
      plan = await phasePlanning(project, emitEvent);
      writeJSON(path.join(dir, 'plan.json'), plan);
    }

    // Phase 2: Classify
    if (phaseIndex <= 2) {
      store.update(project.id, { status: 'classifying', statusDetail: 'Phase 2: Classify evidence' });
      manifests = await phaseClassify(project, plan, emitEvent);
    }

    // Phase 2.5: Source Pre-Screening
    if (phaseIndex <= 3) {
      store.update(project.id, { status: 'pre-screening', statusDetail: 'Phase 2.5: Source pre-screening' });
      await phasePreScreening(project, manifests, emitEvent);
    }

    // Phase 3: Investigate
    if (phaseIndex <= 3) {
      const investigationBudget = project.investigationBudget != null ? project.investigationBudget : 10;
      store.update(project.id, { status: 'investigating', statusDetail: `Phase 3: Investigation pathways (budget: ${investigationBudget})` });
      pathwayResults = await phaseInvestigate(project, manifests, emitEvent, investigationBudget);
    }

    // Phase 4: Adjudicate
    if (phaseIndex <= 4) {
      // If we don't have pathwayResults (resuming at adjudicating), create pass-through array
      if (!pathwayResults) {
        const allEvidence = [];
        for (const manifest of manifests) {
          if (manifest.evidenceItems && Array.isArray(manifest.evidenceItems)) {
            allEvidence.push(...manifest.evidenceItems);
          }
        }
        pathwayResults = allEvidence.map(() => ({
          pathwayId: null, results: [],
          confidence: { confidence: 'U', label: 'UNVERIFIED', rationale: 'Investigation results not available (resumed at adjudication)' },
          crossPathways: []
        }));
      }
      store.update(project.id, { status: 'adjudicating', statusDetail: 'Phase 4: Adjudicate evidence' });
      adjudicatedFiles = await phaseAdjudicate(project, plan, manifests, pathwayResults, emitEvent);
    }

    // Phase 5: Synthesis
    store.update(project.id, { status: 'synthesizing', statusDetail: 'Phase 5: Synthesis' });
    const graph = await phaseSynthesis(project, plan, adjudicatedFiles, emitEvent);

    store.update(project.id, { status: 'complete', statusDetail: 'Pipeline complete (resumed)' });

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

module.exports = { start, resume };
