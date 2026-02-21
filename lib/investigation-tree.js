'use strict';

const fs   = require('fs');
const path = require('path');
const strategos = require('./strategos');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PATHWAYS_DIR = path.join(__dirname, '..', 'pathways');
const MAX_DEPTH    = 4;
const LEVEL_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes per level
const MAX_CONCURRENT_PATHWAYS = 5; // max parallel pathway executions
const SPAWN_DELAY_MS = 2000; // delay between batch spawns to avoid rate limits

// Evidence type → pathway ID mapping
const EVIDENCE_TYPE_PATHWAY = {
  SCI: 'P-SCI', GOV: 'P-GOV', ORG: 'P-ORG', EXP: 'P-EXP',
  STA: 'P-STA', FIN: 'P-FIN', DOC: 'P-DOC', MED: 'P-MED',
  HIS: 'P-HIS', TES: 'P-TES', TEC: 'P-TEC'
};

// Confidence levels ordered from worst to best
const CONFIDENCE_ORDER = ['R', 'D', 'U', 'P', 'V'];
const CONFIDENCE_LABELS = {
  R: 'RETRACTED', D: 'DISPUTED', U: 'UNVERIFIED', P: 'PLAUSIBLE', V: 'VERIFIED'
};

// ---------------------------------------------------------------------------
// Pathway loader
// ---------------------------------------------------------------------------

const pathwayCache = new Map();

/**
 * Load a pathway definition from pathways/*.json.
 * Results are cached in memory.
 * @param {string} pathwayId - e.g. "P-SCI"
 * @returns {object} The pathway definition
 */
function loadPathway(pathwayId) {
  if (pathwayCache.has(pathwayId)) return pathwayCache.get(pathwayId);

  const filePath = path.join(PATHWAYS_DIR, `${pathwayId}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Pathway definition not found: ${filePath}`);
  }

  const pathway = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  pathwayCache.set(pathwayId, pathway);
  return pathway;
}

/**
 * Get the pathway ID for an evidence type.
 * @param {string} evidenceType - e.g. "SCI"
 * @returns {string|null} Pathway ID or null
 */
function pathwayForType(evidenceType) {
  return EVIDENCE_TYPE_PATHWAY[evidenceType] || null;
}

// ---------------------------------------------------------------------------
// Condition evaluator (Appendix A)
// ---------------------------------------------------------------------------

/**
 * Evaluate a branch condition against worker output signals.
 * Implements the full operator set from the design doc.
 *
 * @param {object} condition - { field, operator, value }
 * @param {object} signals   - The branchSignals (or findings) from worker output
 * @returns {boolean}
 */
function evaluateCondition(condition, signals) {
  if (!condition || !signals) return false;

  const value = signals[condition.field];

  switch (condition.operator) {
    case 'equals':      return value === condition.value;
    case 'notEquals':   return value !== condition.value;
    case 'contains':    return String(value || '').includes(condition.value);
    case 'greaterThan': return Number(value) > Number(condition.value);
    case 'lessThan':    return Number(value) < Number(condition.value);
    case 'in':          return Array.isArray(condition.value) && condition.value.includes(value);
    case 'exists':      return value !== undefined && value !== null;
    case 'notExists':   return value === undefined || value === null;
    default:            return false;
  }
}

// ---------------------------------------------------------------------------
// Worker task builder
// ---------------------------------------------------------------------------

/**
 * Interpolate {{placeholder}} tokens in a template string.
 * Supports nested paths like {{parent.findings.doi}}.
 *
 * @param {string} template
 * @param {object} context - { evidence, parent, outputPath }
 * @returns {string}
 */
function interpolate(template, context) {
  if (!template) return '';
  return template.replace(/\{\{([^}]+)\}\}/g, (match, expr) => {
    const parts = expr.trim().split('.');
    let val = context;
    for (const part of parts) {
      if (val == null) return match; // leave unresolved
      val = val[part];
    }
    return val != null ? String(val) : match;
  });
}

