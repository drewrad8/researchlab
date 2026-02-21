# Research Methodology: Comprehensive Improvement Roadmap

**Synthesis Document — ResearchLab Pipeline Enhancement**
**Date:** 2026-02-21
**Source Reports:** Five research papers from the Research Methodology Campaign

---

## Executive Summary

This document synthesizes findings from five independent research reports into a unified, prioritized roadmap for improving the ResearchLab pipeline. The reports cover systematic review methodology (Cochrane, GRADE, PRISMA), knowledge graph construction, citation network analysis & bibliometrics, intelligence analysis tradecraft, and information retrieval & ranking. Together, they identify **29 specific improvements** across all five pipeline phases (plan → classify → investigate → adjudicate → synthesize), the knowledge graph schema, and the source matching system.

### Top 5 Highest-Impact Improvements

1. **ACH Hypothesis Testing in Adjudication** *(Report 04, §9 Rec 1)* — The pipeline evaluates evidence items individually but never tests competing explanations against each other. Adding Analysis of Competing Hypotheses would prevent confirmation bias, surface diagnostic evidence, and produce more defensible conclusions. This is the single largest methodological gap.

2. **Source-Level Pre-Screening with Free APIs** *(Report 03, §9.1)* — Automated retraction checking, predatory journal detection, and bibliometric enrichment between Phase 2 and Phase 3 would catch problematic sources before expensive investigation pathways run. A retraction pre-check via CrossRef takes ~200ms vs. ~60 minutes of wasted investigation on a retracted paper.

3. **Evidence Hierarchy with GRADE Domains** *(Reports 01, §6 Recs 2–3)* — All evidence currently enters investigation at the same starting point. Assigning GRADE-aligned starting confidence tiers based on evidence type (RCTs start High, observational starts Low) and explicitly assessing the five GRADE downgrading domains would make confidence scoring rigorous and auditable.

4. **Multi-Field BM25 Source Matching** *(Report 05, §9.1 R1–R2)* — Source matching currently uses only tags with binary scoring. Extending to search `name`, `description`, and `tags` with BM25-style term frequency saturation and document length normalization would dramatically improve source relevance. This is ~30 lines of code with no external dependencies.

5. **Graph Provenance and Confidence Enhancement** *(Report 02, §5.3, §8.1)* — The knowledge graph lacks numeric confidence scores, edge-level confidence, multi-source attribution, temporal validity, and provenance chains. Adding these makes the graph computationally useful (thresholds, weighting, decay) and auditable (tracing facts back through the pipeline).

---

## Current State Assessment

### Pipeline Architecture

The pipeline follows a 5-phase architecture defined in `lib/pipeline.js`:

| Phase | Function | Current Capability | Key Gaps |
|-------|----------|-------------------|----------|
| 1. Plan | `phasePlanning()` | Generates sub-questions from topic | No protocol registration; no reproducibility guarantees; no search strategy documentation |
| 2. Classify | `phaseClassify()` | Evidence type taxonomy (11 types), NATO Admiralty ratings, decision tree classifier | Tags-only source matching; no automated source screening; subjective A-F ratings |
| 3. Investigate | `phaseInvestigate()` | Multi-level investigation pathways (P-SCI, P-GOV, etc.), RoB 2 assessment | Retraction checking is manual; no bibliometric data enrichment; no cross-pathway blind-spot detection |
| 4. Adjudicate | `phaseAdjudicate()` | Confidence scoring (V/P/U/D/R), P-CON contrarian pathway at >80% consensus, cross-project reconciliation | No hypothesis testing; no diagnostic evidence identification; no assumption tracking; contrarian analysis only for consensus claims |
| 5. Synthesize | `phaseSynthesis()` | Knowledge graph with typed nodes/edges, topic content, validation | No SoF table; no provenance; no temporal validity; no fact/judgment distinction |

### Source Matching (`lib/sources.js`)

The `matchSources()` function (lines 62–111) implements tag-based Boolean retrieval with ad-hoc scoring weights. It tokenizes the topic, matches against source tags using exact/substring matching, and returns the top 3 results above a minimum score of 3. **Critical gaps**: searches only `tags` (ignores `name`, `description`, `notes`, `exampleQueries`); no term frequency saturation; no IDF weighting; no document length normalization; no synonym expansion; hard score threshold filters out partial matches.

### Knowledge Graph (`lib/graph-builder.js`)

The graph uses a typed property-graph model with 8 node types and 7 edge types. `validateGraph()` (lines 77–152) checks structural integrity (required fields, valid types, duplicate IDs, dangling edges, topic coverage). **Critical gaps**: no edge-level confidence; single citation string per edge; no temporal dimension; no provenance chain linking facts back through evidence → investigation → adjudication; no parent reference validation; no edge type constraints (any node type can connect to any other); three edge types share names with node types (`solution`, `context`, `investigation`).

### Research Index (`lib/research-index.js`)

The `search()` function (lines 238–348) implements multi-field scoring with synonym expansion, bigram matching, and position-weighted scoring. It is significantly more sophisticated than source matching. **Remaining gaps**: no IDF weighting; manually curated synonyms; substring matching produces false positives (`"car"` matches inside `"cardiac"`); no evaluation harness.

---

## Priority 1: Critical — Implement First

These recommendations address fundamental methodological gaps that affect the quality of every research project.

### 1.1 ACH Hypothesis Testing in Verification

**Source:** Report 04 (Intelligence Analysis Tradecraft), §3 and §9 Rec 1

**Gap:** The pipeline evaluates each evidence item individually through its investigation pathway but never performs structured hypothesis testing where competing explanations are generated and systematically evaluated against the evidence. It asks "Is this evidence reliable?" but never asks "What are the alternative explanations, and which does the evidence best support?"

**Implementation:**

Add a new adjudication sub-step in `phaseAdjudicate()` (`pipeline.js`, after line 369) between per-evidence confidence scoring and consensus detection. For each sub-question, spawn a worker with the following task structure:

```
Given sub-question: "{question}"
Evidence items: [list with confidence ratings]

1. Generate 3-5 competing hypotheses that could answer this question.
2. For each evidence item, rate as Consistent/Inconsistent/Neutral for EACH hypothesis.
3. Identify DIAGNOSTIC evidence (helps distinguish between hypotheses).
4. Select the hypothesis least burdened by inconsistent evidence.
5. Output: {
     hypotheses: [...],
     matrix: [...],
     diagnosticEvidence: [...],
     selectedHypothesis: ...,
     reasoning: ...
   }
```

The key innovation from ACH (Heuer, *Psychology of Intelligence Analysis*, 1999) is **diagnosticity**: evidence consistent with all hypotheses has zero diagnostic value, even if it strongly "confirms" the preferred explanation. Only evidence that discriminates between hypotheses should influence the conclusion.

**Diagnosticity example** (from Report 04, §3.3):

