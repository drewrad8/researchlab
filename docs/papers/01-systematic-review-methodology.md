# Systematic Review Methodology: Frameworks for Evidence Synthesis

**Research Report — ResearchLab Pipeline Improvement**
**Date:** 2026-02-21
**Worker:** 713c87be (RESEARCH: Systematic Review Methodology)
**Parent:** b9b965d3 (GENERAL: Research Methodology Campaign)

---

## Executive Summary

This report examines the three gold-standard frameworks for systematic evidence synthesis — **Cochrane**, **GRADE**, and **PRISMA** — and maps their methodological strengths onto the ResearchLab pipeline's 5-phase architecture (plan → classify → investigate → adjudicate → synthesize). The existing pipeline already incorporates elements of these frameworks (RoB 2 domains in P-SCI, GRADE-inspired confidence levels, evidence type classification). This report identifies specific gaps and actionable improvements.

Key findings:
1. The pipeline lacks a formal **protocol registration** step (Cochrane Phase 0), making reproducibility difficult.
2. Evidence classification should adopt the full GRADE certainty framework (high/moderate/low/very low) rather than the current V/P/U/D/R scale, or at minimum establish a formal mapping between them.
3. The pipeline has no formal **search strategy documentation** (PRISMA Items 6–7), making it impossible to audit what sources were actually consulted.
4. The adjudication phase should implement GRADE's five downgrading domains and three upgrading factors as explicit, auditable criteria.
5. The synthesis phase should produce a **Summary of Findings (SoF) table** alongside the knowledge graph.

---

## 1. Cochrane Systematic Review Methodology

### 1.1 Overview

The Cochrane Handbook for Systematic Reviews of Interventions (current version 6.5, updated August 2024) is the authoritative guide for conducting systematic reviews. It covers 26 chapters organized across four parts, from starting a review through specialized perspectives on equity, complexity, and qualitative evidence.