/**
 * Build a worker task description from a pathway level definition.
 *
 * @param {object} pathway     - Full pathway definition
 * @param {number} levelDepth  - Which level depth (1-4)
 * @param {object} evidenceItem - Evidence manifest item
 * @param {object} parentOutput - Output from previous level (null for level 1)
 * @returns {object} { purpose, keyTasks, endState, requiredOutputSchema }
 */
function buildWorkerTask(pathway, levelDepth, evidenceItem, parentOutput) {
  const levelDef = pathway.levels.find(l => l.depth === levelDepth);
  if (!levelDef) {
    throw new Error(`Pathway ${pathway.id} has no level at depth ${levelDepth}`);
  }

  const ctx = {
    evidence: evidenceItem,
    parent: parentOutput ? (parentOutput.findings || parentOutput) : {},
    outputPath: '' // will be set by caller
  };

  return {
    purpose:  interpolate(levelDef.task.purpose, ctx),
    keyTasks: levelDef.task.keyTasks.map(t => interpolate(t, ctx)),
    endState: interpolate(levelDef.task.endState, ctx),
    requiredOutputSchema: levelDef.requiredOutputs,
    workerTemplate: levelDef.workerTemplate || 'research',
    levelName: levelDef.name
  };
}

// ---------------------------------------------------------------------------
// Confidence scoring (Section 7)
// ---------------------------------------------------------------------------

/**
 * Compute deterministic confidence from accumulated pathway results.
 * Applies the scoring rules and modifiers from the design doc Section 7.
 *
 * @param {object[]} pathwayResults - Array of level outputs from the pathway
 * @param {object}   flags         - Accumulated flags { industryFunding, testimonialOnly, ... }
 * @returns {{ confidence: string, label: string, rationale: string }}
 */