| Evidence | H1: Drug X works | H2: Placebo effect | H3: Spontaneous recovery |
|---|---|---|---|
| Patient improved after taking Drug X | C | C | C |
| RCT shows drug outperforms placebo | C | I | N |
| Effect disappears when drug stopped | C | I | I |

Row 1 has zero diagnostic value — consistent with all three hypotheses. Rows 2 and 3 are highly diagnostic. The natural tendency is to weight Row 1 heavily because it "confirms" the preferred hypothesis, but ACH correctly identifies it as uninformative.

Store ACH results in `{projectDir}/adjudication/{qId}-ach.json`. The synthesis phase should reference which hypothesis was selected and why.

**Expected Impact:** Prevents confirmation bias in synthesis; surfaces which evidence actually matters; produces more defensible conclusions; satisfies ICD 203 Standard 4 (analysis of alternatives).

### 1.2 Source-Level Pre-Screening with Free APIs

**Source:** Report 03 (Citation Network Analysis), §9.1

**Gap:** The P-SCI pathway performs retraction checking and impact factor lookup as manual worker tasks in Level 1, but: (a) this only applies to scientific evidence — other types have no source-level checks; (b) it relies on worker interpretation, not automated verification; (c) it runs after classification, meaning a retracted paper triggers a full investigation pathway before being caught; (d) impact factor is the only bibliometric indicator checked — no field normalization, no citation network analysis.

**Implementation:**

Insert an automated source screening function between Phase 2 and Phase 3 in `pipeline.js:start()`. This should be a Node.js function (no worker spawn needed) that, for each evidence item with a DOI or PMID:

```javascript
async function preScreenEvidence(evidenceItems) {
  for (const item of evidenceItems) {
    const doi = item.citation?.doi;
    const pmid = item.citation?.pmid;

    // 1. Retraction check (~200ms per call)
    if (doi) {
      const crossrefData = await fetchJSON(
        `https://api.crossref.org/v1/works/${encodeURIComponent(doi)}`
      );
      if (crossrefData?.message?.['update-to']?.some(u => u.type === 'retraction')) {
        item.confidence = 'R';
        item.preScreenFlags = ['RETRACTED'];
        item.skipInvestigation = true;
        continue;
      }
    }

    // 2. Predatory journal check (OpenAlex is_in_doaj)
    if (doi) {
      const oaWork = await fetchJSON(
        `https://api.openalex.org/works/doi:${doi}?select=primary_location`
      );
      const source = oaWork?.primary_location?.source;
      if (source && source.is_in_doaj === false && !source.is_oa) {
        item.preScreenFlags = (item.preScreenFlags || []).concat('JOURNAL_NOT_IN_DOAJ');
      }
    }

    // 3. Bibliometric enrichment (Semantic Scholar)
    if (doi) {
      const s2 = await fetchJSON(
        `https://api.semanticscholar.org/graph/v1/paper/DOI:${doi}` +
        `?fields=citationCount,influentialCitationCount,citationVelocity`
      );
      if (s2) {
        item.bibliometrics = {
          citationCount: s2.citationCount,
          influentialCitationCount: s2.influentialCitationCount,
          citationVelocity: s2.citationVelocity
        };
      }
    }
  }
}
```

At ~200ms per API call and ~3-5 calls per evidence item, screening 20 evidence items takes ~15-20 seconds — negligible compared to investigation pathway time (~60 minutes per P-SCI pathway).

**Source-type-specific screening** (extending beyond P-SCI, per Report 03 §9.2):
- **P-GOV**: Check if the government source is a primary agency vs. secondary report. Cross-reference with official government domain registries.
- **P-ORG**: Check organization credibility via cross-referencing with registered NGO/institution databases.
- **P-MED**: Check media source reliability via known media bias/reliability databases.
- **P-EXP**: Check expert credibility via h-index, institutional affiliation, publications in field.

**Expected Impact:** Prevents wasted investigation cycles on retracted/predatory sources; provides structured bibliometric data for confidence scoring; extends source assessment beyond P-SCI to all evidence types.

### 1.3 Evidence Hierarchy with GRADE Domains

**Source:** Report 01 (Systematic Review Methodology), §2, §4, §6 Recs 2–3

**Gap:** All evidence currently enters investigation pathways at the same starting point. Confidence is computed purely from pathway results. GRADE mandates that RCTs start at "High" certainty and can only be downgraded, while observational studies start at "Low" and can be upgraded under specific conditions. The pipeline also lacks explicit assessment of GRADE's five downgrading domains.

**Implementation — Starting Tiers:**

Add a `startingTier` field to evidence manifest output in Phase 2. Map evidence types to starting confidence:

| Tier | Evidence Types | Starting Confidence |
|------|---------------|-------------------|
| Tier 1 | Meta-analyses, systematic reviews (SCI) | potential-High |
| Tier 2 | RCTs, government data (SCI, GOV) | potential-High |
| Tier 3 | Observational studies, organizational reports (SCI, ORG) | potential-Moderate |
| Tier 4 | Expert opinion, case reports, technical claims (EXP, TEC) | potential-Low |
| Tier 5 | Media reports, historical claims (MED, HIS) | potential-Low |
| Tier 6 | Testimonials, financial claims (TES, FIN) | potential-Very Low |
| Tier 7 | Documents without verification (DOC) | potential-Very Low |

The extended hierarchy is adapted from the standard evidence pyramid (Report 01, §4.1; Burns et al. 2011, [PMC3124652](https://pmc.ncbi.nlm.nih.gov/articles/PMC3124652/)).

**Implementation — GRADE Domains:**

Add a `gradeAssessment` object to each adjudicated evidence record in Phase 4. This should operate at the **sub-question level** (body of evidence), not individual evidence item level — a fundamental distinction from the current per-item confidence scoring.

```javascript
const gradeAssessment = {
  // Five downgrading domains (Report 01, §2.4)
  d1RiskOfBias: 'not serious' | 'serious' | 'very serious',
  d2Inconsistency: 'not serious' | 'serious' | 'very serious',
  d3Indirectness: 'not serious' | 'serious',
  d4Imprecision: 'not serious' | 'serious',
  d5PublicationBias: 'undetected' | 'strongly suspected',
  // Three upgrading factors — observational evidence only (Report 01, §2.5)
  u1LargeEffect: false,  // RR > 2 or < 0.5
  u2DoseResponse: false,
  u3OpposingConfounding: false,
  // Computed GRADE certainty
  gradeCertainty: 'high' | 'moderate' | 'low' | 'very low'
};
```

The `computeConfidence()` function should produce both the V/P/U/D/R rating AND a GRADE certainty — they serve different purposes. V/P/U/D/R captures verification status; GRADE captures evidence certainty.

**Key GRADE rule** (Report 01, §2.5): Evidence rated down for one or more domains should generally NOT be rated up, as this may overstate certainty. Each downgrading domain can reduce certainty by one or two levels.

**Expected Impact:** Aligns with the dominant evidence quality framework used by WHO and 100+ organizations; prevents low-quality evidence from receiving unwarranted confidence levels; makes the evidence quality assessment transparent and auditable.

### 1.4 Multi-Field BM25 Source Matching

**Source:** Report 05 (Information Retrieval), §9.1 R1–R2

**Gap:** `matchSources()` in `lib/sources.js` only searches the `tags` field. Each source also has `name`, `description`, `baseUrl`, `notes`, and `exampleQueries` — all of which could contribute to relevance. The scoring uses binary matching without term frequency saturation, IDF weighting, or document length normalization.

**Implementation:**

Replace the current scoring in `lib/sources.js:matchSources()` with a simplified BM25 scorer across multiple fields. BM25 (Robertson & Walker, 1994) addresses TF-IDF's limitations with two key innovations: **term frequency saturation** (k1 parameter) and **document length normalization** (b parameter).

```javascript
// BM25 core — ~30 lines, no dependencies
function bm25Score(tf, dl, avgdl, df, N, k1 = 1.2, b = 0.75) {
  const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
  const tfNorm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dl / avgdl));
  return idf * tfNorm;
}

