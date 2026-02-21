# Shower Filter Recommendation Inconsistency Report

**Date:** 2026-02-21
**Investigator:** Research Worker 27acf244
**Status:** Root cause identified, fixes recommended

---

## 1. Summary

Two research projects produced overlapping but uncoordinated recommendations about water filtration for NYC residents. The skincare project recommended KDF-55/catalytic carbon **showerhead** filters for chloramine removal. The lead contamination project recommended NSF/ANSI 53 certified **point-of-use** filters for lead removal. Neither project referenced or acknowledged the other's findings, despite both addressing NYC water quality and having overlapping filter recommendations. The result: a user reading both research outputs would receive two independent, unreconciled sets of filtration advice without understanding how they relate.

---

## 2. What Each Research Found

### Project 2fe47fa86d29d026 — "NYC Water Quality & Skincare"

- **Topic:** "best most healthy lotions and skincare routines given NYC water quality - what contaminants in NYC water affect skin - what ingredients to look for and avoid"
- **Created:** 2026-02-21T06:00:07Z (ran second)
- **Status:** error (graph.json was written successfully; worker timed out during post-synthesis)

**Shower filter recommendation (node: `showerhead-filters`):**
- Recommended KDF-55 or catalytic carbon showerhead filters
- Claimed "90-99% chloramine reduction" -- the single most impactful change for skin health
- Mentioned vitamin C (ascorbic acid) shower filters as effective but degrading within 1-2 days if not flowing
- Cost estimate: $20-60 for filter, $10-30 for replacement cartridges, replace every 2-3 months
- **No specific brand names recommended** (despite pipeline instructions requiring brand-specific recommendations)
- Citations: Olympian Water Testing (2023), USDA Forest Service (2005) re: vitamin C

**Also recommended:** NSF-53 certified pitcher filter for buildings with pre-1961 plumbing (mentioned in passing within the `recommended-products` topic, but not as a primary recommendation node).

### Project 61f80edabb5037e7 — "Lead Contamination in NYC Tap Water"

- **Topic:** "lead contamination in NYC tap water"
- **Created:** 2026-02-20T05:26:15Z (ran first)
- **Status:** complete

**Filter recommendation (node: `point-of-use-filters`):**
- Recommended NSF/ANSI Standard 53 certified point-of-use filters
- Types listed: pitcher, faucet-mounted, under-sink, and countertop units
- Focus was on lead reduction below EPA action level (15 ppb)
- **No specific brand names recommended**
- **No shower filter mentioned at all** -- focused exclusively on drinking water filtration
- No topic content was written for this node (the `point-of-use-filters` key is absent from the `topics` dict)

### Key Inconsistencies

| Dimension | Skincare Project | Lead Project |
|-----------|-----------------|--------------|
| Filter type | Showerhead (KDF-55, catalytic carbon) | Point-of-use (pitcher, faucet, under-sink) |
| Target contaminant | Chloramine | Lead |
| Claimed efficacy | "90-99% chloramine reduction" | "Reduce lead below EPA action level" |
| Certification cited | None | NSF/ANSI Standard 53 |
| Specific brands | None | None |
| Shower filter coverage | Primary recommendation | Not mentioned |

The inconsistency is not a direct contradiction (they target different contaminants) but represents a **coordination failure**: an NYC resident needs BOTH types of filtration, and neither project acknowledges the other's domain. The skincare project does not mention lead filtration as a concern; the lead project does not mention shower filtration at all. A user following only one project's recommendations would have an incomplete picture.

---

## 3. Which Recommendation Is Actually Correct?

### Independent Assessment of Shower Filter Technologies for NYC Chloramine

NYC uses chloramine (chlorine + ammonia) as its primary disinfectant. This is harder to remove than free chlorine. The skincare project's claim of "90-99% chloramine reduction" from KDF-55 or catalytic carbon filters is **significantly overstated** based on independent evidence.

**KDF-55 (Copper-Zinc Alloy):**
- Effective for free chlorine removal (85-95%)
- **Poor for chloramine removal.** KDF-55 was designed for chlorine, not chloramine. Independent testing shows minimal chloramine reduction at shower flow rates and temperatures.
- NSF/ANSI 177 certification (the shower filter standard) only covers free chlorine, not chloramine.

**Catalytic Carbon:**
- Enhanced over standard activated carbon for chloramine, achieving 50-70% reduction in ideal conditions
- **Unreliable at shower temperatures and flow rates.** Carbon filtration requires adequate contact time; shower flow rates (~2 GPM) and hot water temperatures degrade performance significantly.
- Cost: 2-3x more expensive than KDF-55 cartridges.