function computeConfidence(pathwayResults, flags) {
  if (!pathwayResults || pathwayResults.length === 0) {
    return { confidence: 'U', label: 'UNVERIFIED', rationale: 'No pathway results available' };
  }

  const allFlags = flags || {};
  const rationale = [];

  // Collect source ratings and corroboration data across all levels
  let hasRetracted = false;
  let contradictoryEqualQuality = false;
  const sourceRatings = [];
  let independentConfirmations = 0;
  let unresolvedBiasFlags = false;
  let methodologySound = true;

  for (const result of pathwayResults) {
    if (!result) continue;

    // Check for retraction
    if (result.findings?.retracted === true) hasRetracted = true;
    if (result.confidence === 'R') hasRetracted = true;

    // Collect source ratings
    if (result.sourceRating) sourceRatings.push(result.sourceRating);

    // Count independent confirmations
    if (result.findings?.replicationExists && result.findings?.replicationConfirms) {
      independentConfirmations++;
    }
    if (result.findings?.independentSources) {
      independentConfirmations += Array.isArray(result.findings.independentSources)
        ? result.findings.independentSources.length : 0;
    }
    if (result.findings?.valuesMatch === true) independentConfirmations++;
    if (result.findings?.convergence === true) independentConfirmations++;
    if (Array.isArray(result.findings?.independentReports)) {
      independentConfirmations += result.findings.independentReports.length;
    }
    if (Array.isArray(result.findings?.independentEvaluations)) {
      independentConfirmations += result.findings.independentEvaluations.length;
    }
    if (Array.isArray(result.findings?.additionalTestimonials)) {
      independentConfirmations += result.findings.additionalTestimonials.length;
    }

    // Check for contradictions
    if (result.findings?.contradictoryEvidence &&
        Array.isArray(result.findings.contradictoryEvidence) &&
        result.findings.contradictoryEvidence.length > 0) {
      contradictoryEqualQuality = true;
    }

    // Check for unresolved bias
    if (result.findings?.overallBias === 'high') unresolvedBiasFlags = true;
    if (result.findings?.conflictsFound === true) unresolvedBiasFlags = true;
    if (result.findings?.fundingBiasPattern) unresolvedBiasFlags = true;

    // Check methodology
    if (result.findings?.methodsAppropriate === false) methodologySound = false;
    if (result.findings?.pHackingRisk === 'high') methodologySound = false;
    if (result.findings?.cherryPickingRisk === 'high') methodologySound = false;
  }

  // Count A/B rated sources
  const abSources = sourceRatings.filter(r => r === 'A' || r === 'B').length;
  const cOrLowerSources = sourceRatings.filter(r => r !== 'A' && r !== 'B').length;

  // --- Apply deterministic rules in order ---

  // Rule 1: RETRACTED
  if (hasRetracted) {
    return { confidence: 'R', label: 'RETRACTED', rationale: 'Evidence has been retracted or withdrawn' };
  }

  // Rule 2: DISPUTED
  if (contradictoryEqualQuality) {
    rationale.push('Contradictory evidence of similar quality exists');
    return { confidence: 'D', label: 'DISPUTED', rationale: rationale.join('; ') };
  }

  // Rule 3: VERIFIED
  if (independentConfirmations >= 3 && abSources >= 3 && !unresolvedBiasFlags && methodologySound) {
    rationale.push(`${independentConfirmations} independent confirmations from ${abSources} A/B sources, no bias flags, methodology sound`);
    let conf = 'V';

    // Apply modifiers that can upgrade/downgrade VERIFIED
    conf = applyModifiers(conf, allFlags, pathwayResults, rationale);
    return { confidence: conf, label: CONFIDENCE_LABELS[conf], rationale: rationale.join('; ') };
  }

  // Rule 4: PLAUSIBLE
  if (independentConfirmations >= 1 || abSources >= 1 || cOrLowerSources >= 3 ||
      (unresolvedBiasFlags && independentConfirmations > 0)) {
    rationale.push(`${independentConfirmations} confirmations, ${abSources} A/B sources`);
    if (unresolvedBiasFlags) rationale.push('bias flags present but minor');
    let conf = 'P';

    conf = applyModifiers(conf, allFlags, pathwayResults, rationale);
    return { confidence: conf, label: CONFIDENCE_LABELS[conf], rationale: rationale.join('; ') };
  }

  // Rule 5: UNVERIFIED
  rationale.push('Insufficient evidence for confirmation');
  let conf = 'U';
  conf = applyModifiers(conf, allFlags, pathwayResults, rationale);
  return { confidence: conf, label: CONFIDENCE_LABELS[conf], rationale: rationale.join('; ') };
}

/**
 * Apply confidence modifiers per Section 7.
 * Modifiers can cap, upgrade, or downgrade the confidence level.
 */
function applyModifiers(confidence, flags, results, rationale) {
  let idx = CONFIDENCE_ORDER.indexOf(confidence);

  // Caps: cannot exceed P
  if (flags.industryFundingNoReplication) {
    if (idx > CONFIDENCE_ORDER.indexOf('P')) {
      rationale.push('Capped at PLAUSIBLE: industry funding with no independent replication');
      idx = CONFIDENCE_ORDER.indexOf('P');
    }
  }
  if (flags.testimonialOnly) {
    if (idx > CONFIDENCE_ORDER.indexOf('P')) {
      rationale.push('Capped at PLAUSIBLE: testimonial-only evidence');
      idx = CONFIDENCE_ORDER.indexOf('P');
    }
  }
  if (flags.lowHierarchyOnly) {
    if (idx > CONFIDENCE_ORDER.indexOf('P')) {
      rationale.push('Capped at PLAUSIBLE: case report/animal/in-vitro only');
      idx = CONFIDENCE_ORDER.indexOf('P');
    }
  }
  if (flags.smallSample) {
    if (idx > CONFIDENCE_ORDER.indexOf('P')) {
      rationale.push('Capped at PLAUSIBLE: sample size < 30');
      idx = CONFIDENCE_ORDER.indexOf('P');
    }
  }

  // Downgrades
  for (const result of results) {
    if (!result || !result.findings) continue;
    if (result.findings.pHackingRisk === 'high' || result.findings.cherryPickingRisk === 'high') {
      if (idx > 0) {
        rationale.push('Downgraded: p-hacking or cherry-picking detected');
        idx--;
        break; // only apply once
      }
    }
  }
  if (flags.contrarianCredible) {
    if (idx > 0) {
      rationale.push('Downgraded: contrarian analysis found credible counter');
      idx--;
    }
  }

  // Upgrades
  if (flags.largeEffect) {
    if (idx < CONFIDENCE_ORDER.length - 1) {
      rationale.push('Upgraded: large effect size from quality study');
      idx++;
    }
  }
  if (flags.doseResponse) {
    if (idx < CONFIDENCE_ORDER.length - 1) {
      rationale.push('Upgraded: dose-response relationship confirmed');
      idx++;
    }
  }

  return CONFIDENCE_ORDER[idx];
}