function matchSources(topic, maxResults = 3) {
  const sources = loadAll();
  if (!sources.length) return [];

  const topicTokens = tokenize(topic);
  const N = sources.length;

  // Compute document frequency for each token across all sources
  const df = {};
  for (const src of sources) {
    const text = [src.name, src.description, (src.tags || []).join(' ')].join(' ').toLowerCase();
    const seen = new Set();
    for (const token of topicTokens) {
      if (!seen.has(token) && text.includes(token)) {
        df[token] = (df[token] || 0) + 1;
        seen.add(token);
      }
    }
  }

  // BM25F field weights: name (4x), tags (2x), description (1x)
  // BM25F extends BM25 to multi-field documents (Report 05, §2.2)
  const FIELD_WEIGHTS = { name: 4, tags: 2, description: 1 };

  // Compute average document lengths per field
  const avgdl = {};
  for (const field of Object.keys(FIELD_WEIGHTS)) {
    const lengths = sources.map(s => {
      if (field === 'tags') return (s.tags || []).join(' ').split(/\s+/).length;
      return (s[field] || '').split(/\s+/).length;
    });
    avgdl[field] = lengths.reduce((a, b) => a + b, 0) / lengths.length || 1;
  }

  const scored = sources.map(src => {
    let totalScore = 0;
    for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
      const text = field === 'tags'
        ? (src.tags || []).join(' ').toLowerCase()
        : (src[field] || '').toLowerCase();
      const tokens = text.split(/\s+/);
      const dl = tokens.length;

      for (const qToken of topicTokens) {
        const tf = tokens.filter(t => t === qToken || t.includes(qToken)).length;
        if (tf > 0) {
          totalScore += weight * bm25Score(tf, dl, avgdl[field], df[qToken] || 0, N);
        }
      }
    }
    return { ...src, _matchScore: totalScore };
  });

  // Dynamic threshold: return results scoring above 50% of top score
  // (replaces hard MIN_SCORE=3 cutoff — Report 05, §8.4 issue 5)
  const topScore = Math.max(...scored.map(s => s._matchScore), 0);
  const threshold = topScore * 0.5;

  return scored
    .filter(s => s._matchScore > threshold && s._matchScore > 0)
    .sort((a, b) => b._matchScore - a._matchScore)
    .slice(0, maxResults);
}
```

**Parameters** (from Report 05, §2.2):
- `k1 = 1.2` — Controls term frequency saturation. Higher values (up to 2.0) give more credit for repeated terms. The default of 1.2 works well for most corpora.
- `b = 0.75` — Controls document length normalization. 0 = no length normalization; 1 = full normalization. Default 0.75 is the standard.

**Expected Impact:** Dramatically increases the surface area for source matching; BM25's term frequency saturation and length normalization produce better rankings than binary matching; IDF weighting ensures rare, specific terms (e.g., "microplastics") count more than common terms (e.g., "health").

### 1.5 Graph Provenance and Confidence Enhancement

**Source:** Report 02 (Knowledge Graph Construction), §5.3, §8.1–8.2

**Gap:** The graph has no numeric confidence scores (only categorical V/P/U/D), no edge-level confidence, single citation string per edge, no temporal dimension, and no provenance chain linking facts back through evidence → investigation → adjudication.

**Implementation — Numeric Confidence (R2 from Report 02):**

Add a `confidenceScore` field (0–1) alongside the categorical label in `buildNode()` (`graph-builder.js`):

```javascript
function buildNode(id, label, type, opts = {}) {
  // ... existing code ...
  if (opts.confidenceScore != null) node.confidenceScore = opts.confidenceScore;
  // ...
}
```

Map ranges: verified=0.85–1.0, plausible=0.5–0.84, unverified=0.2–0.49, disputed=0.05–0.19.

Google Enterprise KG uses numeric 0–1 confidence scores for entity reconciliation (Report 02, §2.2). This enables mathematical operations — averaging, weighting, threshold-based filtering — that categorical labels cannot support.

**Implementation — Edge-Level Confidence (R6 from Report 02):**

Extend `buildEdge()` to accept optional `confidence` (0–1) and `weight` (number of supporting sources):

```javascript
function buildEdge(source, target, label, type, opts = {}) {
  // ... existing validation ...
  const edge = { source, target, label: label.toUpperCase(), type };
  if (opts.citation) edge.citation = opts.citation;
  if (opts.confidence != null) edge.confidence = opts.confidence;
  if (opts.weight != null) edge.weight = opts.weight;
  return edge;
}
```

This is inspired by Wikidata's three-layer structure: claim → qualifiers → references (Report 02, §2.1).

**Implementation — Graph-Level Metadata (R1 from Report 02):**

Add a `meta` object at the graph root:

```javascript
{
  meta: {
    topic: "Research Topic",
    projectId: "abc-123",
    createdAt: "2026-02-21T14:30:00Z",
    pipelineVersion: "1.0",
    confidenceDistribution: { verified: 5, plausible: 12, unverified: 3, disputed: 1 },
    nodeCount: 21,
    edgeCount: 35
  },
  nodes: [...],
  edges: [...],
  topics: {...}
}
```

**Implementation — Parent Reference Validation (R3 from Report 02):**

Add to `validateGraph()` in the node loop (after line 101):

```javascript
if (n.parent && !nodeIds.has(n.parent)) {
  errors.push(`nodes[${i}]: parent "${n.parent}" not found in nodes`);
}
```

**Implementation — Edge Type Constraints (R4 from Report 02):**

Define valid source→target node type pairs for each edge type:

```javascript
const EDGE_CONSTRAINTS = {
  causation:     { source: ['contaminant', 'context'], target: ['health-effect'] },
  evidence:      { source: ['*'], target: ['*'] },  // flexible
  composition:   { source: ['domain'], target: ['contaminant', 'solution', 'context'] },
  solution:      { source: ['solution', 'product', 'recommendation'], target: ['health-effect', 'contaminant'] },
  gap:           { source: ['*'], target: ['*'] },
  context:       { source: ['context'], target: ['*'] },
  investigation: { source: ['investigation'], target: ['*'] }
};
```

**Expected Impact:** Enables mathematical operations on confidence (thresholds, weighting, decay); allows expressing relationship strength independently of node confidence; provides auditability from graph facts back through the pipeline; catches structural errors in parent references and edge type violations.

---

## Priority 2: High Value — Implement Incrementally

These recommendations improve transparency, granularity, and robustness. They can be implemented independently.

### 2.1 Protocol Phase (Phase 0)

**Source:** Report 01, §1.3, §6 Rec 1

**Gap:** Phase 1 generates sub-questions but no reproducible protocol. Two runs of the same topic may produce different sub-questions, different search strategies, and different results. Cochrane requires a published protocol before any review begins (Cochrane Handbook Chapter II).

**Implementation:**

Add a `phaseProtocol()` function before `phasePlanning()` in `pipeline.js`. Generate a `protocol.json` that locks:
- Research question in structured format (adapted PICO: Population, Intervention, Comparator, Outcome)
- Inclusion/exclusion criteria for evidence
- Predetermined search strategy (which source types, databases, date ranges)
- Assessment methodology per evidence type
- Predetermined sensitivity analyses

The protocol should be generated by a single worker, then frozen — subsequent phases read but cannot modify it. Include a SHA-256 hash of the protocol in all subsequent output files for auditability.

### 2.2 Search Documentation / PRISMA Audit Trail

**Source:** Report 01, §3.4, §6 Rec 4 (PRISMA Items 6–7, 14a)

**Gap:** Workers perform searches but don't document what they searched, what they found, and what they excluded. There is no record of what sources were consulted, what was excluded and why, or how disagreements between workers were resolved.

**Implementation:**

Add a `searchLog` field to the evidence manifest output schema in Phase 2:

```json
{
  "searchLog": [
    { "source": "PubMed", "query": "PFAS health effects", "resultsFound": 45, "resultsReviewed": 20, "included": 5 },
    { "source": "Google Scholar", "query": "PFAS cancer risk", "resultsFound": 200, "resultsReviewed": 30, "included": 3 }
  ],
  "exclusionReasons": [
    { "evidenceId": "e-excluded-1", "reason": "Published before 2015 cutoff date" },
    { "evidenceId": "e-excluded-2", "reason": "Animal study, not human population" }
  ]
}
```

Generate a PRISMA-style flow diagram in synthesis (Report 01, §3.3):
```
IDENTIFICATION → Records from databases (n=?) + other sources (n=?) − duplicates (n=?)
SCREENING → Records screened (n=?) − excluded (n=?)
ELIGIBILITY → Full-text assessed (n=?) − excluded with reasons (n=?)
INCLUDED → Studies in review (n=?) + studies in synthesis (n=?)
```

### 2.3 Summary of Findings Table

**Source:** Report 01, §6 Rec 5 (GRADE SoF tables, PRISMA Item 22, Cochrane Chapter 14)

**Gap:** The synthesis phase produces only a knowledge graph. There is no structured summary table for reviewer-friendly overview.

**Implementation:**

In Phase 5, produce a `summary-of-findings.json` alongside `graph.json`:

```json
{
  "title": "Summary of Findings: [Topic]",
  "findings": [
    {
      "subQuestionId": "q1",
      "question": "What are the health effects of PFAS exposure?",
      "evidenceCount": 12,
      "studyDesigns": ["3 RCTs", "5 cohort", "4 expert opinion"],
      "keyResult": "PFAS exposure above 70 ppt associated with increased kidney cancer risk",
      "effectEstimate": "OR 1.4 (95% CI 1.1-1.8)",
      "gradeCertainty": "moderate",
      "pipelineConfidence": "P",
      "confidenceRationale": "Downgraded one level for imprecision",
      "gradeDowngrades": ["imprecision: serious (small sample sizes)"],
      "gradeUpgrades": [],
      "limitations": "Limited to occupational exposure studies"
    }
  ]
}
```

Expose via the API at `GET /api/projects/:id` alongside the graph.

### 2.4 Assumption Tracking

**Source:** Report 04 (Intelligence Tradecraft), §2.2 (Key Assumptions Check), §9 Rec 2

**Gap:** Workers make assumptions throughout the pipeline — about source authority, replication standards, bias thresholds — but these are never explicitly documented, tracked, or challenged. Per ICD 203 Standard 3, assumptions must be distinguished from facts and judgments. Linchpin assumptions (those the entire assessment rests on) must be explicitly flagged.

**Implementation:**

Add `assumptions` to the required output schema in investigation pathway worker tasks:

```json
{
  "assumptions": [
    {
      "text": "Journal impact factor >5 indicates a reputable venue",
      "classification": "reasonable",
      "isLinchpin": false
    },
    {
      "text": "The study's self-reported exposure data is accurate",
      "classification": "unsupported",
      "isLinchpin": true
    }
  ]
}
```

In `phaseAdjudicate()`, aggregate all assumptions from pathway results. Flag any unsupported linchpin assumptions as confidence-lowering factors. Store in `{projectDir}/adjudication/assumptions.json`.

**Key Assumptions Check categories** (Report 04, §2.2):
- **Well-supported**: Strong evidence base
- **Reasonable**: No evidence against, but limited positive evidence
- **Unsupported**: Assumed by convention or habit, no evidence

### 2.5 Extended Alternative Analysis

**Source:** Report 04, §4 (Devil's Advocacy), §9 Rec 4

**Gap:** The P-CON contrarian pathway fires only when consensus exceeds 80%. ICD 203 Standard 4 requires alternative analysis on *all* major judgments, not just consensus ones. Low-consensus claims — where evidence is mixed — arguably need alternative analysis even more.

The current implementation is well-designed (it correctly implements the 10th Man doctrine from Israeli intelligence post-1973 — Report 04, §4.1). The gap is scope: it needs to cover all sub-questions, not just high-consensus ones.

**Implementation:**

In `phaseAdjudicate()`, for each sub-question, add a mandatory alternative analysis prompt section to the adjudication workflow:

```
ALTERNATIVE ANALYSIS (mandatory per ICD 203 Standard 4):
1. What is the strongest alternative interpretation of this evidence?
2. What would have to be true for that alternative to be correct?
3. How confident are you that the primary interpretation is correct vs. the alternative?
```

Reserve the full P-CON pathway spawn for high-consensus cases ($>80\%$). For other sub-questions, perform the lighter-weight alternative analysis within the existing adjudication workflow.

### 2.6 Fact/Judgment/Assumption Markup

**Source:** Report 04, §6.4, §9 Rec 5

**Gap:** The final knowledge graph topic content does not distinguish between established facts, analyst assumptions, and analytic judgments. A reader cannot tell which claims are directly supported by evidence and which are inferential leaps.

ICD 203 Standard 3 requires products to clearly separate three types of content:
1. **Facts/Information**: Raw source data, verifiable observations
2. **Assumptions**: Suppositions that bridge gaps in information
3. **Judgments**: Conclusions derived from evidence, analysis, and stated assumptions

**Implementation:**

Extend the topic section schema with a `statementTypes` array:

```json
{
  "heading": "Section Heading",
  "content": "Detailed paragraph...",
  "statementTypes": [
    {
      "text": "Fluoride levels above 4 mg/L are associated with skeletal fluorosis",
      "type": "fact",
      "citation": "WHO 2006"
    },
    {
      "text": "This suggests household filtration is sufficient for most well water",
      "type": "judgment",
      "assumptions": ["fluoride is the primary contaminant of concern"]
    }
  ]
}
```

### 2.7 Edge-Level Confidence and Qualifiers

**Source:** Report 02, §2.1 (Wikidata), §5.3, §8.2 R6/R11

**Gap:** Edge metadata is minimal — only `label`, `type`, and an optional `citation` string. The strength of a `causation` relationship cannot be expressed independently of the nodes it connects. A single `citation` string cannot express "claimed by Study A (2023), corroborated by Study B (2024), contradicted by Study C (2025)."

**Implementation:**

Extend edges with rich metadata inspired by Wikidata's qualifier model:

```javascript
{
  source: "pfas-contamination",
  target: "pfas-kidney-cancer",
  label: "CAUSES",
  type: "causation",
  confidence: 0.72,
  weight: 3,  // number of supporting sources
  citation: "Smith et al. (2024)",  // keep for backward compatibility
  citations: [  // NEW: multi-source attribution
    { text: "Smith et al. (2024)", url: "...", pmid: "12345", reliability: "A", infoRating: "2" },
    { text: "EPA (2023)", url: "...", reliability: "A", infoRating: "1" }
  ],
  qualifiers: {  // NEW: Wikidata-inspired qualifiers
    mechanism: "oxidative stress",
    doseResponse: "positive correlation above 10 ng/mL",
    population: "occupational exposure cohort",
    studyType: "prospective cohort"
  }
}
```

Update `validateGraph()` to accept either `citation` (string, backward compatible) or `citations` (array) format.

### 2.8 Composite Source Reliability Scoring

**Source:** Report 03, §7.5

**Gap:** Workers assign subjective A-F source ratings based on personal assessment during broad research. There are no structured criteria or automated checks guiding this assignment.

**Implementation:**

Construct a composite score from API data:

```
Source Reliability Score = weighted combination of:

  Journal Quality (40%):
    - SJR percentile in field (via SCImago or OpenAlex) — field-normalized, free API
    - DOAJ membership (binary) — OpenAlex is_in_doaj field
    - Scopus/WoS indexing (binary)
    - Self-citation ratio (negative signal, >30% = red flag per Report 03, §4.1.1)

  Paper Impact (30%):
    - Influential citation count (Semantic Scholar — uniquely useful, filters perfunctory citations)
    - Citation velocity (Semantic Scholar — trending/declining indicator)
    - Citation trajectory (OpenAlex counts_by_year — increasing vs. declining)

  Author Credibility (15%):
    - Author h-index (Semantic Scholar)
    - Institutional affiliation quality (OpenAlex)

  Integrity Checks (15%):
    - Retraction status (CrossRef/Retraction Watch — binary, critical override)
    - Corrections/errata (CrossRef — flag)
    - Funding conflicts (CrossRef funder data)
    - Predatory journal indicators (DOAJ + heuristics from Report 03, §5.2)