**Source:** [Cochrane Handbook v6.5](https://training.cochrane.org/handbook/current)

### 1.2 Review Structure and Process

The Cochrane process follows a strict sequential methodology:

| Phase | Cochrane Step | ResearchLab Analog | Gap |
|-------|---------------|-------------------|-----|
| 0 | Protocol development | None | **Missing entirely** |
| 1 | Question formulation (PICO) | Phase 1: Planning | Partial — no PICO structure |
| 2 | Eligibility criteria | Phase 2: Classify | Partial — evidence types but no formal inclusion/exclusion |
| 3 | Search strategy | Phase 2: Classify (sources) | Weak — no documented strategy |
| 4 | Study selection | Phase 2: Classify | Partial |
| 5 | Data collection | Phase 3: Investigate | Good alignment |
| 6 | Risk of bias assessment | Phase 3: Investigate (P-SCI) | Good — RoB 2 implemented |
| 7 | Effect measures & synthesis | Phase 5: Synthesize | Partial — no meta-analysis |
| 8 | GRADE & Summary of Findings | Phase 4: Adjudicate | Partial |
| 9 | Interpretation | Phase 5: Synthesize (graph) | Good alignment |

### 1.3 Protocol Development (Cochrane Chapter II)

Before any review begins, Cochrane requires a published **protocol** specifying:
- The research question in PICO format
- Predetermined inclusion/exclusion criteria
- Search strategy (databases, keywords, date ranges)
- Methods for data extraction and risk of bias assessment
- Planned synthesis methods
- Predetermined sensitivity analyses

**Why this matters for ResearchLab:** The current pipeline generates a plan in Phase 1 but does not create a reproducible protocol. Two runs of the same topic may produce different sub-questions, different search strategies, and therefore different results. A protocol anchors the methodology.

### 1.4 PICO Framework

Cochrane uses PICO (Population, Intervention, Comparator, Outcome) to structure review questions. There are three PICO levels:
- **Review PICO:** Decides which studies to include
- **Comparison PICO:** Groups studies for specific comparisons
- **Study PICO:** Documents each included study's characteristics

**Source:** [Cochrane Library PICO](https://www.cochranelibrary.com/about-pico)

### 1.5 Risk of Bias Assessment (RoB 2)

The revised Cochrane Risk of Bias tool (RoB 2) assesses five domains:

| Domain | Assessment Question | Rating |
|--------|-------------------|--------|
| D1: Randomization process | Was allocation sequence random? Was it concealed? | Low / Some concerns / High |
| D2: Deviations from intervention | Were participants/personnel aware of assignments? | Low / Some concerns / High |
| D3: Missing outcome data | Were outcome data available for all participants? | Low / Some concerns / High |
| D4: Measurement of outcome | Was outcome measurement appropriate and blinded? | Low / Some concerns / High |
| D5: Selection of reported result | Were reported results prespecified? Registration match? | Low / Some concerns / High |

For observational studies, ROBINS-I provides seven domains. For systematic reviews, AMSTAR-2 is used.

**Source:** [RoB 2 Tool](https://methods.cochrane.org/bias/resources/rob-2-revised-cochrane-risk-bias-tool-randomized-trials)

**ResearchLab status:** The P-SCI pathway already implements RoB 2 at Level 2 (depth 2, "Bias Assessment"). This is one of the strongest parts of the current pipeline. The pathway correctly routes RCTs to RoB 2, observational studies to ROBINS-I, and reviews to AMSTAR-2.

### 1.6 Handling Heterogeneous Evidence

Cochrane distinguishes between:
- **Clinical heterogeneity:** Differences in participants, interventions, or outcomes
- **Methodological heterogeneity:** Differences in study design and risk of bias
- **Statistical heterogeneity:** Variability in intervention effects beyond chance (measured by I² statistic)

When heterogeneity is substantial, Cochrane recommends:
1. Subgroup analysis to explore sources
2. Sensitivity analysis excluding high-risk-of-bias studies
3. Narrative synthesis instead of meta-analysis
4. Random-effects models when pooling is still justified

**ResearchLab gap:** The pipeline does not currently assess or handle heterogeneity. Evidence from different study types is mixed without accounting for methodological differences.

---

## 2. GRADE Framework

### 2.1 Overview

The Grading of Recommendations Assessment, Development, and Evaluation (GRADE) framework is the dominant system for rating the certainty of evidence and the strength of recommendations. It is used by Cochrane, WHO, and over 100 organizations worldwide.

**Source:** [GRADE Working Group](https://www.gradeworkinggroup.org/); [GRADE Handbook](https://gradepro.org/handbook/)

### 2.2 Evidence Certainty Levels

GRADE assigns four certainty levels to a body of evidence for a given outcome:

| Level | Meaning | Implication |
|-------|---------|------------|
| **High** | Very confident the true effect is close to the estimate | Further research unlikely to change confidence |
| **Moderate** | Moderately confident; true effect likely close to estimate | Further research may change confidence |
| **Low** | Limited confidence; true effect may be substantially different | Further research very likely to change estimate |
| **Very Low** | Very little confidence; true effect likely substantially different | Any estimate is very uncertain |

### 2.3 Starting Point

- **Randomized trials** start at **High** certainty
- **Observational studies** start at **Low** certainty

This is critical: the starting point depends on study design, not on whether findings are confirmed.

### 2.4 Five Domains for Downgrading

Each domain can reduce certainty by one or two levels:

#### Domain 1: Risk of Bias
- Assessed per-study using RoB 2 (RCTs) or ROBINS-I (observational)
- Aggregated across studies contributing to an outcome
- Downgrade one level for "serious" limitations, two for "very serious"

#### Domain 2: Inconsistency
- Unexplained heterogeneity of results across studies
- Assessed via: point estimates, confidence interval overlap, I² statistic, chi-squared test
- Downgrade when I² > 50% without plausible explanation

#### Domain 3: Indirectness
- Evidence doesn't directly answer the question of interest
- Types: different population, different intervention, different comparator, different outcome, indirect comparison
- Each type of indirectness can warrant downgrading

#### Domain 4: Imprecision
- Confidence intervals are wide or sample size is small
- Rules of thumb: total events < 300 for dichotomous, total N < 400 for continuous
- Downgrade when CI includes both appreciable benefit and appreciable harm

#### Domain 5: Publication Bias
- Selective publication of studies with positive results
- Assessed via funnel plot asymmetry, Egger's test, comparison of registered vs. published
- Maximum one-level downgrade recommended

### 2.5 Three Factors for Upgrading (Observational Studies)

| Factor | Criterion | Upgrade |
|--------|-----------|---------|
| Large effect | RR > 2 or RR < 0.5 from observational studies with no plausible confounders | +1 level |
| Very large effect | RR > 5 or RR < 0.2 | +2 levels |
| Dose-response gradient | Evidence of dose-response relationship | +1 level |
| Opposing residual confounding | All plausible confounders would reduce the observed effect | +1 level |

**Key GRADE rule:** Evidence rated down for one or more domains should generally NOT be rated up, as this may overstate certainty.

**Source:** [CDC ACIP GRADE Handbook Ch. 7](https://www.cdc.gov/acip-grade-handbook/hcp/chapter-7-grade-criteria-determining-certainty-of-evidence/index.html); [CDC ACIP Ch. 8](https://www.cdc.gov/acip-grade-handbook/hcp/chapter-8-domains-decreasing-certainty-in-the-evidence/index.html)

### 2.6 Mapping to ResearchLab Confidence Scale

The current ResearchLab confidence scale (V/P/U/D/R) partially maps to GRADE:

| ResearchLab | GRADE Equivalent | Notes |
|-------------|------------------|-------|
| V (VERIFIED) | High | Requires ≥3 independent confirmations from A/B sources, no bias |
| P (PLAUSIBLE) | Moderate | ≥1 confirmation or A/B source |
| U (UNVERIFIED) | Low / Very Low | Insufficient evidence |
| D (DISPUTED) | N/A | GRADE doesn't have a "disputed" category — it handles this via inconsistency domain |
| R (RETRACTED) | N/A | GRADE excludes retracted evidence entirely |

**Key gap:** The current system conflates two different concepts:
1. **Certainty of evidence** (GRADE's concern): How confident are we in the estimate?
2. **Verification status** (current pipeline's concern): Has this specific claim been independently confirmed?

GRADE operates at the **body of evidence** level (all studies for a given outcome), while the pipeline currently operates at the **individual evidence item** level. This is a fundamental architectural difference.

---

## 3. PRISMA 2020

### 3.1 Overview

The Preferred Reporting Items for Systematic Reviews and Meta-Analyses (PRISMA) 2020 statement provides a 27-item checklist and flow diagram for transparent reporting of systematic reviews.

**Source:** [PRISMA 2020 Statement](https://www.prisma-statement.org/prisma-2020); [Page et al. (2021) BMJ](https://pubmed.ncbi.nlm.nih.gov/33782057/); [PRISMA 2020 E&E](https://pmc.ncbi.nlm.nih.gov/articles/PMC8005925/)

### 3.2 Checklist Structure (27 Items)

The PRISMA 2020 checklist covers seven sections:

**Title & Abstract (Items 1–2)**
1. Identify report as systematic review in title
2. Structured abstract (12-item sub-checklist)

**Introduction (Items 3–4)**
3. Rationale: Why the review is needed, current knowledge state
4. Objectives: Explicit PICO-format question

**Methods (Items 5–13)**
5. Eligibility criteria: Study design, population, interventions, outcomes, report characteristics
6. Information sources: All databases, registers, websites, organizations searched with dates
7. Search strategy: Full line-by-line search strategy for each database
8. Study selection: Number of reviewers, independence, disagreement resolution, automation
9. Data collection: Extractors, processes, confirmation methods
10. Outcome definitions (a) and other variables (b)
11. Risk of bias assessment: Tools used, domains, assessors
12. Effect measures: For each outcome type
13. Synthesis methods (a–g): Eligibility, data preparation, presentation, statistical methods, heterogeneity exploration, reporting bias assessment, certainty assessment

**Results (Items 14–15)**
14. Study selection flow diagram (a), characteristics (b), risk of bias (c)
15. Individual results (a), synthesis results (b), heterogeneity (c), bias (d), certainty (e)

**Discussion (Items 16–18)**
16. Summary of results
17. Limitations
18. Implications

**Other (Items 19–22)**
19. Registration and protocol
20. Funding and conflicts
21. Data availability
22. Summary of Findings table

### 3.3 Flow Diagram

The PRISMA flow diagram tracks information flow through four phases:

```
IDENTIFICATION
├── Records from databases/registers (n = ?)
├── Records from other sources (n = ?)
└── Duplicates removed (n = ?)

SCREENING
├── Records screened (n = ?)
└── Records excluded (n = ?)

ELIGIBILITY
├── Full-text assessed (n = ?)
└── Excluded with reasons (n = ?)

INCLUDED
├── Studies in review (n = ?)
└── Studies in synthesis (n = ?)
```

### 3.4 Key Insight: Transparency Through Documentation

PRISMA's core contribution is not methodology but **auditability**. Every decision in the review process must be documented with enough detail that another team could reproduce it. This includes:
- Complete search strings (not just databases searched)
- Exact counts at each stage (not just final numbers)
- Reasons for exclusion at full-text stage
- Who made each decision and how disagreements were resolved

**ResearchLab gap:** The pipeline produces outputs (plan.json, manifests, graph.json) but does not document the decision trail. There is no record of what sources were searched, what was excluded and why, or how disagreements between workers were resolved.

---

## 4. Evidence Hierarchy Classification

### 4.1 Standard Evidence Pyramid

The evidence hierarchy, widely used in evidence-based medicine, ranks study designs by their susceptibility to bias:

| Level | Study Type | Starting GRADE Certainty | ResearchLab Evidence Type |
|-------|-----------|------------------------|--------------------------|
| I | Systematic reviews of RCTs | High (inherited) | SCI |
| II | Individual RCTs | High | SCI |
| III | Controlled trials without randomization | Moderate-High | SCI |
| IV | Cohort studies, case-control studies | Low | SCI |
| V | Systematic reviews of descriptive/qualitative studies | Low (inherited) | SCI |
| VI | Single descriptive or qualitative study | Low | SCI |
| VII | Expert committee reports, expert opinion | Very Low | EXP |

**Source:** [PMC3124652](https://pmc.ncbi.nlm.nih.gov/articles/PMC3124652/); [Spalding University EBP Guide](https://library.spalding.edu/EBP/levels)

### 4.2 Extended Hierarchy for Non-Medical Evidence

ResearchLab handles evidence types beyond medical studies. A proposed extended hierarchy:

| Tier | Evidence Type | Starting Confidence | Rationale |
|------|-------------|--------------------|-----------
| Tier 1 | Meta-analyses, systematic reviews (SCI) | High | Multiple studies synthesized with methodology assessment |
| Tier 2 | RCTs, large cohort studies, government data (SCI, GOV) | High / Moderate | Controlled methodology or official statistics |
| Tier 3 | Observational studies, organizational reports (SCI, ORG) | Low-Moderate | Potential confounding, institutional bias |
| Tier 4 | Expert opinion, case reports, technical claims (EXP, TEC) | Low | Single perspective, potential conflicts |
| Tier 5 | Media reports, historical claims (MED, HIS) | Low | Secondary reporting, verification needed |
| Tier 6 | Testimonials, financial claims (TES, FIN) | Very Low | High bias potential, uncontrolled |
| Tier 7 | Documents without verification (DOC) | Very Low | Authenticity unconfirmed |

### 4.3 Implication for Pipeline

The current pipeline treats all evidence items equally during classification — a testimonial (TES) gets the same initial treatment as an RCT (SCI). The evidence hierarchy should inform:
1. **Starting confidence level** at the beginning of investigation pathways
2. **Required corroboration threshold** — lower-tier evidence needs more independent confirmation
3. **Synthesis weight** — higher-tier evidence should carry more weight in the knowledge graph

---

## 5. Computational Implementation: Modern Tools

### 5.1 Covidence

**Purpose:** Screening and data extraction platform for systematic reviews.

**Key computational features:**
- Machine learning-assisted title/abstract screening (since December 2022)
- Customizable data extraction forms
- Customizable risk of bias assessment templates
- Automatic PRISMA flow diagram generation
- Integration with GRADEPro and RevMan
- Dual-reviewer conflict detection and resolution

**Relevance to ResearchLab:** Covidence's conflict detection between reviewers maps to the pipeline's need for cross-worker disagreement resolution.

**Source:** [Cochrane Software](https://www.cochrane.org/learn/courses-and-resources/software)

### 5.2 RevMan

**Purpose:** Cochrane's official review authoring and meta-analysis tool (RevMan Web + RevMan 5).

**Key computational features:**
- Protocol and review authoring
- Meta-analysis computation (fixed and random effects)
- Forest plot and funnel plot generation
- Risk of bias visualization (traffic light plots)
- Summary of Findings table generation
- GRADE integration

**Relevance to ResearchLab:** RevMan's SoF table generation is directly applicable. The pipeline's synthesis phase should produce structured summary tables, not just knowledge graphs.

### 5.3 EPPI-Reviewer

**Purpose:** Reference management and evidence synthesis platform.

**Key computational features:**
- AI-powered priority screening (machine learning ranking)
- Reference deduplication
- PDF annotation and coding
- Framework synthesis and thematic synthesis
- Quantitative and qualitative analysis tools
- Automation of screening via integrated AI

**Relevance to ResearchLab:** EPPI-Reviewer's priority screening concept — ranking items by likely relevance before full assessment — could reduce unnecessary investigation pathway spawns.

### 5.4 Emerging AI Automation (2024–2025)

Recent developments in systematic review automation using LLMs:

- **otto-SR** (2025): End-to-end agentic workflow using LLMs. Achieved 96.7% sensitivity and 97.9% specificity in screening (vs. human dual-reviewer: 81.7% sensitivity, 98.1% specificity). Data extraction accuracy: 93.1% (vs. human: 79.7%).
- **ISLaR 2.0**: Semi-autonomous "human-in-the-loop" platform for abstract/full-text screening.
- **RobotReviewer**: Automated risk of bias assessment for RCTs using NLP.

**Key caution from the literature:** "Current evidence does not support GenAI use in evidence synthesis without human involvement or oversight." The ResearchLab pipeline is well-positioned here because it uses AI workers with structured outputs and human-reviewable artifacts.

**Source:** [AI in Systematic Reviews (2024)](https://systematicreviewsjournal.biomedcentral.com/articles/10.1186/s13643-024-02682-2); [otto-SR preprint](https://www.medrxiv.org/content/10.1101/2025.06.13.25329541v2.full.pdf)

---

## 6. Pipeline Recommendations

### Recommendation 1: Add Protocol Phase (Phase 0)

**Framework basis:** Cochrane Chapter II, PRISMA Items 5–7, 19

**Current state:** Phase 1 (Planning) generates sub-questions but no reproducible protocol.

**Proposed change:** Before Phase 1, generate a `protocol.json` that locks:
- Research question in structured format (adapted PICO)
- Inclusion/exclusion criteria for evidence
- Predetermined search strategy (which source types, databases, date ranges)
- Assessment methodology per evidence type
- Predetermined sensitivity analyses

**Implementation notes:**
- Add a new `phaseProtocol()` function before `phasePlanning()` in `pipeline.js`
- Protocol should be generated by a single worker, then frozen — subsequent phases read but cannot modify it
- Write to `{projectDir}/protocol.json`
- Include a hash of the protocol in all subsequent output files for auditability

### Recommendation 2: Implement Evidence Hierarchy Starting Points

**Framework basis:** GRADE starting certainty, Evidence pyramid

**Current state:** All evidence enters investigation pathways at the same starting point. Confidence is computed purely from pathway results.

**Proposed change:** Assign a starting confidence tier based on evidence type and study design:
- Tier 1 (meta-analyses, systematic reviews): Start at potential-High
- Tier 2 (RCTs, government data): Start at potential-High
- Tier 3 (observational, organizational): Start at potential-Moderate
- Tier 4–7 (expert, media, testimonial, etc.): Start at potential-Low

**Implementation notes:**
- Add a `startingTier` field to the evidence manifest output schema in Phase 2
- In `computeConfidence()` in `investigation-tree.js`, use the starting tier as the baseline instead of computing purely from pathway results
- This aligns with GRADE: RCTs start High and can only be downgraded; observational studies start Low and can be upgraded under specific conditions

### Recommendation 3: Add GRADE Downgrade/Upgrade Domains as Explicit Checks

**Framework basis:** GRADE five downgrading domains, three upgrading factors

**Current state:** The `computeConfidence()` function checks for specific signals (retraction, contradictions, bias flags, confirmations) but doesn't map to GRADE's formal domain structure.

**Proposed change:** Restructure confidence computation to explicitly assess each GRADE domain:

```
Downgrade assessment:
  D1: Risk of Bias → Already implemented via pathway bias assessment
  D2: Inconsistency → NEW: Check variance across evidence items for same sub-question
  D3: Indirectness → NEW: Check if evidence directly addresses the sub-question
  D4: Imprecision → NEW: Check sample sizes and effect estimate precision
  D5: Publication Bias → NEW: Check for signs of selective reporting

Upgrade assessment (observational only):
  U1: Large Effect → Partially implemented (flags.largeEffect)
  U2: Dose-Response → Partially implemented (flags.doseResponse)
  U3: Opposing Confounding → NOT implemented
```

**Implementation notes:**
- Add a `gradeAssessment` object to each adjudicated evidence record in Phase 4
- Structure: `{ d1RiskOfBias: "not serious" | "serious" | "very serious", d2Inconsistency: ..., ... u1LargeEffect: boolean, ... }`
- The `computeConfidence()` function should produce both the V/P/U/D/R rating AND a GRADE certainty (high/moderate/low/very low) — they serve different purposes
- GRADE assessment should operate at the **sub-question level** (body of evidence), not individual evidence item level

### Recommendation 4: Add Search Documentation (PRISMA Audit Trail)

**Framework basis:** PRISMA Items 6–7, 14a

**Current state:** Workers perform searches but don't document what they searched, what they found, and what they excluded.

**Proposed change:** Require classification workers (Phase 2) and investigation workers (Phase 3) to document:
- Sources consulted (databases, websites, search engines)
- Search terms used
- Number of results reviewed
- Inclusion/exclusion decisions with reasons

**Implementation notes:**
- Add a `searchLog` field to the evidence manifest output schema:
  ```json
  {
    "searchLog": [
      { "source": "PubMed", "query": "...", "resultsFound": 45, "resultsReviewed": 20, "included": 5 },
      { "source": "Google Scholar", "query": "...", "resultsFound": 200, "resultsReviewed": 30, "included": 3 }
    ]
  }
  ```
- Add a `exclusionReasons` field to manifest items that were reviewed but not included
- Generate a PRISMA-style flow diagram in the synthesis phase output

### Recommendation 5: Add Summary of Findings Table

**Framework basis:** GRADE SoF tables, PRISMA Item 22, Cochrane Chapter 14

**Current state:** The synthesis phase produces only a knowledge graph (nodes, edges, topics). There is no structured summary table.

**Proposed change:** In Phase 5 (Synthesis), produce a `summary-of-findings.json` alongside `graph.json`:

```json
{
  "title": "Summary of Findings: [Topic]",
  "findings": [
    {
      "subQuestionId": "q1",
      "question": "...",
      "evidenceCount": 12,
      "studyDesigns": ["3 RCTs", "5 cohort", "4 expert opinion"],
      "keyResult": "...",
      "effectEstimate": "...",
      "gradeCertainty": "moderate",
      "pipelineConfidence": "P",
      "confidenceRationale": "...",
      "gradeDowngrades": ["imprecision: serious (small sample sizes)"],
      "gradeUpgrades": [],
      "limitations": "..."
    }
  ]
}
```

**Implementation notes:**
- Add to the synthesis worker's task description in `phaseSynthesis()`
- The SoF table provides a reviewer-friendly overview that the knowledge graph alone cannot
- Include the SoF table in the project's API response at `GET /api/projects/:id`

### Recommendation 6: Implement Inconsistency Detection Across Evidence Items

**Framework basis:** GRADE Domain 2 (Inconsistency), Cochrane heterogeneity assessment

**Current state:** The adjudication phase checks for consensus (>80%) and triggers contrarian analysis, but does not assess inconsistency among non-consensus evidence.

**Proposed change:** In Phase 4 (Adjudicate), for each sub-question:
1. Group evidence items by conclusion direction (supports/contradicts/neutral)
2. Calculate agreement ratio
3. If agreement < 60% across ≥3 evidence items, flag as "inconsistent" and downgrade certainty
4. Document the specific points of disagreement

**Implementation notes:**
- Add to `phaseAdjudicate()` in `pipeline.js`, after the current consensus check
- Require classification workers to include a `conclusionDirection` field ("supports", "contradicts", "neutral") in evidence items
- This captures the common case where evidence is mixed — neither consensus (>80%) nor clearly contradictory — which the current pipeline handles poorly

### Recommendation 7: Add Indirectness Assessment

**Framework basis:** GRADE Domain 3 (Indirectness)

**Current state:** No mechanism to assess whether evidence directly addresses the sub-question.

**Proposed change:** In Phase 2 (Classify), require workers to assess directness:
- **Direct:** Evidence specifically studies the exact question
- **Indirect (population):** Different population than asked about
- **Indirect (intervention):** Related but different intervention
- **Indirect (outcome):** Measures a proxy outcome
- **Indirect (comparison):** No direct comparison available

**Implementation notes:**
- Add a `directness` field to evidence manifest items
- In confidence computation, indirect evidence should be capped at PLAUSIBLE (similar to existing `lowHierarchyOnly` cap)
- This is particularly important for ResearchLab because topics are often broad (e.g., "effects of X on health") and evidence may come from tangentially related studies

### Recommendation 8: Dual-Assessment for High-Stakes Evidence

**Framework basis:** Cochrane dual-reviewer requirement, PRISMA Item 8

**Current state:** Each evidence item is assessed by a single investigation pathway worker. No redundancy or disagreement detection.

**Proposed change:** For evidence items rated as high-importance (Tier 1–2 evidence, or evidence directly answering a core sub-question), spawn two independent investigation workers and compare their findings.

**Implementation notes:**
- Add a `dualAssessment` flag to high-importance evidence items in the manifest
- In `runPathway()` in `investigation-tree.js`, spawn two parallel Level 1 workers for flagged items
- Compare outputs: if they agree, proceed normally; if they disagree, flag for manual review or spawn a third tiebreaker worker
- This increases cost by ~30% for Tier 1–2 evidence but significantly improves reliability

---

## 7. Key Citations

1. Higgins JPT, Thomas J, Chandler J, et al. (eds). *Cochrane Handbook for Systematic Reviews of Interventions* version 6.5 (updated August 2024). Cochrane. Available from [www.cochrane.org/handbook](https://www.cochrane.org/authors/handbooks-and-manuals/handbook).

2. Schünemann H, Brożek J, Guyatt G, Oxman A (eds). *GRADE Handbook*. GRADE Working Group. Available from [gradepro.org/handbook](https://gradepro.org/handbook/).

3. Page MJ, McKenzie JE, Bossuyt PM, et al. The PRISMA 2020 statement: an updated guideline for reporting systematic reviews. *BMJ*. 2021;372:n71. doi: [10.1136/bmj.n71](https://pubmed.ncbi.nlm.nih.gov/33782057/).

4. Page MJ, Moher D, Bossuyt PM, et al. PRISMA 2020 explanation and elaboration: updated guidance and exemplars for reporting systematic reviews. *BMJ*. 2021;372:n160. doi: [10.1136/bmj.n160](https://pmc.ncbi.nlm.nih.gov/articles/PMC8005925/).

5. Sterne JAC, Savović J, Page MJ, et al. RoB 2: a revised tool for assessing risk of bias in randomised trials. *BMJ*. 2019;366:l4898. Available from [methods.cochrane.org/bias](https://methods.cochrane.org/bias/resources/rob-2-revised-cochrane-risk-bias-tool-randomized-trials).

6. Burns PB, Rohrich RJ, Chung KC. The levels of evidence and their role in evidence-based medicine. *Plast Reconstr Surg*. 2011;128(1):305-310. doi: [10.1097/PRS.0b013e318219c171](https://pmc.ncbi.nlm.nih.gov/articles/PMC3124652/).

7. Khalil H, Ameen D, Ziegler A. Tools to support the automation of systematic reviews: a scoping review. *J Clin Epidemiol*. 2024. [PMC11465921](https://pmc.ncbi.nlm.nih.gov/articles/PMC11465921/).

8. Alshami A, et al. Towards the automation of systematic reviews using NLP, ML, and DL. *Artif Intell Rev*. 2024;57:282. doi: [10.1007/s10462-024-10844-w](https://link.springer.com/article/10.1007/s10462-024-10844-w).

---

## 8. Implementation Priority Matrix

| # | Recommendation | Effort | Impact | Priority |
|---|---------------|--------|--------|----------|
| 1 | Protocol Phase | Medium | High | **P1** |
| 2 | Evidence Hierarchy Starting Points | Low | High | **P1** |
| 3 | GRADE Domains in Confidence | Medium | High | **P1** |
| 4 | Search Documentation | Low | Medium | **P2** |
| 5 | Summary of Findings Table | Medium | Medium | **P2** |
| 6 | Inconsistency Detection | Medium | Medium | **P2** |
| 7 | Indirectness Assessment | Low | Medium | **P2** |
| 8 | Dual-Assessment | High | Medium | **P3** |

**P1 recommendations** (1, 2, 3) address fundamental methodological gaps that affect the quality of every research project. They should be implemented first.

**P2 recommendations** (4, 5, 6, 7) improve transparency and granularity. They can be implemented incrementally.

**P3 recommendation** (8) is a reliability improvement that significantly increases compute cost. It should be implemented once the pipeline's core methodology is sound.

---

## 9. Open Questions

1. **Body-of-evidence vs. individual-item assessment:** GRADE operates on the body of evidence for an outcome, while the pipeline assesses individual items. Should the adjudication phase aggregate evidence per sub-question before computing GRADE certainty? (Recommendation: yes, see §6 Rec 3.)

2. **Non-medical evidence:** GRADE was designed for healthcare interventions. How well do its domains transfer to other evidence types (e.g., financial claims, historical claims, product reviews)? The concepts of imprecision and inconsistency transfer well; indirectness and publication bias may need adaptation.

3. **Automation fidelity:** The literature shows LLM-assisted screening can exceed human performance (otto-SR: 96.7% vs. 81.7% sensitivity). However, these results are from structured medical literature. Performance on heterogeneous web sources (the pipeline's primary input) is unknown.

4. **Protocol rigidity vs. discovery:** Cochrane protocols are fixed before the review begins. ResearchLab's investigation tree model allows dynamic discovery (cross-pathway spawning). Should the protocol be rigid (Cochrane style) or allow bounded discovery? (Recommendation: bounded discovery with mandatory documentation.)

5. **Confidence scale convergence:** Should the pipeline migrate entirely to GRADE's four-level scale, or maintain the V/P/U/D/R scale with a formal mapping? (Recommendation: maintain both — V/P/U/D/R captures verification status, GRADE captures certainty. They answer different questions.)