// ---------------------------------------------------------------------------
// Pathway execution
// ---------------------------------------------------------------------------

/**
 * Helper to ensure a directory exists.
 */
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
 * Spawn a Strategos worker for a single investigation level and wait for results.
 *
 * @param {object} opts
 * @param {string} opts.projectDir      - Project directory
 * @param {object} opts.pathway         - Pathway definition
 * @param {number} opts.levelDepth      - Level depth (1-4)
 * @param {object} opts.evidenceItem    - Evidence manifest item
 * @param {object} opts.parentOutput    - Parent level output (null for depth 1)
 * @param {function} opts.emitEvent     - SSE emitter
 * @param {string} opts.parentWorkerId  - Parent worker ID for strategos
 * @param {string} opts.projectPath     - Working directory
 * @returns {Promise<object|null>} The level output or null on failure
 */
async function spawnLevelWorker(opts) {
  const { projectDir, pathway, levelDepth, evidenceItem, parentOutput, emitEvent, parentWorkerId, projectPath } = opts;

  const investigationDir = path.join(projectDir, 'investigation');
  ensureDir(investigationDir);

  const outFileName = `${pathway.id}-${evidenceItem.id}-L${levelDepth}.json`;
  const outFile = path.join(investigationDir, outFileName);

  const task = buildWorkerTask(pathway, levelDepth, evidenceItem, parentOutput);

  // Build task description string for Strategos
  const outputSchema = (task.requiredOutputSchema || [])
    .map(o => `  "${o.field}": ${o.type}${o.description ? ' // ' + o.description : ''}`)
    .join(', ');

  const taskDesc = [
    `PURPOSE: ${task.purpose}`,
    `KEY TASKS: ${task.keyTasks.map((t, i) => `${i + 1}. ${t}`).join(' ')}`,
    `OUTPUT FORMAT: Write JSON to ${outFile} with structure: { "pathwayId": "${pathway.id}", "depth": ${levelDepth}, "evidenceFound": true/false, "sourceRating": "A-F", "infoRating": "1-6", "findings": { ${outputSchema} }, "branchSignals": { key-value pairs matching findings for branch evaluation }, "citations": [ { "text": "...", "url": "...", "year": "..." } ], "nextEvidenceTypes": [ "SCI"|"GOV"|"ORG"|... if new evidence types discovered ] }`,
    `END STATE: ${task.endState}`
  ].join(' ');

  const descSnippet = (evidenceItem.description || evidenceItem.id).slice(0, 120);
  const label = `RESEARCH: ${pathway.id} L${levelDepth} "${descSnippet}"`.slice(0, 200);

  emitEvent('pathway_level', {
    pathwayId: pathway.id,
    evidenceId: evidenceItem.id,
    depth: levelDepth,
    levelName: task.levelName,
    status: 'spawning'
  });

  let spawnResult;
  try {
    spawnResult = await strategos.spawn(
      task.workerTemplate,
      label,
      projectPath || process.cwd(),
      parentWorkerId || null,
      taskDesc
    );
  } catch (err) {
    emitEvent('pathway_level', {
      pathwayId: pathway.id, evidenceId: evidenceItem.id, depth: levelDepth,
      status: 'spawn_failed', error: err.message
    });
    return null;
  }

  const workerId = spawnResult.id || spawnResult.workerId;
  if (!workerId) {
    emitEvent('pathway_level', {
      pathwayId: pathway.id, evidenceId: evidenceItem.id, depth: levelDepth,
      status: 'spawn_failed', error: 'No worker ID returned'
    });
    return null;
  }

  emitEvent('pathway_level', {
    pathwayId: pathway.id, evidenceId: evidenceItem.id, depth: levelDepth,
    workerId, status: 'spawned'
  });

  // Wait for worker
  try {
    await strategos.waitForDone(workerId, LEVEL_TIMEOUT_MS);
  } catch (err) {
    emitEvent('pathway_level', {
      pathwayId: pathway.id, evidenceId: evidenceItem.id, depth: levelDepth,
      workerId, status: 'failed', error: err.message
    });
    try { await strategos.deleteWorker(workerId); } catch { /* best effort */ }
    return null;
  }

  // Clean up worker
  try { await strategos.deleteWorker(workerId); } catch { /* best effort */ }

  // Read output
  if (!fs.existsSync(outFile)) {
    emitEvent('pathway_level', {
      pathwayId: pathway.id, evidenceId: evidenceItem.id, depth: levelDepth,
      status: 'no_output'
    });
    return null;
  }

  try {
    const output = readJSON(outFile);
    emitEvent('pathway_level', {
      pathwayId: pathway.id, evidenceId: evidenceItem.id, depth: levelDepth,
      status: 'done', sourceRating: output.sourceRating, infoRating: output.infoRating
    });
    return output;
  } catch (err) {
    emitEvent('pathway_level', {
      pathwayId: pathway.id, evidenceId: evidenceItem.id, depth: levelDepth,
      status: 'parse_error', error: err.message
    });
    return null;
  }
}