```

Map to existing scale: A (≥0.8), B (0.6–0.8), C (0.4–0.6), D (0.2–0.4), E (<0.2), F (insufficient data). Store as structured metadata, making the rating auditable and reproducible across pipeline runs.

### 2.9 Evaluation Test Set for Source Matching

**Source:** Report 05, §9.2 R8

**Gap:** Without a test set of (query, expected-results) pairs and evaluation metrics, it is impossible to know whether scoring changes actually improve retrieval quality.

**Implementation:**

Create 20–30 (topic, expected-sources) pairs representing known-good matches. Compute Precision@3 and nDCG@3 before and after any scoring changes. Store in `tests/source-matching-eval.json`:

```json
{
  "testCases": [
    {
      "topic": "PFAS contamination in drinking water",
      "expectedSources": ["epa-echo", "usgs-water", "pubmed"],
      "relevanceGrades": { "epa-echo": 3, "usgs-water": 3, "pubmed": 2 }
    }
  ]
}
```

nDCG is the recommended primary metric (Report 05, §7.5) because source relevance is naturally graded — a source about exactly the right API is more relevant than a loosely related one.

---

## Priority 3: Refinement — Implement After Core

These improvements add granularity, coverage, and robustness once the core methodology is sound.

### 3.1 Dual-Assessment for High-Stakes Evidence

**Source:** Report 01, §6 Rec 8 (Cochrane dual-reviewer requirement, PRISMA Item 8)

For Tier 1–2 evidence or evidence directly answering a core sub-question, spawn two independent investigation workers and compare findings. If they agree, proceed; if they disagree, flag for manual review or spawn a tiebreaker. This increases cost by ~30% for high-tier evidence but significantly improves reliability.

Add a `dualAssessment` flag to high-importance evidence items in the manifest. In `runPathway()`, spawn two parallel Level 1 workers for flagged items.

### 3.2 Temporal Validity for Graph Nodes

**Source:** Report 02, §6.4

Add optional `validFrom` and `validUntil` fields to graph nodes. A claim that "PFAS is unregulated" may have been true in 2020 but not in 2025 after new EPA regulations.

Knowledge graphs should annotate facts with:
- **Transaction time** (`createdAt`) — when the fact was added to the graph
- **Valid time** (`validFrom`, `validUntil`) — the period during which the fact was true in the real world

Adding `createdAt` is trivial. Adding `validFrom`/`validUntil` requires the synthesis worker to assess temporal scope — guided by investigation pathway results which already examine source dates.

### 3.3 Graph Topology Metrics

**Source:** Report 02, §4.4, §8.3 R12

Compute and store topology metrics in graph metadata as quality gates:

```javascript
// Density — target 0.05-0.15 for navigability
const density = graph.edges.length / (graph.nodes.length * (graph.nodes.length - 1));