**Vitamin C (Ascorbic Acid):**
- The San Francisco Public Utilities Commission (SFPUC) determined that 1000mg of vitamin C removes chloramine completely in a bathtub -- but this requires 4-8 minutes of contact time in still water.
- In shower flow conditions, vitamin C filters perform chemical neutralization that is less dependent on contact time than carbon/KDF, making them theoretically superior for chloramine.
- However: no NSF-certified vitamin C shower filters exist, and independent testing (Hach Pocket Colorimeter) has shown mixed results -- some tests found "zero effects on chloramine" from vitamin C shower filters.
- Cartridge lifespan is short (1-2 months), and effectiveness degrades rapidly when not in continuous use.

**Critical fact: No shower filter is NSF-certified for chloramine removal.** All shower filter chloramine claims are manufacturer self-reported. The only NSF shower filter standard (NSF/ANSI 177) covers free chlorine only.

**For lead removal (the lead project's domain):**
- NSF/ANSI Standard 53 certification for lead reduction is well-established and independently verified.
- The lead project's recommendation of NSF 53 certified point-of-use filters is **correct and well-supported.**

**Bottom line for NYC residents:**
1. For **lead**: NSF/ANSI 53 certified point-of-use filter for drinking/cooking water (the lead project is correct).
2. For **shower chloramine**: Vitamin C shower filters are the *least bad* option, but no technology has independently verified high chloramine removal at shower flow rates. The skincare project's "90-99%" claim for KDF-55/catalytic carbon is not supported by independent evidence for chloramine specifically.
3. The two filter types serve different purposes and are not interchangeable. An NYC resident in a pre-1961 building needs both.

Sources consulted:
- Interior Medicine, "Best Shower Filters 2026: Doctor-Tested & Ranked Reviews"
- SFPUC Chloramine Q&A (2015)
- Quality Water Lab independent shower filter testing
- NBC News Select, "Best Filtered Shower Heads in 2026"
- Water Filter Guru, "The Best Shower Head Filter of 2026"

---

## 4. Root Cause Analysis

The inconsistency has **three compounding causes**, all in the pipeline's cross-referencing mechanism.

### Cause 1: Prior research context is too shallow (PRIMARY)

**File:** `lib/pipeline.js`, lines 123-126

```javascript
const priorResearch = researchIndex.search(project.topic);
const priorBlock = priorResearch.length
  ? `PRIOR RESEARCH (related topics already investigated -- reference but do not duplicate): ${priorResearch.map((r) => r.topic + ' (' + r.stats.nodes + ' nodes, ' + r.stats.citations + ' citations)').join('; ')}`
  : '';
```

When the skincare project ran, the prior research block sent to workers was:

> PRIOR RESEARCH (related topics already investigated -- reference but do not duplicate): lead contamination in NYC tap water (46 nodes, 56 citations)

This tells workers that a related project exists but provides **zero information about what it found**. Workers cannot cross-reference recommendations they cannot see. The instruction "reference but do not duplicate" is impossible to follow because there is nothing to reference -- just a topic name and node count.

**What should happen:** The priorBlock should include a summary of key recommendation nodes, product nodes, and their summaries from prior research. For overlapping domains (like "NYC water"), the worker should receive the actual findings, not just metadata.

### Cause 2: Index entries lack searchTerms (CONTRIBUTING)

**File:** `lib/research-index.js`, `record()` function

The current `record()` function (post-optimization commit `6f5c74a`) includes `searchTerms: extractSearchTerms(graph)` in new entries. However, all existing index entries were written by the original version (commit `6aaf4cc`) which did NOT include `searchTerms`. The index was never rebuilt after the optimization.

Result: The `search()` function's searchTerms matching (lines 279-289) scores 0 for all existing entries because the field doesn't exist. The search still works via topic and tag matching (score of 22.0 for the skincare-to-lead match), so this is a contributing factor that reduces search quality but did not prevent the match in this specific case.

The `rebuild()` function (lines 333-360) exists to fix this but was never called after the code update.

### Cause 3: No mechanism for cross-project recommendation reconciliation (STRUCTURAL)

Even if the prior research block included full recommendation details, there is no pipeline phase that explicitly reconciles overlapping recommendations across projects. The verification phase (Phase 2.5) checks claims within a single project's research workers but does not cross-check against prior research findings. The synthesis phase receives the prior research block but has no specific instruction to reconcile product recommendations with prior research.

---

## 5. Code-Level Recommendations

### Fix 1: Enrich the prior research block with recommendation content (HIGH PRIORITY)

Replace the shallow prior research summary with actual recommendation data. In `lib/pipeline.js`, modify `phaseResearch()`:

```javascript
// Current (lines 123-126):
const priorResearch = researchIndex.search(project.topic);
const priorBlock = priorResearch.length
  ? `PRIOR RESEARCH ...topic + stats...`
  : '';

// Proposed:
const priorResearch = researchIndex.search(project.topic);
let priorBlock = '';
if (priorResearch.length) {
  const priorDetails = [];
  for (const prior of priorResearch) {
    const graphPath = path.join(projectDir(prior.projectId), 'graph.json');
    if (!fs.existsSync(graphPath)) continue;
    const graph = readJSON(graphPath);
    // Extract recommendation and product nodes with summaries
    const recNodes = (graph.nodes || [])
      .filter(n => ['recommendation', 'product', 'solution'].includes(n.type))
      .map(n => `${n.label}: ${n.summary}`)
      .join('; ');
    priorDetails.push(
      `${prior.topic} (${prior.stats.nodes} nodes) — KEY FINDINGS: ${recNodes || 'none extracted'}`
    );
  }
  priorBlock = `PRIOR RESEARCH (you MUST cross-reference these findings and ensure your recommendations are consistent): ${priorDetails.join(' ||| ')}`;
}
```

This gives workers actual content to cross-reference rather than opaque metadata.

### Fix 2: Rebuild the research index (IMMEDIATE)

Call `researchIndex.rebuild()` to populate `searchTerms` for all existing entries. This can be done once via a script or added as a startup check:

```javascript
// In server startup or a maintenance script:
const researchIndex = require('./research-index');
researchIndex.rebuild();
```

### Fix 3: Add cross-project reconciliation to the verification phase (MEDIUM PRIORITY)

Add a third verification worker in `phaseVerification()` that specifically checks for contradictions with prior research:

```javascript
// Worker 3: Cross-project consistency check
const priorResearch = researchIndex.search(project.topic);
if (priorResearch.length) {
  const priorGraphPaths = priorResearch
    .map(p => path.join(projectDir(p.projectId), 'graph.json'))
    .filter(p => fs.existsSync(p));

  const consistencyTaskDesc = [
    `PURPOSE: Check this project's research for contradictions with prior research on related topics.`,
    `CURRENT RESEARCH FILES: ${researchFiles.join(', ')}`,
    `PRIOR RESEARCH GRAPHS: ${priorGraphPaths.join(', ')}`,
    `KEY TASKS: 1. Read the current research files. 2. Read the prior research graphs. 3. Identify any product, brand, or action recommendations that contradict prior findings. 4. For each contradiction, determine which recommendation has stronger evidence. 5. Write reconciliation recommendations.`,
    // ... output format ...
  ].join(' ');
  // Spawn verification worker...
}
```

### Fix 4: Add the prior research block to the synthesis phase too (LOW PRIORITY)

Currently `phaseSynthesis()` does not receive the prior research context. The synthesis worker should also see what was recommended in prior research so it can note cross-references in the final graph:

```javascript
// In phaseSynthesis(), add:
const priorResearch = researchIndex.search(project.topic);
// Build enriched prior block (same as Fix 1)
// Include in synthesis task description
```

### Fix 5: Add migration logic for index schema changes (DEFENSIVE)

The `record()` function should check for and backfill missing fields when loading existing entries, or the `load()` function should run a lightweight migration:

```javascript
function load() {
  // ... existing load logic ...
  // Backfill missing fields
  for (const entry of index.entries) {
    if (!entry.searchTerms) {
      entry.searchTerms = []; // Mark as needing rebuild
    }
  }
  return index;
}
```

---

## 6. Open Questions

1. **Should the pipeline enforce a "rebuild index" step on startup if schema changes are detected?** The searchTerms gap would have been caught immediately.

2. **Should prior research graphs be passed by file path to workers, letting them read the full graph?** This is more flexible than summarizing in the prompt but increases worker complexity and token usage.

3. **What is the threshold for "related" prior research?** The current search returns any match with score > 0. With synonym expansion, this could produce false positives (e.g., a project about "water polo" matching "water quality"). A minimum score threshold may be needed.

4. **Should the pipeline store a "recommendation fingerprint" in the index** -- a compact summary of all recommendation/product nodes -- to make cross-referencing cheaper than loading full graph.json files?