/**
 * Run a complete investigation pathway for a single evidence item.
 * Executes levels sequentially, evaluating branch conditions at each level.
 * Handles cross-pathway spawning when new evidence types are discovered.
 *
 * @param {string}   projectDir     - Project directory path
 * @param {object}   evidenceItem   - Evidence manifest item { id, type, description, ... }
 * @param {function} emitEvent      - SSE emitter
 * @param {object}   opts           - { parentWorkerId, projectPath }
 * @returns {Promise<object>} { pathwayId, results: [...levelOutputs], confidence, crossPathways: [...] }
 */
async function runPathway(projectDir, evidenceItem, emitEvent, opts) {
  const pathwayId = evidenceItem.triggeredPathway || pathwayForType(evidenceItem.type);
  if (!pathwayId) {
    return { pathwayId: null, results: [], confidence: null, crossPathways: [] };
  }

  const pathway = loadPathway(pathwayId);

  emitEvent('pathway_started', {
    pathwayId, evidenceId: evidenceItem.id, maxDepth: pathway.levels.length
  });

  const results = [];
  const crossPathways = []; // new evidence types discovered
  const flags = {};
  let currentOutput = null;

  for (const levelDef of pathway.levels) {
    if (levelDef.depth > MAX_DEPTH) break;

    // For depth > 1, check if any branch from the previous level points to this depth
    if (levelDef.depth > 1 && currentOutput) {
      const prevLevel = pathway.levels.find(l => l.depth === levelDef.depth - 1);
      if (prevLevel && prevLevel.branches && prevLevel.branches.length > 0) {
        const signals = currentOutput.branchSignals || currentOutput.findings || {};
        const matchedBranch = prevLevel.branches.find(b => {
          // nextLevel === -1 means TERMINATE
          if (b.nextLevel === -1) return evaluateCondition(b.condition, signals);
          return b.nextLevel === levelDef.depth && evaluateCondition(b.condition, signals);
        });

        // Check for TERMINATE branches
        const terminateBranch = prevLevel.branches.find(
          b => b.nextLevel === -1 && evaluateCondition(b.condition, signals)
        );
        if (terminateBranch) {
          emitEvent('pathway_branch', {
            pathwayId, evidenceId: evidenceItem.id, depth: levelDef.depth,
            action: 'terminated', reason: `Condition met: ${terminateBranch.condition.field} ${terminateBranch.condition.operator} ${terminateBranch.condition.value}`
          });

          // Determine termination confidence
          if (signals.retracted) flags.retracted = true;
          if (signals.numberVerified === false) flags.disputed = true;
          break;
        }

        // If no branch points to this depth, skip this level
        if (!matchedBranch) {
          continue;
        }
      }
    }

    // Spawn worker for this level
    const levelOutput = await spawnLevelWorker({
      projectDir, pathway, levelDepth: levelDef.depth,
      evidenceItem, parentOutput: currentOutput,
      emitEvent,
      parentWorkerId: opts?.parentWorkerId,
      projectPath: opts?.projectPath
    });

    if (levelOutput) {
      results.push(levelOutput);
      currentOutput = levelOutput;

      // Collect flags for confidence computation
      if (levelOutput.findings) {
        const f = levelOutput.findings;
        if (f.funderType === 'industry' && !f.replicationExists) flags.industryFundingNoReplication = true;
        if (f.studyType && ['case-report', 'case-series', 'animal', 'in-vitro'].includes(f.studyType) && !f.higherEvidenceExists) flags.lowHierarchyOnly = true;
        if (f.sampleSize && f.sampleSize < 30) flags.smallSample = true;
      }

      // Check for cross-pathway spawning
      if (levelOutput.nextEvidenceTypes && Array.isArray(levelOutput.nextEvidenceTypes)) {
        for (const newType of levelOutput.nextEvidenceTypes) {
          if (pathwayForType(newType) && pathwayForType(newType) !== pathwayId) {
            crossPathways.push({ type: newType, pathwayId: pathwayForType(newType), discoveredAt: levelDef.depth });
          }
        }
      }
    } else {
      // Worker failed — record gap and continue to next level if possible
      results.push(null);
      emitEvent('pathway_level', {
        pathwayId, evidenceId: evidenceItem.id, depth: levelDef.depth,
        status: 'gap', reason: 'Worker produced no output'
      });
    }
  }

  // Compute confidence
  const validResults = results.filter(Boolean);
  const confidence = computeConfidence(validResults, flags);

  emitEvent('pathway_complete', {
    pathwayId, evidenceId: evidenceItem.id,
    levelsCompleted: validResults.length,
    confidence: confidence.confidence,
    confidenceLabel: confidence.label,
    crossPathways: crossPathways.length
  });

  emitEvent('confidence_computed', {
    pathwayId, evidenceId: evidenceItem.id,
    confidence: confidence.confidence,
    label: confidence.label,
    rationale: confidence.rationale
  });

  return { pathwayId, results, confidence, crossPathways };
}