// Average degree — target 2-5 for research graphs
const avgDegree = 2 * graph.edges.length / graph.nodes.length;

// Connected component count — target 1 (fully connected)
const components = countConnectedComponents(graph);

// Isolated nodes (non-domain nodes with no edges)
const connectedNodes = new Set();
for (const e of graph.edges) {
  connectedNodes.add(e.source);
  connectedNodes.add(e.target);
}
const isolated = graph.nodes.filter(n => !connectedNodes.has(n.id) && n.type !== 'domain');
```

Use as validation warnings (not hard errors) to flag graphs that are too sparse or disconnected.

### 3.4 Citation Burst Detection

**Source:** Report 03, §3.3 (Kleinberg's Algorithm)

Implement citation burst detection as a per-source signal: is a cited paper currently in a citation burst (high relevance) or at historical baseline? Kleinberg's algorithm (2002) models citation activity as a probabilistic automaton with baseline and burst states. CiteSpace implements this algorithm.

Use OpenAlex `counts_by_year` data from the pre-screening phase (P1.2) to compute bursts. Papers in burst periods receive a relevance boost in confidence scoring. This helps distinguish seminal works receiving renewed attention from papers at historical baseline.

### 3.5 Citation Manipulation Detection

**Source:** Report 03, §4.2

Add automated heuristics from available API data:

| Signal | Threshold | Data Source | Confidence Impact |
|--------|-----------|-------------|-------------------|
| Journal self-citation ratio | > 30% | OpenAlex source entity | Downgrade one level |
| Author self-citation ratio | > 40% | Semantic Scholar author entity | Flag for review |
| Journal suspended from JCR | Any suspension | Clarivate (manual list) | Downgrade to DISPUTED |
| Citation concentration | > 15% from single source | OpenAlex cited_by data | Flag for review |
| Reciprocal citation anomaly | Bidirectional excess | OpenAlex source-to-source | Flag for review |

These checks use data already available from the pre-screening API calls (P1.2) — no additional API calls needed. The CIDRE algorithm (Nature Scientific Reports 2021) detects >50% of journals subsequently suspended from JCR.

### 3.6 Diagnostic Evidence Scoring

**Source:** Report 04, §3.3, §9 Rec 3

After building the ACH matrix (P1.1), compute a diagnosticity score for each evidence item. Evidence that discriminates between hypotheses gets a high score; evidence consistent with all hypotheses gets a low score.

```json
{
  "evidenceId": "e1",
  "diagnosticity": 0.8,
  "discriminatesFor": "H2",
  "discriminatesAgainst": ["H1", "H3"]
}
```

Weight confidence computations by diagnosticity rather than treating all confirmations equally. This prevents low-value evidence from inflating confidence — the single most common failure mode in evidence synthesis.

### 3.7 Confirmation Cascade Check

**Source:** Report 04, §5.4 (Confirmation Cascade), §9 Rec 7

Add a "blind spot" check between Phase 2 and Phase 3: spawn a single worker asking:

```
Given topic: "{topic}" and the following evidence classification results: [summary]
1. What evidence categories have ZERO items? Why might that be?
2. What alternative framings of the research question might surface different evidence?
3. Are there any sources or evidence types that should have been found but weren't?
Output: { blindSpots: [...], alternativeFramings: [...], missingSources: [...] }
```

If significant blind spots are identified, spawn supplementary classification workers to fill gaps before proceeding to investigation. This guards against Phase 2 workers anchoring all downstream investigation (analogous to prompt bias — Report 04, §5.4).

### 3.8 Weighted Confidence Scoring

**Source:** Report 04, §7 (Weighted Scoring Matrices), §9 Rec 8

Replace the rule-based `computeConfidence()` in `lib/investigation-tree.js` with a weighted scoring matrix:

```javascript
const CONFIDENCE_CRITERIA = [
  { name: 'sourceReliability', weight: 0.20, description: 'A/B rated sources' },
  { name: 'replication',       weight: 0.25, description: 'Independent confirmation' },
  { name: 'biasAbsence',       weight: 0.20, description: 'Absence of funding/methodology bias' },
  { name: 'consistency',       weight: 0.15, description: 'Consistency with established knowledge' },
  { name: 'diagnosticity',     weight: 0.20, description: 'Diagnostic value of evidence' }
];

