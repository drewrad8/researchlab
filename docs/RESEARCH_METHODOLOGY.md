# Research Methodology: State of the Art and Recommendations for ResearchLab

**Date:** 2026-02-21
**Scope:** Comprehensive review of evidence synthesis, knowledge representation, source verification, intelligence tradecraft, and information retrieval — with specific recommendations for improving the ResearchLab pipeline.

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [Systematic Review Methodology](#2-systematic-review-methodology)
3. [Knowledge Graph Construction](#3-knowledge-graph-construction)
4. [Citation Network Analysis and Bibliometrics](#4-citation-network-analysis-and-bibliometrics)
5. [Intelligence Analysis Tradecraft](#5-intelligence-analysis-tradecraft)
6. [Information Retrieval Optimization](#6-information-retrieval-optimization)
7. [Recommendations Prioritized by Impact](#7-recommendations-prioritized-by-impact)
8. [Implementation Notes](#8-implementation-notes)

---

## 1. Current State Assessment

### Pipeline Architecture

ResearchLab implements a four-phase pipeline in `lib/pipeline.js`:

| Phase | Description | Implementation |
|-------|-------------|----------------|
| 1. Planning | Decompose topic into 5-8 sub-questions | Single Strategos worker, PICO-like decomposition |
| 2. Research | Parallel investigation of sub-questions | 3-5 workers, source matching, prior research lookup |
| 2.5. Verification | Cross-reference claims, find gaps | 2 workers: claims audit + gaps/contradictions |
| 3. Synthesis | Build knowledge graph from findings | Single worker, graph validation |

### Current Strengths

- **Parallel research with source matching.** Workers are assigned sub-questions and given matched data sources (`lib/sources.js`), enabling focused investigation.
- **Verification phase exists.** The claims-audit and gaps-contradictions workers implement a rudimentary form of evidence appraisal — extracting claims, checking against independent sources, and flagging disputed/retracted material.
- **Structured graph output.** The knowledge graph schema (`lib/graph-builder.js`) defines typed nodes, typed edges, topic coverage requirements, and validation.
- **Research index with synonym expansion.** `lib/research-index.js` provides cross-project search with bigram matching, synonym groups, and multi-field scoring.

### Current Weaknesses

**Evidence Synthesis:**
- No structured question formulation (no PICO enforcement).
- No evidence hierarchy classification — an expert opinion and an RCT are treated identically.
- No formal confidence rating system (the `confidence` field exists in the schema but is never populated in practice).
- No PRISMA-style tracking of sources screened vs. included vs. excluded.
- Verification is binary (claim verified or not) rather than graded (GRADE-style certainty levels).

**Knowledge Graph:**
- No temporal validity fields (`validFrom`/`validThrough`) — the graph cannot represent superseded facts.
- Citations on edges are single strings, not structured objects — losing URL, PMID, evidence type, peer-review status, sample size.
- No provenance chain — which worker produced which node is lost after synthesis.
- No entity resolution between parallel workers — the same concept may appear as separate nodes.
- No orphan node detection in the validator.
- The `confidence` field is schema-present but data-absent (0% population rate in examined projects).

**Source Assessment:**
- No automated credibility scoring (journal reputation, retraction status, predatory journal flags).
- No citation network analysis — no way to identify seminal papers vs. peripheral sources.
- Source matching (`lib/sources.js`) uses tag-based keyword overlap, not semantic relevance.

**Search/Retrieval:**
- No IDF (term rarity) weighting — common terms score the same as rare discriminative terms.
- No term frequency saturation — presence/absence only, not frequency.
- No document length normalization.
- O(N) full scan on every query with substring operations.
- Hand-written synonym groups instead of principled query expansion.

---

## 2. Systematic Review Methodology

### Gold Standard: Cochrane Systematic Reviews

Cochrane reviews are the gold standard in evidence synthesis, built on four principles: pre-specified methods, exhaustive search, transparent bias accounting, and objective synthesis.

#### PICO Framework for Question Formulation

Every Cochrane review begins with structured question formulation using PICO:

- **P**opulation — Who/what is being studied?
- **I**ntervention — What action, treatment, or factor is being investigated?
- **C**omparator — What is the alternative or control?
- **O**utcomes — What is being measured?

**Application to ResearchLab:** The planning phase currently asks for "5-8 focused sub-questions." Enforcing PICO structure on each sub-question would produce more targeted research and enable systematic comparison across workers. The plan.json schema should require `population`, `intervention`, `comparator`, and `outcomes` fields per sub-question.

#### Dual-Independent Review

Cochrane mandates two independent reviewers at every critical stage — screening, data extraction, and risk of bias assessment — with disagreement resolution by discussion or a third reviewer.

**Application to ResearchLab:** The pipeline already uses parallel workers for research. Extending this pattern to verification — two independent verification workers assessing the same claims, with a reconciliation step — would mirror the Cochrane dual-review standard and catch more errors.

#### Search Strategy Standards

Cochrane requires searching a minimum of three databases (MEDLINE, Embase, CENTRAL) plus grey literature, with full search strategy documentation. The strategy deliberately prioritizes sensitivity over precision — it is better to retrieve irrelevant results than to miss relevant ones.

**Application to ResearchLab:** Workers should be instructed to document their search strategies (which databases queried, what terms used, how many results screened) and report excluded sources with reasons. This enables PRISMA-style flow tracking.

### GRADE Framework

GRADE (Grading of Recommendations, Assessment, Development and Evaluation) is the dominant framework for rating evidence certainty, adopted by WHO, Cochrane, CDC, and 100+ organizations.

#### Evidence Certainty Levels

| Level | Meaning |
|-------|---------|
| High (++++) | Very confident the true effect is close to the estimate |
| Moderate (+++) | Moderately confident; true effect likely close but could differ |
| Low (++) | Limited confidence; true effect may be substantially different |
| Very Low (+) | Very little confidence; true effect likely substantially different |

#### Five Downgrading Domains

RCTs start at HIGH, observational studies at LOW. Each domain can reduce certainty by one or two levels:

1. **Risk of bias** — Methodological limitations (inadequate blinding, selective reporting)
2. **Inconsistency** — Unexplained variability across studies (high I², non-overlapping CIs)
3. **Indirectness** — Evidence doesn't directly answer the question (different population, surrogate outcomes)
4. **Imprecision** — Wide confidence intervals crossing clinical decision thresholds
5. **Publication bias** — Suspected selective publication of positive results

#### Three Upgrading Domains (observational studies only)

1. **Large magnitude of effect** — RR > 2 or < 0.5 without plausible confounders
2. **Dose-response gradient** — More exposure → more effect
3. **Opposing plausible confounding** — Residual confounders would diminish, not inflate, the observed effect

#### Evidence-to-Decision (EtD) Framework

GRADE separates evidence certainty from recommendation strength. A strong recommendation requires both high certainty AND clear balance favoring one option. This separation is critical — the pipeline should never conflate "how confident are we in the evidence?" with "what should the user do?"

**Application to ResearchLab:** Every synthesized claim should carry a GRADE-inspired certainty assessment with explicit ratings on each of the five downgrading domains. The synthesis worker prompt should require this structure rather than a single confidence string.

### PRISMA 2020

PRISMA specifies what must be reported in a systematic review. The key artifact is the **flow diagram** tracking records through four phases:

1. **Identification** — Records found per database, duplicates removed
2. **Screening** — Records screened, excluded at title/abstract
3. **Eligibility** — Full-text assessed, excluded with reasons
4. **Included** — Studies in final synthesis

**Application to ResearchLab:** The pipeline should emit PRISMA-compatible counts as SSE events: sources identified, sources screened, sources included, sources excluded with reasons. This would be stored in the project directory and displayed in the frontend.

### Risk of Bias Assessment

#### Cochrane RoB 2 (for randomized trials)

Five domains assessed via signaling questions:
1. Bias from randomization process
2. Bias from deviations from intended interventions
3. Bias from missing outcome data
4. Bias in outcome measurement
5. Bias in selection of reported results

Each domain yields: Low risk / Some concerns / High risk.

#### ROBINS-I (for non-randomized studies)

Seven domains comparing against a hypothetical target RCT:
1. Bias due to confounding
2. Bias in participant selection
3. Bias in intervention classification
4. Bias from deviations from intended interventions
5. Bias from missing data
6. Bias in outcome measurement
7. Bias in selection of reported results

**Application to ResearchLab:** The verification worker should classify each cited study's design (RCT, cohort, case-control, cross-sectional, case report, expert opinion) and apply a simplified risk-of-bias checklist. The output should flow into the graph's confidence metadata.

---

## 3. Knowledge Graph Construction

### Current Schema vs. Best Practices

The ResearchLab graph schema is a property graph with typed nodes, typed edges, and a topics dictionary. This is the right model for the use case — simpler than RDF/OWL, directly serializable to JSON, and sufficient for research synthesis.

#### Where the Schema Falls Short

**1. Confidence field is defined but never populated.**
The node schema includes `confidence: "verified|plausible|unverified|disputed"` but examination of completed projects shows 0% population rate. The verification phase produces detailed confidence assessments in `claims-audit.json`, but this data never flows into the final graph nodes.

**2. Citations are single strings, not structured objects.**
Current: `edge.citation = "Author (Year) — study description"`.
This loses: URL, PMID, publication year, evidence type, peer-review status, sample size, funding conflicts, agreement/disagreement with the claim.

The Wikidata reference bundle model is the standard to follow: each statement (edge) carries an array of structured reference objects with machine-readable metadata.

**3. No temporal validity.**
The graph cannot represent "the EPA action level for lead was 15 ppb from 1991 to 2024." Facts that have been superseded appear identical to current facts.

**4. No provenance chain.**
After synthesis, there is no record of which research worker produced which node, which source files a node was derived from, or how it connects to the verification audit. The W3C PROV-O ontology defines three core relations that should be tracked:
- `wasGeneratedBy(node, synthesis-activity)` — which pipeline phase produced this
- `wasDerivedFrom(node, research-file)` — which worker output it came from
- `wasAttributedTo(node, worker-id)` — which worker is responsible

**5. No entity resolution between workers.**
Parallel workers may create separate nodes for the same concept ("epa-lead-action-level" vs. "lead-action-level-15ppb"). There is no deduplication or alias-tracking mechanism.

**6. No orphan node detection.**
The validator checks dangling edges (edges referencing non-existent nodes) but not orphan nodes (nodes with no edges). Orphan nodes indicate incomplete research coverage.

### Knowledge Graph Quality Metrics

From the Zaveri et al. 23-dimension framework, the most operationally relevant metrics for ResearchLab:

| Metric | Description | Current Status |
|--------|-------------|----------------|
| Schema completeness | All expected node/edge types present | Enforced via VALID_NODE_TYPES |
| Property completeness | Fraction of nodes with all expected properties populated | Poor (confidence: 0%) |
| Linkability completeness | Every node connected to at least one other | Not checked |
| Syntactic accuracy | Values conform to expected formats | Partially checked |
| Topic coverage | Every non-domain node has a topics entry | Checked in validator |
| Orphan detection | No structurally isolated nodes | Not checked |
| Provenance completeness | Every node traceable to its source | Not implemented |

### Recommended Schema Additions

**Evidence hierarchy on nodes** (following Gene Ontology evidence codes and GRADE):

```json
{
  "confidence": "verified",
  "confidenceScore": 0.92,
  "evidenceType": "meta-analysis|RCT|observational|mechanistic|expert-opinion|single-study",
  "evidenceCount": 14,
  "gradeAssessment": {
    "startingLevel": "high",
    "riskOfBias": "no-concern|serious|very-serious",
    "inconsistency": "no-concern|serious|very-serious",
    "indirectness": "no-concern|serious|very-serious",
    "imprecision": "no-concern|serious|very-serious",
    "publicationBias": "no-concern|serious|very-serious",
    "finalLevel": "high|moderate|low|very-low"
  }
}
```

**Structured citations on edges** (replacing single string):

```json
{
  "citations": [
    {
      "text": "Author (Year)",
      "url": "https://doi.org/...",
      "pmid": "12345678",
      "year": "2023",
      "evidenceType": "RCT",
      "peerReviewed": true,
      "sampleSize": "N=1333",
      "sourceReliability": "high|medium|low|predatory",
      "agrees": true,
      "retractionStatus": "none|retracted|corrected"
    }
  ]
}
```

**Temporal validity:**

```json
{
  "validFrom": "2019-01-01",
  "validThrough": null,
  "retrievedAt": "2026-02-21T00:00:00Z"
}
```

**Provenance:**

```json
{
  "provenance": {
    "pipelineRun": "2026-02-21T05:26:15Z",
    "projectId": "abc123",
    "producedByWorker": "worker-1",
    "derivedFromFiles": ["research/worker-0.json", "research/worker-2.json"],
    "verificationClaimId": "c7",
    "verificationStatus": "VERIFIED"
  }
}
```

**Entity resolution support:**

```json
{
  "aliases": ["lead-action-level", "epa-15ppb-limit"],
  "canonicalId": null
}
```

---

## 4. Citation Network Analysis and Bibliometrics

### Source Reliability Assessment

#### Multi-Level Credibility Scoring

Production credibility assessment combines signals at four levels:

**Level 1 — Journal signals (highest reliability indicator):**
- Indexed in Web of Science / Scopus / DOAJ / PubMed
- SJR quartile (Q1 = highest prestige)
- SNIP (field-normalized impact)
- Eigenfactor score (PageRank-based journal prestige)
- Self-citation rate (>20-25% is a red flag)
- COPE membership (Committee on Publication Ethics)

**Level 2 — Paper signals:**
- Citation count (log-scaled to reduce outlier effects)
- PageRank percentile in field (recursive prestige — being cited by important papers)
- Study design classification on the evidence hierarchy
- Retraction/correction status (critical override)
- Pre-registration existence

**Level 3 — Author signals:**
- h-index of lead/corresponding author
- Institutional affiliation quality (via ROR — Research Organization Registry)
- Author retraction history
- Conflict of interest disclosures

**Level 4 — Content signals:**
- Sample size extraction
- Effect size and confidence interval reporting
- Limitation acknowledgment
- Data availability statement

#### Composite Scoring Formula

```
credibility = 0.40 × journal_score + 0.30 × paper_score + 0.20 × author_score + 0.10 × integrity_score
```

With critical overrides: retraction → 0.0 (fraud) or 0.1 (honest error); predatory journal → 0.05; citation cartel member → 0.5.

**Free APIs for implementation:** OpenAlex (209M works, unlimited), Semantic Scholar (200M papers, 100 req/5min), Crossref (140M DOIs), SCImago (annual download), DOAJ (REST API), Retraction Watch (via Crossref Labs).

### Predatory Journal Detection

Key signals from Beall's criteria, DOAJ, and Think.Check.Submit:

| Signal | Red Flag Threshold |
|--------|-------------------|
| Not indexed in WoS/Scopus/DOAJ/PubMed | Strong negative signal |
| No verifiable editorial board | Critical red flag |
| Implausible peer review timeline (<2 weeks) | Strong negative signal |
| Fake impact factor claims (non-Clarivate metrics) | Critical red flag |
| Journal scope implausibly broad | Moderate negative signal |
| Publisher address is P.O. box or residential | Strong negative signal |
| Spam solicitation emails | Moderate negative signal |
| Name mimics a legitimate journal | Critical red flag |

### Citation Cartel Detection

The CIDRE algorithm (2021) is the state of the art for detecting coordinated citation inflation:

1. Build journal citation network (directed weighted graph)
2. Compute expected citations per pair using a null model accounting for field clustering
3. Identify pairs with observed/expected ratio >> 1
4. Find groups of journals with mutual excess citation ratios

Simpler heuristics for pipeline implementation: self-citation rate > 20-25%, >30% of citations from a single other journal, JIF jump >50% in one year.

### Retraction Tracking

Only 5.4% of citations to retracted papers acknowledge the retraction. The pipeline should:

1. Extract DOI from each cited paper
2. Query Crossref API for retraction notices
3. Query Retraction Watch database
4. If retracted: flag citation, discount credibility, distinguish fraud vs. honest error
5. If corrected: check whether correction affects the specific claims cited

### Identifying Seminal Papers

Seminal papers are identified by:
- High in-degree (citation count) sustained over many years
- High betweenness centrality (bridging disconnected clusters)
- High co-citation frequency with other acknowledged foundational works
- PageRank prominence (cited by other important papers)

Emerging research fronts are identified by:
- Bibliographic coupling of recent papers into tight clusters
- Kleinberg burst detection on term frequency (anomalously rapid citation growth)
- Citation velocity (first derivative of citation count over time)

---

## 5. Intelligence Analysis Tradecraft

### Structured Analytic Techniques (SATs)

The CIA's Tradecraft Primer and Richards Heuer's work define three categories of SATs:

| Category | Purpose | Key Techniques |
|----------|---------|----------------|
| Diagnostic | Make assumptions and logic transparent | Key Assumptions Check, Quality of Information Check |
| Contrarian | Challenge current thinking | Devil's Advocacy, Team A/Team B, ACH |
| Imaginative | Generate new perspectives | Red Team Analysis, Premortem Analysis, Scenario Analysis |

#### Analysis of Competing Hypotheses (ACH)

The most directly applicable technique for automated research. ACH inverts normal analysis: instead of seeking evidence that confirms a hypothesis, it systematically seeks disconfirmation.

**Eight-step process:**
1. Enumerate all mutually exclusive hypotheses (including null)
2. List all evidence and arguments for/against each
3. Build an evidence matrix (hypotheses as columns, evidence as rows)
4. Score each cell: Consistent (C), Inconsistent (I), Not Applicable (N/A)
5. Identify diagnostic evidence (differentiates between hypotheses)
6. Reject hypotheses with the most inconsistencies
7. Test sensitivity — which evidence, if wrong, changes the conclusion?
8. Generate signposts — observable indicators for ongoing monitoring

**Application to ResearchLab:** The verification phase should construct an ACH matrix for contested claims. When the research phase produces contradictory findings, the synthesis worker should present competing hypotheses with explicit evidence for/against each, rather than silently picking one.

#### Key Assumptions Check

Surfaces and tests hidden premises underlying an analytic conclusion. Each assumption is rated on:
- **Support level:** Well-supported (S), Caveat-worthy (C), Unsupported (U)
- **Criticality:** How fatal to the conclusion if wrong?

Unsupported + Critical assumptions are highest-risk and must be explicitly flagged.

**Application to ResearchLab:** The synthesis worker should identify and flag load-bearing assumptions in the knowledge graph. Nodes whose truth depends on unsupported assumptions should carry explicit assumption metadata.

#### Devil's Advocacy

Build the strongest possible case against a consensus judgment. Not to prove the alternative is correct, but to test whether the consensus survives rigorous challenge.

**Application to ResearchLab:** After verification, a "devil's advocate" pass could systematically challenge the highest-confidence claims. Any claim that cannot withstand structured challenge should be downgraded.

### Source Evaluation: The Admiralty System

NATO's two-axis source evaluation is directly applicable:

**Axis 1 — Source Reliability (A-F):**

| Code | Rating | Description |
|------|--------|-------------|
| A | Completely Reliable | Consistent history of valid information |
| B | Usually Reliable | Minor doubt; valid most of the time |
| C | Fairly Reliable | Doubt exists, but valid in the past |
| D | Not Usually Reliable | Significant doubt; only occasionally valid |
| E | Unreliable | History of invalid information |
| F | Cannot Be Judged | New or unknown source |

**Axis 2 — Information Credibility (1-6):**

| Code | Rating | Description |
|------|--------|-------------|
| 1 | Confirmed | Confirmed by independent sources; logical; consistent |
| 2 | Probably True | Not confirmed; logical; consistent with other information |
| 3 | Possibly True | Not confirmed; reasonably logical; agrees with some information |
| 4 | Doubtful | Not confirmed; possible but not logical; no other information |
| 5 | Improbable | Not confirmed; not logical; contradicted by other information |
| 6 | Cannot Be Judged | Insufficient detail prevents assessment |

**Critical design principle:** These two axes must be evaluated independently. A completely reliable source (A) can provide unconfirmed information (3). A new unknown source (F) can provide independently confirmed information (1). Halo-effect contamination (rating both high because one is high) is the primary failure mode.

**Application to ResearchLab:** Each citation in the graph should carry a two-axis rating: source reliability (based on journal reputation, author credentials, institutional backing) and information credibility (based on independent corroboration, logical consistency, and agreement with established knowledge).

### Analytic Confidence Levels

The intelligence community treats probability and confidence as orthogonal:

- **Probability (Words of Estimative Probability):** How likely is the claim to be true?
- **Confidence:** How strong is the analytic basis for that probability judgment?

| Probability Term | Range |
|-----------------|-------|
| Almost certain | 95-99% |
| Very likely | 80-95% |
| Likely | 55-80% |
| Roughly even chance | 45-55% |
| Unlikely | 20-45% |
| Very unlikely | 5-20% |
| Almost no chance | 1-5% |

| Confidence Level | Basis |
|-----------------|-------|
| High | Multiple high-quality sources, minimal conflict |
| Moderate | Credible sources but lacking corroboration or with gaps |
| Low | Scant, questionable, or poorly corroborated sources |

**Application to ResearchLab:** Every synthesized judgment should carry both a probability term AND a confidence level. These must never be collapsed into a single scalar. The knowledge graph's `confidence` field should be expanded to include both dimensions.

### Cognitive Bias Mitigation

| Bias | Description | Mitigation Technique |
|------|-------------|---------------------|
| Confirmation | Seeking evidence that confirms existing beliefs | ACH (force disconfirmation), Devil's Advocacy |
| Anchoring | Over-reliance on first information received | ACH (enumerate all hypotheses before scoring) |
| Availability | Judging likelihood by ease of recall | Base-rate data, structured checklists |
| Mirror imaging | Assuming others think like we do | Red Team analysis, diverse perspectives |
| Groupthink | Consensus overrides critical evaluation | Team A/B, formal dissent mechanisms |
| Vividness | Narrative-rich info weighted over statistical data | Admiralty System (structured source grading) |

**Application to ResearchLab:** The pipeline's multi-worker architecture naturally resists some biases (each worker independently researches). The verification phase partially implements devil's advocacy. The key gap is that the synthesis worker — a single point of failure — can anchor on the first research file it reads, confirm pre-existing patterns, and suppress contradictions. Adding a structured ACH step before synthesis would address this.

---

## 6. Information Retrieval Optimization

### Current Implementation Analysis

The `search()` function in `lib/research-index.js` uses:
- Synonym-expanded substring matching (`.includes()`)
- Hand-tuned point scores (3, 2, 1.5, 1, 0.75)
- Bigram phrase matching (4 pts for topic match, 2.5 pts for tags/searchTerms)
- Multi-token coverage bonus

**Key weaknesses:**
1. **No IDF** — A term matching every entry scores the same as one matching a single entry
2. **No term frequency** — Presence/absence only; a topic mentioning "water" once scores identically to one where "water" is the central subject
3. **No document length normalization** — Entries with large searchTerms arrays get more substring match opportunities
4. **O(N) full scan** — Every query scans all entries with string operations
5. **Substring false positives** — "skin" matches inside "reskinning"

### BM25: The Recommended Upgrade

BM25 (Okapi Best Matching 25) addresses all five weaknesses. Its formula:

```
BM25(d, q) = Σ_i  IDF(qi) × [f(qi,d) × (k1+1)] / [f(qi,d) + k1 × (1 - b + b × |d|/avgdl)]
```

Where:
- `f(qi, d)` = term frequency of query term `qi` in document `d`
- `|d|` = document length (token count)
- `avgdl` = average document length across corpus
- `k1 = 1.2` (TF saturation — diminishing returns for repeated terms)
- `b = 0.75` (document length normalization strength)
- `IDF(qi) = log(1 + (N - df(qi) + 0.5) / (df(qi) + 0.5))`

**Why BM25 over TF-IDF:**
- BM25 handles TF saturation natively (the k1 parameter creates a hyperbolic ceiling)
- Document length normalization is a first-class parameter, not an afterthought
- Defaults work well without corpus-specific tuning
- BM25 remains competitive with neural methods in zero-shot settings (BEIR benchmark)
- Implementable in ~50 lines of JavaScript with no dependencies

### Inverted Index Architecture

Replace the current O(N) scan with a precomputed inverted index:

```
invertedIndex: Map<term, Array<{projectId, tf}>>
docLengths: Map<projectId, number>
docFrequencies: Map<term, number>
N: number (total documents)
avgdl: number (average document length)
```

**Build at record time**, update incrementally when new entries are added. At query time, look up candidate documents via the inverted index (only score documents containing at least one query term).

### Multi-Field Weighting (BM25F)

The current code uses magic constants (topic: 3 pts, tags: 2 pts, searchTerms: 1.5 pts). BM25F formalizes this by treating the document as a weighted concatenation of fields:

```
Document text = topic_tokens × 3 + tag_tokens × 2 + searchTerms_tokens × 1
```

Then apply standard BM25 over the concatenated text. This preserves the existing field weighting intuition but with proper frequency and rarity accounting.

### Porter Stemmer for Morphological Matching

The Porter Stemmer is a rule-based algorithm reducible to ~150 lines of JavaScript:
- "contamination" → "contamin" (matches "contaminate", "contaminant")
- "filtering" → "filter" (matches "filter", "filters", "filtered")
- "effectiveness" → "effect" (matches "effect", "effective", "effects")

This eliminates many entries from the hand-written SYNONYM_GROUPS that are just morphological variants, while catching variants the synonym list misses.

### Query Expansion: Keep Synonyms, Add Pseudo-Relevance Feedback

The existing synonym expansion should be preserved on top of BM25. Additionally, Pseudo-Relevance Feedback (PRF) via the Rocchio algorithm can improve recall:

1. Run initial BM25 retrieval
2. Take the top-3 results' searchTerms as "relevant documents"
3. Expand the query with the most distinctive terms from those results (weighted by IDF)
4. Re-run BM25 with the expanded query

This automatically discovers query expansions that the static synonym map doesn't cover.

### Evaluation Metrics

For ResearchLab's use case (research retrieval, users scan all results):
- **MAP (Mean Average Precision)** — Rewards placing relevant results earlier
- **NDCG@10** — Handles graded relevance (perfect match vs. partial match)
- **MRR** — If users typically need only the single best prior research match

---

## 7. Recommendations Prioritized by Impact

### Tier 1: High Impact, Low Effort

These changes improve quality significantly with minimal code changes.

#### 1.1 Populate the confidence field from verification output
**Impact:** Critical — bridges the gap between verification and graph quality.
**Effort:** Prompt engineering in `phaseSynthesis()`.
**Details:** The verification worker already produces VERIFIED/PLAUSIBLE/UNVERIFIED/DISPUTED per claim. The synthesis prompt instructs workers to set `confidence`, but in practice this never happens. Fix: make the confidence field mapping explicit in the synthesis task description, add examples, and add a validation check that warns when >50% of non-domain nodes have null confidence.

#### 1.2 Add orphan node detection to validateGraph()
**Impact:** Medium — catches structurally disconnected nodes.
**Effort:** ~10 lines of code in `lib/graph-builder.js`.
**Details:** Build a set of all node IDs referenced in edges (as source or target). Flag non-domain nodes not in this set. Domain nodes may be connected only through children's `parent` field, so check that too.

#### 1.3 Add evidenceType field to node schema
**Impact:** High — enables evidence hierarchy reasoning.
**Effort:** Add to schema, add to synthesis prompt, add to validator.
**Details:** Enum: `systematic-review | RCT | observational | mechanistic | expert-opinion | single-study`. Maps to GRADE starting levels and Gene Ontology evidence codes.

#### 1.4 Replace single-string citation with structured citation array
**Impact:** High — enables machine-readable source assessment.
**Effort:** Schema change in `graph-builder.js`, prompt update in `phaseSynthesis()`.
**Details:** Change `edge.citation` (string) to `edge.citations` (array of `{text, url, pmid, year, evidenceType, peerReviewed, sampleSize, agrees}`). Update validator to check the new structure.

### Tier 2: Medium Impact, Medium Effort

#### 2.1 Implement BM25 search with inverted index
**Impact:** High — proper term rarity weighting, frequency saturation, length normalization.
**Effort:** ~200 lines of JavaScript in `lib/research-index.js`.
**Details:** Build inverted index at `record()` time. Compute BM25 scores at query time. Preserve synonym expansion as query-time token expansion. Add Porter Stemmer for morphological matching.

#### 2.2 Add GRADE-inspired certainty assessment to synthesis
**Impact:** High — structured confidence rather than single-word labels.
**Effort:** Prompt engineering + schema addition.
**Details:** Each node carries a `gradeAssessment` object with the five downgrading domains (risk of bias, inconsistency, indirectness, imprecision, publication bias) plus a `finalLevel`. The synthesis worker evaluates each domain based on the verification output.

#### 2.3 Add temporal validity fields
**Impact:** Medium — enables detecting superseded facts.
**Effort:** Schema addition, prompt update.
**Details:** Add `validFrom`, `validThrough`, `retrievedAt` to nodes. The synthesis worker should include these when the research contains dated information (regulatory limits, scientific consensus changes).

#### 2.4 Add provenance tracking to nodes
**Impact:** Medium — enables debugging, auditing, quality improvement.
**Effort:** Schema addition, prompt update.
**Details:** Add `provenance: {producedByWorker, derivedFromFiles, verificationClaimId, pipelineRun}` to each node. The synthesis worker knows which research file each fact came from.

#### 2.5 Add entity aliases to nodes
**Impact:** Medium — enables deduplication awareness.
**Effort:** Schema addition, prompt update with explicit deduplication instruction.
**Details:** Add `aliases: string[]` to nodes. Instruct the synthesis worker to check for near-duplicate nodes and merge them, storing alternative names in aliases.

#### 2.6 PRISMA-style source tracking
**Impact:** Medium — transparency and reproducibility.
**Effort:** SSE event additions, storage in project directory.
**Details:** Track and emit: sources identified, sources screened, sources included, sources excluded with reasons. Store as `prisma-flow.json` in project directory.

### Tier 3: Higher Effort, High Long-Term Value

#### 3.1 ACH matrix for contested claims
**Impact:** High — structured handling of contradictions.
**Effort:** New verification sub-phase or enhancement to gaps worker.
**Details:** When the gaps-contradictions worker identifies contradictions, construct an ACH matrix: hypotheses as columns, evidence as rows, each cell rated C/I/N/A. The hypothesis with fewest inconsistencies becomes the primary synthesis conclusion; others become `investigation` nodes.

#### 3.2 Automated credibility scoring via external APIs
**Impact:** High — objective source quality signals.
**Effort:** New module + API integration.
**Details:** For each cited paper, query OpenAlex (free, unlimited) for citation count, journal, and author metadata. Query Crossref for retraction status. Query DOAJ for journal legitimacy. Compute composite credibility score. Store on edge citations.

#### 3.3 PICO-enforced question formulation
**Impact:** Medium-High — more targeted research, better comparability.
**Effort:** Schema change in plan.json, prompt update in `phasePlanning()`.
**Details:** Each sub-question in plan.json requires `population`, `intervention`, `comparator`, `outcomes` fields. The planning worker is instructed to decompose the topic using PICO structure.

#### 3.4 Dual-independent verification
**Impact:** Medium — reduces verification errors.
**Effort:** Pipeline architecture change.
**Details:** Spawn two independent claims-audit workers. Compare their outputs. Claims where both agree get higher confidence; claims where they disagree trigger a reconciliation step (third worker or synthesis-time flag).

#### 3.5 Citation network integration
**Impact:** Medium — identifies seminal vs. peripheral sources.
**Effort:** New module, API integration.
**Details:** For each citation, fetch its citation count and citing papers from OpenAlex. Compute simple centrality metrics. Use PageRank-like recursive prestige to weight sources. Flag papers with anomalously high self-citation rates or from suspected citation cartels.

#### 3.6 Knowledge graph quality dashboard
**Impact:** Medium — makes quality visible and actionable.
**Effort:** New endpoint + frontend component.
**Details:** Expose graph quality metrics via API: orphan count, confidence population rate, average topic content length, citation structure ratio, evidence type distribution, provenance completeness. Display in project detail view.

---

## 8. Implementation Notes

### Schema Migration Path

The recommended schema additions are backward-compatible. Existing graphs will simply have `null` values for new fields. The validator should distinguish between warnings (missing optional fields) and errors (structural integrity violations).

**Phase 1 (immediate):** Add `evidenceType`, `confidenceScore`, and `aliases` to node schema. Add `citations` array to edge schema (keep `citation` string as fallback). Add orphan detection to validator.

**Phase 2 (near-term):** Add `gradeAssessment` object to nodes. Add `provenance` object to nodes. Add `validFrom`/`validThrough` temporal fields. Update synthesis prompt to populate all new fields.

**Phase 3 (longer-term):** Add external API credibility scoring. Add ACH matrix construction. Add PRISMA flow tracking. Add dual-independent verification.

### BM25 Implementation Sketch

The BM25 upgrade for `lib/research-index.js` requires:

1. **Tokenizer enhancement:** Add Porter Stemmer to `tokenize()`. Apply stemming before indexing and at query time.

2. **Inverted index construction:** In `record()`, after computing `searchTerms`, build the inverted index:
   - Concatenate: topic tokens (×3 weight), tag tokens (×2), searchTerms (×1)
   - For each unique stemmed token, record `{projectId, tf}`
   - Update global `df`, `N`, `avgdl`

3. **BM25 scoring:** Replace the current scoring loop in `search()` with BM25 computation over candidate documents retrieved from the inverted index.

4. **Synonym expansion:** Keep the existing `SYNONYM_GROUPS` and `expandToken()`. Apply expansion at query time to generate additional lookup tokens.

5. **Backward compatibility:** The `search()` function signature and return type remain unchanged.

### Prompt Engineering for Verification Quality

The highest-leverage changes are prompt improvements to existing workers:

**Claims audit worker:** Add instructions to classify each cited study's design (RCT, cohort, etc.), extract sample size, check for pre-registration, and rate using GRADE domains.

**Gaps worker:** Add instructions to construct an ACH matrix when contradictions are found, with explicit C/I/N/A ratings per hypothesis per evidence item.

**Synthesis worker:** Add instructions to:
- Populate `confidence`, `evidenceType`, and `confidenceScore` on every non-domain node
- Use structured `citations` arrays on edges instead of single strings
- Include `validFrom`/`validThrough` when applicable
- Track `provenance` for each node
- Check for near-duplicate nodes and merge with `aliases`
- Generate GRADE-inspired certainty assessment per node

### External API Integration Architecture

For credibility scoring, a new module `lib/credibility.js` would:

1. Accept a citation object (`{text, url, pmid, doi}`)
2. Query OpenAlex by DOI/PMID for citation count, journal, authors
3. Query Crossref by DOI for retraction/correction status
4. Look up journal in a cached DOAJ/SCImago dataset
5. Compute composite credibility score
6. Return enriched citation object with all metadata

This module would be called during the synthesis phase to enrich citations before writing the graph. It requires network access to external APIs but no dependencies beyond Node.js stdlib (`http` module).

### Measurement and Evaluation

To track pipeline quality improvement over time:

| Metric | Baseline | Target | Measurement |
|--------|----------|--------|-------------|
| Confidence field population rate | 0% | >90% | Fraction of non-domain nodes with non-null confidence |
| Structured citation rate | 0% | >80% | Fraction of edges with structured citation arrays |
| Orphan node rate | Unknown | <5% | Fraction of non-domain nodes with no edges |
| Topic content depth | ~500 chars avg | >800 chars avg | Average chars per topic section |
| Verification claim coverage | Unknown | >80% | Fraction of claims in research files that appear in claims-audit |
| GRADE assessment rate | 0% | >70% | Fraction of nodes with gradeAssessment object |
| Search relevance (MAP@5) | Unknown | Improve over baseline | A/B comparison of BM25 vs. current |

---

## References and Further Reading

### Systematic Review Methodology
- Cochrane Handbook for Systematic Reviews of Interventions (cochrane.org)
- GRADE Handbook (gradepro.org)
- PRISMA 2020 Statement (prisma-statement.org)
- Cochrane Risk of Bias Tool 2 (RoB 2) documentation

### Knowledge Graph Construction
- W3C PROV-O: The PROV Ontology (w3.org/TR/prov-o)
- Wikidata Data Model (wikidata.org)
- Gene Ontology Evidence Codes (geneontology.org)
- SKOS Simple Knowledge Organization System (w3.org/TR/skos-reference)
- Zaveri et al. "Quality Assessment for Linked Data: A Survey" (Semantic Web Journal)

### Citation Analysis and Bibliometrics
- OpenAlex API documentation (docs.openalex.org)
- Retraction Watch Database via Crossref Labs
- CIDRE algorithm: "Detecting anomalous citation groups" (Nature Scientific Reports, 2021)
- SCImago Journal Rankings (scimagojr.com)
- Beall's List of Predatory Journals (beallslist.net)
- Kleinberg "Bursty and Hierarchical Structure in Streams" (2002)

### Intelligence Analysis
- CIA Tradecraft Primer: Structured Analytic Techniques (2009)
- Heuer, Richards J. "Psychology of Intelligence Analysis" (1999)
- Intelligence Community Directive 203: Analytic Standards (dni.gov)
- Kent, Sherman. "Words of Estimative Probability" (Studies in Intelligence, 1964)
- WMD Commission Report (2005)
- 9/11 Commission Report, Chapter 11: "Foresight — and Hindsight"

### Information Retrieval
- Robertson & Zaragoza. "The Probabilistic Relevance Framework: BM25 and Beyond" (2009)
- Lv & Zhai. "Lower-Bounding Term Frequency Normalization" (CIKM 2011)
- Manning, Raghavan & Schutze. "Introduction to Information Retrieval" (Stanford NLP)
- Porter, M.F. "An algorithm for suffix stripping" (1980)