/**
 * Orchestrate all investigation pathways in parallel.
 * Reads evidence manifests, runs each evidence item through its triggered pathway,
 * handles cross-pathway spawning for newly discovered evidence types.
 *
 * @param {string}   projectDir  - Project directory path
 * @param {object[]} manifests   - Array of evidence manifest objects
 * @param {function} emitEvent   - SSE emitter
 * @param {object}   opts        - { parentWorkerId, projectPath }
 * @returns {Promise<object[]>}  Array of pathway results
 */
/**
 * Run items through pathways with bounded concurrency.
 * Processes at most MAX_CONCURRENT_PATHWAYS items in parallel.
 */
async function runWithConcurrency(items, fn, limit) {
  const results = [];
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    if (i > 0) await new Promise(r => setTimeout(r, SPAWN_DELAY_MS)); // rate-limit gap
    const batchResults = await Promise.allSettled(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

async function runInvestigationPhase(projectDir, manifests, emitEvent, opts) {
  // Collect all evidence items from all manifests
  const allEvidence = [];
  for (const manifest of manifests) {
    if (manifest.evidenceItems && Array.isArray(manifest.evidenceItems)) {
      allEvidence.push(...manifest.evidenceItems);
    }
  }

  if (allEvidence.length === 0) {
    emitEvent('phase', { phase: 'investigating', status: 'no_evidence' });
    return [];
  }

  emitEvent('phase', {
    phase: 'investigating', status: 'started',
    evidenceCount: allEvidence.length,
    pathwayBreakdown: countByType(allEvidence)
  });

  // Run evidence items through pathways with bounded concurrency
  const results = await runWithConcurrency(
    allEvidence,
    item => runPathway(projectDir, item, emitEvent, opts),
    MAX_CONCURRENT_PATHWAYS
  );

  const pathwayResults = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      pathwayResults.push(result.value);
    } else {
      pathwayResults.push({
        pathwayId: null, results: [],
        confidence: { confidence: 'U', label: 'UNVERIFIED', rationale: `Pathway failed: ${result.reason?.message}` },
        crossPathways: []
      });
    }
  }

  // Handle cross-pathway spawning (also with bounded concurrency)
  const crossPathwayItems = [];
  for (let i = 0; i < pathwayResults.length; i++) {
    const pr = pathwayResults[i];
    if (pr.crossPathways && pr.crossPathways.length > 0) {
      for (const cp of pr.crossPathways) {
        crossPathwayItems.push({
          id: `${allEvidence[i].id}-cross-${cp.type}`,
          type: cp.type,
          triggeredPathway: cp.pathwayId,
          description: `Cross-pathway from ${pr.pathwayId}: ${allEvidence[i].description || allEvidence[i].id}`,
          sourceRating: allEvidence[i].sourceRating,
          infoRating: allEvidence[i].infoRating
        });
      }
    }
  }

  if (crossPathwayItems.length > 0) {
    emitEvent('phase', {
      phase: 'investigating', status: 'cross_pathways',
      count: crossPathwayItems.length
    });

    const crossResults = await runWithConcurrency(
      crossPathwayItems,
      item => runPathway(projectDir, item, emitEvent, opts),
      MAX_CONCURRENT_PATHWAYS
    );

    for (const result of crossResults) {
      if (result.status === 'fulfilled') {
        pathwayResults.push(result.value);
      }
    }
  }

  // Write investigation summary
  const summaryPath = path.join(projectDir, 'investigation', 'summary.json');
  const summary = {
    totalEvidence: allEvidence.length,
    totalPathways: pathwayResults.length,
    crossPathways: crossPathwayItems.length,
    confidenceBreakdown: countConfidence(pathwayResults),
    completed: new Date().toISOString()
  };
  writeJSON(summaryPath, summary);

  emitEvent('phase', {
    phase: 'investigating', status: 'done',
    totalPathways: pathwayResults.length,
    confidenceBreakdown: summary.confidenceBreakdown
  });

  return pathwayResults;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countByType(evidenceItems) {
  const counts = {};
  for (const item of evidenceItems) {
    counts[item.type] = (counts[item.type] || 0) + 1;
  }
  return counts;
}

function countConfidence(pathwayResults) {
  const counts = { V: 0, P: 0, U: 0, D: 0, R: 0 };
  for (const pr of pathwayResults) {
    if (pr.confidence?.confidence) {
      counts[pr.confidence.confidence] = (counts[pr.confidence.confidence] || 0) + 1;
    }
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  loadPathway,
  pathwayForType,
  evaluateCondition,
  interpolate,
  buildWorkerTask,
  computeConfidence,
  runPathway,
  runInvestigationPhase,
  EVIDENCE_TYPE_PATHWAY,
  CONFIDENCE_ORDER,
  CONFIDENCE_LABELS
};