// Compute weighted score per evidence item, then map:
// 0.80-1.00 → V (Verified)
// 0.50-0.79 → P (Plausible)
// 0.20-0.49 → U (Unverified)
// 0.00-0.19 → D (Disputed)
```

Include the full scoring breakdown in the output for transparency and auditability. Weights should be derived from evidence (diagnostic value) rather than analyst intuition — this parallels ACH's diagnosticity concept.

### 3.9 Semantic Retrieval for Source Matching

**Source:** Report 05, §3, §9.3 R9

If an embedding model becomes available (e.g., via a Strategos-accessible API), compute source embeddings offline and add cosine similarity as a second retrieval signal, fused with BM25 via Reciprocal Rank Fusion (RRF — Cormack et al. 2009):

```
RRF_score(d) = 1/(60 + rank_bm25(d)) + 1/(60 + rank_semantic(d))
```

RRF requires no score normalization, no training data, and is the production standard for hybrid retrieval (used by Elasticsearch since v8.x, Weaviate since v1.17, Vespa). The k=60 smoothing constant controls how quickly scores decrease with rank.

This would address the vocabulary mismatch problem — "machine learning" would match sources tagged "artificial-intelligence" — which is the primary motivation for semantic retrieval (Report 05, §3.1).

### 3.10 LLM Query Expansion

**Source:** Report 05, §5.2, §9.3 R10

Before source matching, use the planning worker's LLM to expand the topic into related terms and alternative phrasings. This is essentially free if the LLM call is already happening during planning. Filter expansion terms against the source registry vocabulary to prevent hallucination-driven false matches.

Recent systems (2025): GenQREnsemble, DeepRAG, UniRAG, and CoT-RAG all demonstrate effective LLM-based query expansion (Report 05, §5.2). The hallucination risk is mitigated by filtering expansion terms against terms that actually appear in the source registry.

### 3.11 Future Indicators

**Source:** Report 04, §2.4 (Indicators and Signposts), §9 Rec 6

For each major judgment in the knowledge graph, identify what future evidence would confirm, weaken, or overturn the judgment. Store as monitoring indicators:

```json
{
  "indicators": [
    { "event": "New RCT on X published", "effect": "confirm", "description": "Would strengthen the causal link" },
    { "event": "Y retracted", "effect": "weaken", "description": "Would remove key supporting evidence" },
    { "event": "EPA issues new regulation", "effect": "overturn", "description": "Would change the regulatory context" }
  ]
}
```

This makes assessments future-aware and enables re-evaluation when conditions change — directly implementing IC "Indicators and Signposts" tradecraft (CIA Tradecraft Primer, 2009; Report 04, §2.4).

---

## Implementation Roadmap

### Phase A: Foundation (Core Methodology)

**Focus:** Fix the biggest methodological gaps with the highest ROI.

| # | Item | Effort | Impact | Source |
|---|------|--------|--------|--------|
| A1 | Multi-field BM25 source matching | Low | High | Report 05, §9.1 |
| A2 | Source pre-screening (retraction, predatory, bibliometrics) | Medium | High | Report 03, §9.1 |
| A3 | Evidence hierarchy starting tiers | Low | High | Report 01, §6 Rec 2 |
| A4 | Graph numeric confidence + parent validation + edge constraints | Low | High | Report 02, §8.1 |
| A5 | Synonym expansion for sources.js | Low | High | Report 05, §9.1 R3 |

**Dependencies:** A1 and A5 share tokenization logic — implement together. Port the `SYNONYM_GROUPS` and `expandToken()` from `research-index.js` to `sources.js` (or extract to a shared module). A3 feeds into A2 (tiers inform which sources to pre-screen more aggressively).

### Phase B: Rigor (Analytical Depth)

**Focus:** Add structured hypothesis testing and evidence quality frameworks.

| # | Item | Effort | Impact | Source |
|---|------|--------|--------|--------|
| B1 | ACH hypothesis testing in adjudication | High | Very High | Report 04, §9 Rec 1 |
| B2 | GRADE downgrade/upgrade domains | Medium | High | Report 01, §6 Rec 3 |
| B3 | Assumption tracking | Medium | Medium | Report 04, §9 Rec 2 |
| B4 | Search documentation / PRISMA trail | Low | Medium | Report 01, §6 Rec 4 |
| B5 | Extended alternative analysis | Medium | Medium | Report 04, §9 Rec 4 |
| B6 | Evaluation test set | Medium | High (enables validation) | Report 05, §9.2 R8 |

**Dependencies:** B1 benefits from GRADE domains (B2) for meaningful hypothesis evaluation. B6 should be built early to validate all other changes.

### Phase C: Polish (Completeness)

**Focus:** Enhance outputs, add monitoring, refine edge cases.

| # | Item | Effort | Impact | Source |
|---|------|--------|--------|--------|
| C1 | Summary of Findings table | Medium | Medium | Report 01, §6 Rec 5 |
| C2 | Fact/judgment/assumption markup | Medium | Medium | Report 04, §9 Rec 5 |
| C3 | Edge-level confidence + qualifiers | Medium | Medium | Report 02, §8.2 R6/R11 |
| C4 | Composite source reliability scoring | Medium | Medium | Report 03, §9.3 |
| C5 | Protocol phase | Medium | Medium | Report 01, §6 Rec 1 |
| C6 | Graph topology metrics | Low | Low | Report 02, §8.3 R12 |
| C7 | Temporal validity | Low | Medium | Report 02, §6.4 |
| C8 | Citation burst detection | Medium | Low | Report 03, §9.6 |
| C9 | Semantic retrieval (if embeddings available) | High | High | Report 05, §9.3 R9 |
| C10 | Future indicators | Low | Low | Report 04, §9 Rec 6 |

---

## Cross-Cutting Themes

Four themes emerge across all five reports and should inform every implementation decision:

### Confidence Calibration

All five reports address confidence/certainty from different angles:
- **GRADE** (Report 01): Four-level certainty based on five downgrading domains. Evidence starts at High or Low depending on study design.
- **Knowledge Graphs** (Report 02): Numeric 0–1 scoring enabling mathematical operations. Google Enterprise KG averages three independent sources per fact.
- **Bibliometrics** (Report 03): Composite source reliability scores from API data. SNIP and SJR are recommended for field-normalized assessment.
- **IC Tradecraft** (Report 04): Three-level ICD 203 confidence tied to evidence quality. Confidence and likelihood must never be combined in the same sentence.
- **IR Metrics** (Report 05): Graded relevance (nDCG) for search evaluation. Relevance is naturally graded, not binary.

**Recommendation:** Maintain the V/P/U/D/R system for verification status (it captures states GRADE doesn't address, like "disputed" and "retracted") but add parallel GRADE certainty assessment and numeric 0–1 scores. These serve different purposes: V/P/U/D/R answers "Has this been verified?", GRADE answers "How certain is the evidence?", and numeric scores enable computation. This is the conclusion of Report 01, §9 Open Question 5.

### Provenance and Auditability

Every report identifies insufficient provenance tracking:
- **PRISMA** (Report 01): Search strategy documentation, PRISMA flow diagram, complete search strings not just databases
- **KG Best Practice** (Report 02): W3C PROV-O model (Entity/Activity/Agent), evidence chain tracking, Dublin Core metadata elements
- **Bibliometrics** (Report 03): Source-level metadata enrichment with free APIs, structured citation objects
- **IC Standards** (Report 04): ICD 203 Standard 1 (source quality & credibility), Standard 7 (change documentation)
- **IR** (Report 05): Source usage tracking for feedback loops, query-source success data

**Recommendation:** Implement provenance at three levels: (1) graph-level metadata (when created, by what pipeline version); (2) node-level provenance (which evidence items, which worker, which phase — following PROV-O Entity/Activity/Agent model); (3) edge-level attribution (which sources support this relationship, with structured citation arrays).

### Competing Explanations

Three reports independently argue for systematic consideration of alternatives:
- **Cochrane** (Report 01): Heterogeneity assessment, sensitivity analysis, subgroup analysis to explore inconsistency
- **ACH** (Report 04): Hypothesis matrix, diagnosticity scoring, selection of hypothesis least burdened by inconsistencies
- **Devil's Advocacy** (Report 04): Institutionalized dissent, 10th Man doctrine (Israel post-1973), Team A/Team B (CIA 1976)

**Recommendation:** The pipeline already implements devil's advocacy (P-CON at >80% consensus) but lacks hypothesis testing (ACH) and systematic heterogeneity assessment (GRADE Domain 2: Inconsistency). ACH is the highest-impact addition because it changes *how* evidence is evaluated — focusing on diagnostic evidence and disconfirmation rather than confirmation.

### Source Quality as First-Class Concern

Two reports focus entirely on source quality (03, 05) and all five reference it:
- **Current state:** Source quality is assessed subjectively by workers using A-F ratings. The P-SCI pathway checks retraction status and IF manually. Other evidence types have no source-level checks.
- **Target state:** Source quality is assessed programmatically before investigation, enriched with bibliometric data from free APIs (OpenAlex, Semantic Scholar, CrossRef), and tracked as structured metadata through the pipeline to the final graph.

**Recommendation:** The source pre-screening phase (P1.2) is the single intervention point that addresses source quality across all evidence types. It should be implemented as infrastructure that benefits every subsequent pipeline phase. Use SNIP and SJR as primary journal-level indicators (Report 03, §2.7), Semantic Scholar's `influentialCitationCount` for paper-level impact, and a whitelist approach for predatory journal detection (DOAJ + Scopus + PubMed indexing — Report 03, §5.3).

---

## Key References

### Systematic Review Methodology (Report 01)
- Higgins JPT et al. *Cochrane Handbook for Systematic Reviews of Interventions* v6.5 (updated August 2024). [cochrane.org/handbook](https://www.cochrane.org/authors/handbooks-and-manuals/handbook)
- Schünemann H et al. *GRADE Handbook*. [gradepro.org/handbook](https://gradepro.org/handbook/)
- Page MJ et al. "The PRISMA 2020 statement." *BMJ* 2021;372:n71. [doi:10.1136/bmj.n71](https://pubmed.ncbi.nlm.nih.gov/33782057/)
- Page MJ et al. "PRISMA 2020 explanation and elaboration." *BMJ* 2021;372:n160. [PMC8005925](https://pmc.ncbi.nlm.nih.gov/articles/PMC8005925/)
- Sterne JAC et al. "RoB 2: a revised tool for assessing risk of bias in randomised trials." *BMJ* 2019;366:l4898. [methods.cochrane.org/bias](https://methods.cochrane.org/bias/resources/rob-2-revised-cochrane-risk-bias-tool-randomized-trials)
- Burns PB et al. "The levels of evidence and their role in evidence-based medicine." *Plast Reconstr Surg* 2011;128(1):305–310. [PMC3124652](https://pmc.ncbi.nlm.nih.gov/articles/PMC3124652/)
- CDC ACIP GRADE Handbook Chapters 7–8. [cdc.gov](https://www.cdc.gov/acip-grade-handbook/hcp/chapter-7-grade-criteria-determining-certainty-of-evidence/index.html)

### Knowledge Graph Construction (Report 02)
- W3C. *PROV-O: The PROV Ontology*. [w3.org/TR/prov-o](https://www.w3.org/TR/prov-o/)
- W3C. *SKOS Simple Knowledge Organization System*. [w3.org/TR/skos-reference](https://www.w3.org/TR/skos-reference/)
- Wikidata. *Data Model*. [wikidata.org/wiki/Wikidata:Data_model](https://www.wikidata.org/wiki/Wikidata:Data_model)
- Google. *Enterprise KG Confidence Scores*. [cloud.google.com](https://cloud.google.com/enterprise-knowledge-graph/docs/confidence-score)
- OpenAlex. *Entity Overview*. [docs.openalex.org](https://docs.openalex.org/api-entities/entities-overview)
- Dublin Core. *Metadata Basics*. [dublincore.org](https://www.dublincore.org/resources/metadata-basics/)
- KG Quality Survey. [Semantic Scholar](https://www.semanticscholar.org/paper/Knowledge-Graph-Quality-Management:-A-Comprehensive-Xue-Zou/ae5b587fb5ff55c074a770acf81c27d9d3046748)

### Citation Network Analysis (Report 03)
- "Detecting anomalous citation groups in journal networks." *Nature Scientific Reports* 2021. [doi:10.1038/s41598-021-93572-3](https://www.nature.com/articles/s41598-021-93572-3)
- Semantic Scholar Academic Graph API. [semanticscholar.org/product/api](https://www.semanticscholar.org/product/api)
- CrossRef Retraction Watch Documentation. [crossref.org](https://www.crossref.org/documentation/retrieve-metadata/retraction-watch/)
- OpenAlex Technical Documentation. [docs.openalex.org](https://docs.openalex.org/)
- Beall's List: How to recognize predatory journals. [beallslist.net](https://beallslist.net/how-to-recognize-predatory-journals/)
- Springer Nature. "Current concepts on bibliometrics." [doi:10.1007/s11845-018-1936-5](https://link.springer.com/article/10.1007/s11845-018-1936-5)

### Intelligence Analysis Tradecraft (Report 04)
- CIA. *A Tradecraft Primer: Structured Analytic Techniques* (2009). [cia.gov](https://www.cia.gov/resources/csi/static/Tradecraft-Primer-apr09.pdf)
- DNI. *Intelligence Community Directive 203: Analytic Standards* (2015). [dni.gov](https://www.dni.gov/files/documents/ICD/ICD-203.pdf)
- Heuer RJ Jr. *Psychology of Intelligence Analysis*. CIA Center for the Study of Intelligence (1999).
- Heuer RJ Jr & Pherson RH. *Structured Analytic Techniques for Intelligence Analysis* (3rd ed. 2020).
- CIA CSI. "Instituting Devil's Advocacy in IC Analysis after the Arab-Israeli War of October 1973." *Studies in Intelligence* 67:4 (2023). [cia.gov](https://www.cia.gov/resources/csi/studies-in-intelligence/studies-in-intelligence-67-no-4-extracts-december-2023/analytical-tradecraft-instituting-devils-advocacy-in-ic-analysis-after-the-arab-israeli-war-of-october-1973/)

### Information Retrieval and Ranking (Report 05)
- Robertson SE & Walker S. "Some simple effective approximations to the 2-Poisson model for probabilistic weighted retrieval." *SIGIR '94*.
- Elastic Blog. "Practical BM25 — Parts 2 and 3." [elastic.co](https://www.elastic.co/blog/practical-bm25-part-2-the-bm25-algorithm-and-its-variables)
- Karpukhin V et al. "Dense Passage Retrieval for Open-Domain Question Answering." *EMNLP 2020*.
- Cormack GV et al. "Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods." *SIGIR 2009*.
- Khattab O & Zaharia M. "ColBERT: Efficient and Effective Passage Search via Contextualized Late Interaction over BERT." *SIGIR 2020*.

---

## Detailed Research Reports

The five source reports contain full literature surveys, code analysis, and implementation details:

1. [Systematic Review Methodology](papers/01-systematic-review-methodology.md) — Cochrane, GRADE, PRISMA frameworks; evidence hierarchy; computational tools (Covidence, RevMan, EPPI-Reviewer); AI automation trends
2. [Knowledge Graph Construction](papers/02-knowledge-graph-construction.md) — Ontology patterns (OWL, RDF, SKOS, Dublin Core, Schema.org); Wikidata/Google/OpenAlex schemas; quality metrics framework; provenance tracking (PROV-O); graph evolution and conflict resolution
3. [Citation Network Analysis](papers/03-citation-network-analysis.md) — Bibliometric indicators (JIF, Eigenfactor, CiteScore, SNIP, SJR, h-index); citation manipulation detection (CIDRE, cartels, coercive citation); predatory journal identification; retraction tracking (CrossRef, Retraction Watch); source reliability APIs (Semantic Scholar, OpenAlex, CrossRef, Dimensions)
4. [Intelligence Analysis Tradecraft](papers/04-intelligence-analysis-tradecraft.md) — Structured Analytic Techniques (SATs); Analysis of Competing Hypotheses (ACH); devil's advocacy and red team analysis; cognitive bias mitigation; ICD 203 analytic standards; competitive analysis frameworks
5. [Information Retrieval and Ranking](papers/05-information-retrieval-ranking.md) — Classical IR models (TF-IDF, BM25, language models); semantic retrieval (DPR, SBERT, ColBERT); hybrid retrieval and RRF; query expansion; learning-to-rank; IR evaluation metrics (nDCG, MAP, MRR)
