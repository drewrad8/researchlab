# Investigation Tree Design: Deterministic Branching for Repeatable Research

> **Status**: Design Document
> **Goal**: Perfect repeatability — same topic researched twice produces near-identical results
> **Scope**: Replaces ad-hoc research phase with structured, evidence-type-driven investigation pathways

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Design Principles](#2-design-principles)
3. [Evidence Classification Taxonomy](#3-evidence-classification-taxonomy)
4. [Investigation Pathways](#4-investigation-pathways)
5. [Pathway JSON Schema](#5-pathway-json-schema)
6. [Complete Pathway Definitions](#6-complete-pathway-definitions)
7. [Confidence Scoring Model](#7-confidence-scoring-model)
8. [Pipeline Integration](#8-pipeline-integration)
9. [How This Achieves Repeatability](#9-how-this-achieves-repeatability)
10. [Implementation Roadmap](#10-implementation-roadmap)

---

## 1. Problem Statement

The current pipeline (plan → research → verify → synthesize) gives workers open-ended questions and hopes for the best. Workers make ad-hoc decisions about:

- What to investigate next when they find something
- How deep to go on any particular thread
- When to stop investigating
- What constitutes "enough" evidence

This produces **inconsistent results** because two workers given the same question will follow different investigative paths based on what they happen to find first, their interpretation of "thorough," and implicit prioritization decisions.

**The fix**: Replace worker discretion with a **deterministic branching system** where the *type of evidence found* triggers *specific predefined follow-up investigations* along *structured pathways*. Workers become executors of a tree, not autonomous investigators.

---

## 2. Design Principles

These principles are drawn from three domains of structured evidence evaluation:

### From Intelligence Analysis (CIA/UK JIC/Mossad)

- **Separate source evaluation from information evaluation** (Admiralty System dual-axis: source reliability A-F, information credibility 1-6)
- **Seek discriminating evidence, not confirming evidence** (Analysis of Competing Hypotheses — evidence that's consistent with all hypotheses has zero diagnostic value)
- **Institutionalize dissent** (Israeli 10th Man doctrine — when consensus forms, a mandatory contrarian analysis is triggered)
- **Use standardized confidence language** (UK JIC Probability Yardstick: Remote < Highly Unlikely < Unlikely < Realistic Possibility < Likely < Highly Likely < Almost Certain)
- **Specify indicators for change** (every assessment must state what would change its conclusion)

### From Evidence-Based Medicine (Cochrane/GRADE)

- **Study type determines the assessment pathway** (RCTs → RoB 2; observational → ROBINS-I; diagnostic → QUADAS-2)
- **Evidence starts at a level and is upgraded/downgraded through structured factors** (5 downgrading, 3 upgrading in GRADE)
- **Bias assessment is domain-specific and checklist-driven** (randomization, blinding, attrition, selective reporting, confounding)
- **Heterogeneity triggers specific investigation** (subgroup analysis, meta-regression, sensitivity analysis)
- **Funding source is a first-class bias signal** (industry-funded studies get mandatory sensitivity analysis)

### From Investigative Journalism (Bellingcat/ProPublica/ICIJ)

- **Minimum 3 independent sources** for high-confidence claims (Bellingcat standard)
- **Trace every claim to its primary source** (SIFT: Stop, Investigate source, Find better coverage, Trace to original)
- **Evidence type determines verification toolkit** (images → reverse search + EXIF + shadow analysis; documents → registry verification + signatory check; financial → corporate chain tracing)
- **Follow-the-money is recursive** (ICIJ: if owner is a company, repeat ownership tracing until you reach a natural person)
- **Show your work** (ProPublica: publish methodology, release raw data, enable independent replication)

### Synthesis: Core Design Rules

1. **Evidence type determines pathway, not worker judgment**
2. **Every branch has explicit entry conditions and exit criteria**
3. **Maximum 4 levels deep per chain** (diminishing returns beyond this)
4. **Every pathway terminates in a confidence rating** using a standardized scale
5. **Contrarian analysis is mandatory when consensus exceeds 80%**
6. **Funding/conflict-of-interest is always investigated, never optional**

---

## 3. Evidence Classification Taxonomy

When a research worker encounters a piece of evidence, it must be classified into exactly one primary type. The type determines which investigation pathway is triggered.

### Primary Evidence Types

| ID | Type | Description | Examples |
|----|------|-------------|----------|
| `SCI` | Scientific Study | Peer-reviewed research, clinical trials, lab experiments | RCTs, cohort studies, meta-analyses, case reports |
| `GOV` | Government/Regulatory Data | Official data from government agencies | FDA databases, EPA measurements, WHO reports, census data |
| `ORG` | Organizational Claim | Claims by companies, NGOs, or institutions | Marketing materials, annual reports, press releases, mission statements |
| `EXP` | Expert Opinion | Statements from credentialed individuals | Interviews, op-eds, testimony, conference presentations |
| `STA` | Statistical Claim | Specific numbers, percentages, or quantitative assertions | "73% of...", "the average is...", "N times more likely" |
| `FIN` | Financial/Economic Data | Money flows, pricing, market data | Transactions, funding records, market research, economic indicators |
| `DOC` | Document/Record | Primary documents, contracts, leaked materials | Legal filings, internal memos, leaked emails, patents |
| `MED` | Media Report | News reporting, investigative journalism | News articles, documentaries, investigative series |
| `HIS` | Historical Claim | Assertions about past events | Historical accounts, archival claims, origin stories |
| `TES` | Testimonial/Anecdote | Personal accounts, case studies, reviews | Consumer reviews, patient testimonials, survivor accounts |
| `TEC` | Technical/Product Claim | Specifications, ingredient lists, performance claims | Lab results, spec sheets, certification claims |

### Secondary Classification: Source Reliability

Adapted from the NATO/Admiralty system, every source receives a reliability rating:

| Rating | Label | Criteria |
|--------|-------|----------|
| `A` | Established | Peer-reviewed journal (IF > 5), major government agency, court-verified |
| `B` | Generally Reliable | Peer-reviewed (IF 1-5), established news organization, recognized expert body |
| `C` | Mixed Record | Non-peer-reviewed but institutional, trade publications, advocacy organizations with disclosed methodology |
| `D` | Questionable | Self-published, predatory journals, anonymous sources, undisclosed methodology |
| `E` | Unreliable | Known to produce false/misleading content, retracted sources, sanctioned organizations |
| `F` | Unknown | New or untested source, no track record available |

### Secondary Classification: Information Credibility

| Rating | Label | Criteria |
|--------|-------|----------|
| `1` | Confirmed | Corroborated by 3+ independent sources |
| `2` | Probably True | Corroborated by 1-2 independent sources, logically consistent |
| `3` | Possibly True | Consistent with some known information but not independently confirmed |
| `4` | Doubtful | Inconsistent with other reporting or contains logical issues |
| `5` | Improbable | Contradicted by reliable sources |
| `6` | Cannot Judge | Insufficient information to evaluate |

The combined rating (e.g., `B2`, `D4`) determines the branch priority and depth of investigation required.

---

## 4. Investigation Pathways

Each pathway is a tree of worker spawns triggered by evidence type. A pathway defines:

- **Trigger**: The evidence type and conditions that activate this pathway
- **Levels**: Ordered investigation steps (max 4 levels)
- **Branch conditions**: What results at each level trigger which next-level investigations
- **Exit criteria**: When to stop and what confidence rating to assign
- **Required outputs**: What each level must produce

### Pathway Overview

| ID | Name | Trigger | Max Depth |
|----|------|---------|-----------|
| `P-SCI` | Scientific Evidence Provenance | Evidence type `SCI` | 4 |
| `P-GOV` | Government Data Verification | Evidence type `GOV` | 3 |
| `P-ORG` | Organizational Claim Investigation | Evidence type `ORG` | 4 |
| `P-EXP` | Expert Credibility Assessment | Evidence type `EXP` | 3 |
| `P-STA` | Statistical Claim Verification | Evidence type `STA` | 4 |
| `P-FIN` | Financial Flow Tracing | Evidence type `FIN` | 4 |
| `P-DOC` | Document Authentication | Evidence type `DOC` | 3 |
| `P-MED` | Media Source Tracing | Evidence type `MED` | 3 |
| `P-HIS` | Historical Claim Verification | Evidence type `HIS` | 3 |
| `P-TES` | Testimonial Corroboration | Evidence type `TES` | 3 |
| `P-TEC` | Technical Claim Verification | Evidence type `TEC` | 4 |
| `P-CON` | Contrarian Analysis | Triggered by consensus > 80% | 2 |

---

## 5. Pathway JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "InvestigationPathway",
  "description": "A deterministic investigation pathway triggered by evidence type",
  "type": "object",
  "required": ["id", "name", "version", "trigger", "levels"],
  "properties": {
    "id": {
      "type": "string",
      "pattern": "^P-[A-Z]{2,4}$",
      "description": "Pathway identifier"
    },
    "name": {
      "type": "string",
      "description": "Human-readable pathway name"
    },
    "version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+\\.\\d+$",
      "description": "Semver for pathway definition versioning"
    },
    "trigger": {
      "type": "object",
      "required": ["evidenceType"],
      "properties": {
        "evidenceType": {
          "type": "string",
          "enum": ["SCI", "GOV", "ORG", "EXP", "STA", "FIN", "DOC", "MED", "HIS", "TES", "TEC"],
          "description": "Primary evidence type that activates this pathway"
        },
        "conditions": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["field", "operator", "value"],
            "properties": {
              "field": { "type": "string" },
              "operator": { "enum": ["equals", "contains", "greaterThan", "lessThan", "in", "notIn"] },
              "value": {}
            }
          },
          "description": "Additional conditions beyond evidence type (e.g., source reliability below C)"
        }
      }
    },
    "levels": {
      "type": "array",
      "minItems": 1,
      "maxItems": 4,
      "items": {
        "$ref": "#/definitions/Level"
      },
      "description": "Ordered investigation levels (depth 1 to max 4)"
    },
    "exitCriteria": {
      "type": "object",
      "properties": {
        "minimumSources": {
          "type": "integer",
          "minimum": 1,
          "description": "Minimum independent sources required for pathway completion"
        },
        "requiredLevels": {
          "type": "integer",
          "minimum": 1,
          "description": "Minimum number of levels that must complete successfully"
        },
        "timeoutMinutes": {
          "type": "integer",
          "description": "Maximum time for entire pathway"
        }
      }
    }
  },
  "definitions": {
    "Level": {
      "type": "object",
      "required": ["depth", "name", "workerTemplate", "task", "requiredOutputs"],
      "properties": {
        "depth": {
          "type": "integer",
          "minimum": 1,
          "maximum": 4,
          "description": "Depth in the investigation tree (1 = root)"
        },
        "name": {
          "type": "string",
          "description": "Human-readable level name"
        },
        "workerTemplate": {
          "type": "string",
          "enum": ["research", "review", "impl"],
          "description": "Strategos worker template to use"
        },
        "task": {
          "type": "object",
          "required": ["purpose", "keyTasks", "endState"],
          "properties": {
            "purpose": {
              "type": "string",
              "description": "Commander's Intent: why this level matters (references parent evidence)"
            },
            "keyTasks": {
              "type": "array",
              "items": { "type": "string" },
              "description": "Specific, verifiable tasks for the worker"
            },
            "endState": {
              "type": "string",
              "description": "Observable condition that defines success"
            }
          }
        },
        "requiredOutputs": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["field", "type"],
            "properties": {
              "field": { "type": "string" },
              "type": { "type": "string", "enum": ["string", "number", "boolean", "array", "object"] },
              "description": { "type": "string" }
            }
          },
          "description": "Structured output fields this level must produce"
        },
        "branches": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/Branch"
          },
          "description": "Conditional branches to next level based on this level's output"
        },
        "parallel": {
          "type": "boolean",
          "default": false,
          "description": "Whether this level's branches can execute in parallel"
        }
      }
    },
    "Branch": {
      "type": "object",
      "required": ["condition", "nextLevel"],
      "properties": {
        "condition": {
          "type": "object",
          "required": ["field", "operator", "value"],
          "properties": {
            "field": {
              "type": "string",
              "description": "Output field from current level to evaluate"
            },
            "operator": {
              "type": "string",
              "enum": ["equals", "notEquals", "contains", "greaterThan", "lessThan", "in", "exists", "notExists"]
            },
            "value": {
              "description": "Value to compare against (type depends on operator)"
            }
          }
        },
        "nextLevel": {
          "type": "integer",
          "minimum": 2,
          "maximum": 4,
          "description": "Which level to proceed to"
        },
        "priority": {
          "type": "string",
          "enum": ["critical", "high", "medium", "low"],
          "default": "medium",
          "description": "Investigation priority (affects resource allocation)"
        }
      }
    }
  }
}
```

### Worker Output Schema

Every worker at every level produces output conforming to this structure:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "LevelOutput",
  "type": "object",
  "required": ["pathwayId", "depth", "evidenceFound", "sourceRating", "infoRating", "findings"],
  "properties": {
    "pathwayId": { "type": "string" },
    "depth": { "type": "integer" },
    "evidenceFound": { "type": "boolean" },
    "sourceRating": { "type": "string", "pattern": "^[A-F]$" },
    "infoRating": { "type": "string", "pattern": "^[1-6]$" },
    "findings": {
      "type": "object",
      "description": "Level-specific structured findings (schema varies by pathway/level)"
    },
    "branchSignals": {
      "type": "object",
      "description": "Key-value pairs that the pipeline evaluates against branch conditions",
      "additionalProperties": true
    },
    "citations": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["text"],
        "properties": {
          "text": { "type": "string" },
          "url": { "type": "string" },
          "pmid": { "type": "string" },
          "year": { "type": "string" },
          "sourceRating": { "type": "string" }
        }
      }
    },
    "nextEvidenceTypes": {
      "type": "array",
      "items": { "type": "string", "enum": ["SCI", "GOV", "ORG", "EXP", "STA", "FIN", "DOC", "MED", "HIS", "TES", "TEC"] },
      "description": "New evidence types discovered that should trigger additional pathways"
    }
  }
}
```

---

## 6. Complete Pathway Definitions

### P-SCI: Scientific Evidence Provenance

**Trigger**: Evidence classified as `SCI` (scientific study, clinical trial, lab report)

**Rationale**: Based on GRADE framework starting-point logic and Cochrane RoB 2 bias assessment. The type of study determines the assessment pathway. Funding investigation is mandatory per meta-epidemiological evidence that industry funding biases results.

```
Level 1: LOCATE ORIGINAL STUDY
  Task: Find the actual published paper. Extract: study type (RCT, cohort,
        case-control, cross-sectional, case report, meta-analysis, systematic
        review), sample size, journal name, publication year, DOI/PMID.
  Required outputs: studyType, sampleSize, journalName, impactFactor,
                    doi, pmid, retracted, corrected
  Branches:
    IF studyType IN [rct, crossover-rct] → Level 2A (RCT Bias Assessment)
    IF studyType IN [cohort, case-control, cross-sectional] → Level 2B (Observational Bias Assessment)
    IF studyType IN [meta-analysis, systematic-review] → Level 2C (Review Quality Assessment)
    IF studyType IN [case-report, case-series, animal, in-vitro] → Level 2D (Low-Hierarchy Assessment)
    IF retracted = true → TERMINATE, confidence = RETRACTED

Level 2A: RCT BIAS ASSESSMENT (Adapted from RoB 2)
  Task: Assess five bias domains: (1) randomization process, (2) deviations
        from intended intervention, (3) missing outcome data, (4) outcome
        measurement, (5) selective reporting. Check trial registration
        against published outcomes.
  Required outputs: biasRating (low/some-concerns/high per domain),
                    overallBias, registrationMatch, blindingAdequate
  Branches:
    IF overallBias = "high" → Level 3 (Funding Investigation) + flag
    IF overallBias IN ["low", "some-concerns"] → Level 3 (Funding Investigation)

Level 2B: OBSERVATIONAL BIAS ASSESSMENT (Adapted from ROBINS-I)
  Task: Assess seven bias domains: (1) confounding, (2) participant
        selection, (3) intervention classification, (4) deviations,
        (5) missing data, (6) outcome measurement, (7) selective reporting.
        Identify critical confounders for this research question.
  Required outputs: biasRating (per domain), overallBias,
                    confoundersControlled, residualConfounding
  Branches:
    ALWAYS → Level 3 (Funding Investigation)
    IF large effect (RR > 2 or < 0.5) AND low confounding → UPGRADE evidence

Level 2C: REVIEW QUALITY ASSESSMENT
  Task: Assess review methodology: (1) Was the search comprehensive?
        (2) Were inclusion criteria appropriate? (3) Was bias assessment
        performed? (4) Was heterogeneity addressed? (5) Check AMSTAR-2
        quality domains if applicable.
  Required outputs: searchComprehensive, biasAssessed, heterogeneityAddressed,
                    includedStudyCount, overallQuality
  Branches:
    IF overallQuality IN ["high", "moderate"] → Level 3 (Funding Investigation)
    IF overallQuality IN ["low", "critically-low"] → Level 3 + flag as weak

Level 2D: LOW-HIERARCHY ASSESSMENT
  Task: Document the evidence type's inherent limitations. For case
        reports: note N=1 and no control. For animal/in-vitro: note
        translation uncertainty. Search for higher-quality evidence on
        the same question.
  Required outputs: limitations, higherEvidenceExists, higherEvidenceConclusion
  Branches:
    IF higherEvidenceExists = true → REDIRECT to that evidence's pathway
    IF higherEvidenceExists = false → Level 3 (Funding Investigation) + cap confidence at PLAUSIBLE

Level 3: FUNDING AND CONFLICT-OF-INTEREST INVESTIGATION
  Task: (1) Identify who funded the study. (2) Research the funder:
        industry ties, commercial interests in the outcome, other funded
        studies with patterns of favorable results. (3) Check author
        disclosures. (4) Search for financial relationships between
        authors and entities that benefit from the findings.
  Required outputs: fundingSource, funderType (independent/industry/government/
                    undisclosed), conflictsFound, authorDisclosures
  Branches:
    IF funderType = "industry" → Level 4 (Replication & Contradictory Evidence)
    IF funderType = "undisclosed" → Level 4 + flag
    IF conflictsFound = true → Level 4 + flag
    IF funderType IN ["independent", "government"] AND conflictsFound = false → Level 4

Level 4: REPLICATION AND CONTRADICTORY EVIDENCE
  Task: (1) Search for replication studies. (2) Search for contradicting
        evidence. (3) Search for meta-analyses that include this study.
        (4) Check if the findings have been superseded by newer research.
  Required outputs: replicationExists, replicationConfirms, contradictoryEvidence,
                    metaAnalysisExists, metaAnalysisConclusion, superseded
  Exit: Compute final confidence rating from accumulated evidence.
```

### P-GOV: Government Data Verification

**Trigger**: Evidence classified as `GOV`

**Rationale**: Government data has institutional credibility but is subject to political influence, methodological limitations, and regulatory capture. Based on intelligence community multi-source fusion principles.

```
Level 1: VERIFY AGENCY AND METHODOLOGY
  Task: (1) Identify the specific agency, department, and dataset.
        (2) Find the published methodology (how data was collected,
        sampling, instruments, frequency). (3) Check if the methodology
        has been peer-reviewed or audited. (4) Note the date range and
        any known data gaps.
  Required outputs: agency, dataset, methodology, peerReviewed,
                    dateRange, knownGaps, measurementMethod
  Branches:
    IF methodology NOT found → Level 2 + flag as opaque
    IF peerReviewed = true → Level 2
    IF peerReviewed = false → Level 2 + note

Level 2: INDEPENDENCE AND POLITICAL INFLUENCE CHECK
  Task: (1) Research whether this agency's data or conclusions have been
        subject to political pressure or interference (documented cases).
        (2) Check if agency leadership during the reporting period had
        conflicts of interest. (3) Research whether the agency's methodology
        changed and whether changes coincided with political transitions.
        (4) Check for whistleblower reports or OIG investigations.
  Required outputs: politicalInterference, leadershipConflicts,
                    methodologyChanges, whistleblowerReports, oigInvestigations
  Branches:
    IF politicalInterference found → Level 3 + flag
    IF whistleblowerReports found → Level 3 + flag
    ALWAYS → Level 3

Level 3: CROSS-REFERENCE WITH INDEPENDENT MEASUREMENTS
  Task: (1) Find independent measurements of the same thing (academic
        studies, NGO measurements, international agency data, private
        sector data). (2) Compare values. (3) If discrepancies exist,
        research which measurement is more methodologically sound.
  Required outputs: independentSources, valuesMatch, discrepancies,
                    moreReliableSource
  Exit: Compute confidence based on convergence/divergence of sources.
```

### P-ORG: Organizational Claim Investigation

**Trigger**: Evidence classified as `ORG` (company, NGO, institution makes a claim)

**Rationale**: Organizations have inherent motivations. Based on ICIJ shell-company tracing methodology and Bellingcat multi-source corroboration. Every organizational claim must be traced to verifiable evidence.

```
Level 1: IDENTIFY THE CLAIM AND THE ORGANIZATION
  Task: (1) Extract the specific claim. (2) Research the organization:
        type (for-profit, nonprofit, government, industry group, advocacy),
        founding date, leadership, stated mission. (3) Identify the
        organization's commercial or ideological interest in the claim
        being true.
  Required outputs: claim, orgType, orgAge, leadership, statedMission,
                    interestInClaim, revenueSource
  Branches:
    IF claim involves scientific/health assertion → spawn P-SCI pathway for underlying evidence
    IF claim involves financial figures → spawn P-FIN pathway
    IF claim involves product performance → spawn P-TEC pathway
    ALWAYS → Level 2

Level 2: VERIFY SUPPORTING EVIDENCE
  Task: (1) Find the evidence the organization cites to support the claim.
        (2) If they cite a study, locate the actual study (not just the
        press release). (3) If they cite data, find the original dataset.
        (4) Check if the evidence actually supports the claim as stated,
        or if the claim exaggerates/misrepresents the evidence.
  Required outputs: citedEvidence, evidenceLocated, evidenceSupports,
                    exaggeration, misrepresentation, cherryPicking
  Branches:
    IF evidenceLocated = false → flag as unsubstantiated, lower confidence
    IF exaggeration = true → Level 3 + flag
    IF misrepresentation = true → Level 3 + flag
    IF evidenceSupports = true → Level 3

Level 3: CHECK REGULATORY AND LEGAL HISTORY
  Task: (1) Search for FDA warning letters, FTC enforcement actions, or
        equivalent regulatory actions against this organization.
        (2) Search for lawsuits related to the claim (class actions,
        false advertising). (3) Check BBB complaints, consumer protection
        actions. (4) Search for recalls or corrections.
  Required outputs: regulatoryActions, lawsuits, consumerComplaints,
                    recalls, corrections
  Branches:
    IF regulatoryActions found → Level 4 + major flag
    ALWAYS → Level 4

Level 4: INDEPENDENT CORROBORATION
  Task: (1) Search for independent parties (unaffiliated researchers,
        competing organizations, consumer watchdogs) who have evaluated
        the same claim. (2) Search for investigative journalism about
        this organization. (3) Check Glassdoor, whistleblower reports,
        or internal leaks.
  Required outputs: independentEvaluations, journalisticInvestigations,
                    whistleblowerAccounts, overallCorroboration
  Exit: Compute confidence from accumulated evidence.
```

### P-EXP: Expert Credibility Assessment

**Trigger**: Evidence classified as `EXP`

**Rationale**: Based on CIA source reliability assessment (track record evaluation) and GRADE's approach to expert opinion as lowest-hierarchy evidence. Credentials alone are insufficient; financial conflicts and peer agreement must be checked.

```
Level 1: VERIFY CREDENTIALS
  Task: (1) Verify the person's stated credentials (degrees, positions,
        certifications). (2) Check publication record (h-index, relevant
        publications). (3) Confirm institutional affiliation. (4) Check
        if credentials are relevant to the specific claim.
  Required outputs: credentialsVerified, relevantExpertise, publicationCount,
                    hIndex, institutionalAffiliation, credentialsRelevant
  Branches:
    IF credentialsVerified = false → TERMINATE, confidence = UNRELIABLE
    IF credentialsRelevant = false → flag, continue to Level 2
    ALWAYS → Level 2

Level 2: FINANCIAL CONFLICTS AND FUNDING
  Task: (1) Check financial disclosures. (2) Search for consulting
        relationships, advisory board memberships, speaking fees from
        entities that benefit from the expert's position. (3) Check if
        the expert has patents, equity, or royalties related to the claim.
        (4) Search for "Dollars for Docs" type databases.
  Required outputs: financialConflicts, consultingRelationships,
                    patents, equityInterests, speakingFees
  Branches:
    IF financialConflicts found → Level 3 + flag
    ALWAYS → Level 3

Level 3: PEER AGREEMENT AND DISAGREEMENT
  Task: (1) Find other experts in the same field who have commented on
        the same topic. (2) Determine if there is consensus or
        disagreement. (3) If disagreement exists, characterize the split
        (majority vs. minority, what the points of contention are).
        (4) Check for formal rebuttals or letters to the editor.
  Required outputs: peerAgreement (consensus/majority/split/minority/outlier),
                    dissentingExperts, pointsOfContention, formalRebuttals
  Exit: Compute confidence based on credentials + conflicts + peer position.
```

### P-STA: Statistical Claim Verification

**Trigger**: Evidence classified as `STA`

**Rationale**: Based on GRADE imprecision assessment and Cochrane heterogeneity detection. Statistical claims are the most commonly misrepresented type of evidence. Every number needs its context verified.

```
Level 1: LOCATE ORIGINAL DATASET
  Task: (1) Find the original source of the number. (2) Trace through
        any citation chains (claim → news article → press release →
        actual study). (3) Verify the exact number as stated (misquoting
        is common). (4) Extract the full context: sample size, confidence
        interval, time period, population.
  Required outputs: originalSource, numberVerified, sampleSize,
                    confidenceInterval, timePeriod, population,
                    citationChainLength
  Branches:
    IF numberVerified = false → TERMINATE, confidence = DISPUTED
    IF sampleSize < 30 → flag as underpowered
    IF confidenceInterval NOT available → flag as imprecise
    ALWAYS → Level 2

Level 2: METHODOLOGY AND STATISTICAL VALIDITY
  Task: (1) Check for p-hacking indicators: many comparisons with few
        corrections, p-values clustering just below 0.05, outcomes changed
        from pre-registration. (2) Check for cherry-picking: was this
        one favorable result selected from many analyses? (3) Verify
        statistical methods are appropriate for the data type.
        (4) Check for Simpson's paradox, ecological fallacy, base rate neglect.
  Required outputs: pHackingRisk, cherryPickingRisk, methodsAppropriate,
                    statisticalFallacies, preRegistered
  Branches:
    IF pHackingRisk = "high" → Level 3 + flag
    IF cherryPickingRisk = "high" → Level 3 + flag
    ALWAYS → Level 3

Level 3: CONTEXTUALIZATION AND COMPARISON
  Task: (1) Find the base rate. (2) Express relative risks as absolute
        risks. (3) Compare to other relevant statistics for context.
        (4) Search for meta-analyses that include this finding.
  Required outputs: baseRate, absoluteRisk, relativeRisk, contextComparison,
                    metaAnalysisExists, metaAnalysisConclusion
  Branches:
    IF metaAnalysisExists = true → Level 4 (assess meta-analysis quality)
    ALWAYS → Level 4

Level 4: REPLICATION AND TREND
  Task: (1) Has this statistic been measured by multiple independent
        groups? (2) Is there a time trend? (3) Has the methodology
        been consistent across measurements? (4) Are there geographic
        or demographic variations that affect interpretation?
  Required outputs: replicationSources, timeTrend, methodologyConsistent,
                    variations
  Exit: Compute confidence from accumulated evidence.
```

### P-FIN: Financial Flow Tracing

**Trigger**: Evidence classified as `FIN`

**Rationale**: Based on ICIJ Panama/Pandora Papers methodology and OCCRP Laundromat investigations. Financial evidence requires recursive ownership tracing.

```
Level 1: IDENTIFY PARTIES AND TRANSACTION
  Task: (1) Identify all parties in the financial relationship (payer,
        payee, intermediaries). (2) Determine the nature of the financial
        relationship (funding, payment, investment, grant, loan). (3) Note
        amounts, dates, and stated purposes.
  Required outputs: parties, transactionType, amounts, dates,
                    statedPurpose, currency
  Branches:
    IF any party is a company → Level 2A (Corporate Ownership Tracing)
    IF any party is an individual → Level 2B (Individual Financial Profile)
    ALWAYS → Level 3

Level 2A: CORPORATE OWNERSHIP TRACING (recursive)
  Task: (1) Search corporate registries (OpenCorporates, jurisdiction-specific
        registries) for each company. (2) Extract officers, directors,
        shareholders. (3) If any owner is another company, trace one more
        level. (4) Identify the ultimate beneficial owner (UBO). (5) Check
        for shell company indicators: nominee directors, secrecy jurisdiction,
        no visible operations.
  Required outputs: corporateStructure, ubo, shellCompanyIndicators,
                    jurisdiction, registrationDate, officers
  Branches:
    IF shellCompanyIndicators found → Level 3 + flag
    ALWAYS → Level 3

Level 2B: INDIVIDUAL FINANCIAL PROFILE
  Task: (1) Identify the individual's other known financial relationships
        relevant to the investigation topic. (2) Check for PEP (Politically
        Exposed Person) status. (3) Search for sanctions.
  Required outputs: otherRelationships, pepStatus, sanctioned
  Branches:
    ALWAYS → Level 3

Level 3: MOTIVATION AND INTEREST ANALYSIS
  Task: (1) Determine what financial interest each party has in the
        outcome/claim being investigated. (2) Research whether similar
        financial relationships have influenced outcomes in other cases.
        (3) Check for patterns: does this funder consistently fund research
        that supports their commercial interests?
  Required outputs: financialInterests, influencePatterns, fundingBiasPattern
  Branches:
    IF fundingBiasPattern found → Level 4 + flag
    ALWAYS → Level 4

Level 4: CROSS-REFERENCE AND VALIDATE
  Task: (1) Cross-reference the financial information against public records,
        tax filings, and regulatory disclosures. (2) Check for discrepancies
        between disclosed and discovered financial relationships.
  Required outputs: crossReferenced, discrepancies, validationSources
  Exit: Compute confidence.
```

### P-DOC: Document Authentication

**Trigger**: Evidence classified as `DOC`

**Rationale**: Based on Bellingcat digital forensics workflow and Berkeley Protocol evidence standards. Documents need provenance verification before their content can be trusted.

```
Level 1: PROVENANCE AND AUTHENTICATION
  Task: (1) Determine the origin of the document. (2) Verify formatting
        against known templates from the alleged source. (3) Check
        metadata (creation date, author, modification history if available).
        (4) If digital, check for signs of alteration.
  Required outputs: allegedSource, provenanceVerified, formatConsistent,
                    metadata, alterationSigns
  Branches:
    IF provenanceVerified = false → Level 2 + flag
    IF alterationSigns found → Level 2 + flag
    ALWAYS → Level 2

Level 2: CONTENT VERIFICATION
  Task: (1) Cross-reference specific claims in the document against
        independent sources. (2) Verify named individuals, dates, and
        events mentioned. (3) Check for internal consistency. (4) If the
        document references other documents, attempt to locate those.
  Required outputs: claimsVerified, internalConsistency,
                    referencedDocumentsFound, crossReferenceResults
  Branches:
    ALWAYS → Level 3

Level 3: SOURCE MOTIVATION AND CONTEXT
  Task: (1) If the document is leaked: research the likely source and
        their motivation. (2) If the document is official: research the
        issuing body and their interests. (3) Assess whether the document
        could be a forgery, a limited hangout, or selective disclosure.
  Required outputs: sourceMotivation, forgeryRisk, selectiveDisclosureRisk,
                    contextAssessment
  Exit: Compute confidence.
```

### P-MED: Media Source Tracing

**Trigger**: Evidence classified as `MED`

**Rationale**: Based on First Draft's Five Pillars of Verification and the SIFT method. Media reports are secondary sources; the investigation must trace back to primary sources.

```
Level 1: TRACE TO PRIMARY SOURCE
  Task: (1) Identify what primary source(s) the media report is based
        on (study, document, interview, event). (2) Locate the primary
        source. (3) Check if the media report accurately represents the
        primary source. (4) Note any editorialization or framing.
  Required outputs: primarySource, primarySourceLocated,
                    accurateRepresentation, editorialization, framing
  Branches:
    IF primarySourceLocated = true → REDIRECT to appropriate pathway for that source type
    IF primarySourceLocated = false → Level 2

Level 2: MEDIA OUTLET AND JOURNALIST ASSESSMENT
  Task: (1) Research the media outlet: ownership, editorial stance,
        known biases, track record of corrections/retractions.
        (2) Research the journalist: beat, track record, awards,
        corrections. (3) Check Media Bias/Fact Check or equivalent
        ratings.
  Required outputs: outletOwnership, outletBias, outletTrackRecord,
                    journalistTrackRecord, factCheckRating
  Branches:
    ALWAYS → Level 3

Level 3: CORROBORATION FROM OTHER OUTLETS
  Task: (1) Search for independent reporting on the same topic.
        (2) Compare how different outlets present the same information.
        (3) Note where outlets converge (likely accurate) and diverge
        (likely editorialized or uncertain).
  Required outputs: independentReports, convergencePoints, divergencePoints
  Exit: Compute confidence.
```

### P-HIS: Historical Claim Verification

**Trigger**: Evidence classified as `HIS`

```
Level 1: PRIMARY SOURCE SEARCH
  Task: (1) Locate the primary source(s) for the historical claim
        (original documents, contemporaneous accounts, archaeological
        evidence). (2) Assess the primary source's proximity to the event
        (eyewitness vs. secondhand vs. much later reconstruction).
  Required outputs: primarySources, proximityToEvent, sourceType,
                    numberOfPrimarySources
  Branches:
    IF numberOfPrimarySources = 0 → flag as undocumented, cap at UNVERIFIED
    IF numberOfPrimarySources >= 1 → Level 2

Level 2: CROSS-REFERENCE MULTIPLE ACCOUNTS
  Task: (1) Find additional independent accounts of the same events.
        (2) Compare accounts for convergence and divergence.
        (3) Note where accounts agree (likely factual) and disagree
        (possibly biased, misremembered, or propagandistic).
  Required outputs: additionalAccounts, convergence, divergence,
                    likelyFactual, likelyDisputed
  Branches:
    ALWAYS → Level 3

Level 3: CHECK FOR REVISIONISM AND BIAS
  Task: (1) Research whether this historical narrative has been
        challenged by academic historians. (2) Check for politically
        motivated revisionism. (3) Check for survivor bias, victor's
        narrative bias, or erasure of perspectives. (4) Find the current
        academic consensus if one exists.
  Required outputs: revisionismChallenges, politicalMotivation,
                    narrativeBias, academicConsensus
  Exit: Compute confidence.
```

### P-TES: Testimonial Corroboration

**Trigger**: Evidence classified as `TES`

```
Level 1: ASSESS THE WITNESS
  Task: (1) Verify the person's identity and claimed background.
        (2) Assess their proximity to the subject (direct experience vs.
        secondhand vs. hearsay). (3) Check for financial or ideological
        motivation to present a particular narrative.
  Required outputs: identityVerified, proximity, motivation,
                    financialInterest, ideologicalStance
  Branches:
    IF identityVerified = false → flag, continue to Level 2
    IF proximity = "hearsay" → cap confidence at UNVERIFIED
    ALWAYS → Level 2

Level 2: CORROBORATE WITH ADDITIONAL TESTIMONIES
  Task: (1) Search for other testimonials from independent individuals
        about the same subject. (2) Check for patterns: do multiple
        independent accounts converge? (3) Search for contradicting
        testimonials.
  Required outputs: additionalTestimonials, convergence, contradictions,
                    independenceVerified
  Branches:
    ALWAYS → Level 3

Level 3: CORROBORATE WITH NON-TESTIMONIAL EVIDENCE
  Task: (1) Search for documentary, statistical, or scientific evidence
        that supports or contradicts the testimonial. (2) Testimonials
        alone, no matter how many, cannot achieve VERIFIED status without
        corroborating non-testimonial evidence.
  Required outputs: documentaryEvidence, scientificEvidence,
                    statisticalEvidence, corroborationStrength
  Exit: Compute confidence. Testimonial-only evidence caps at PLAUSIBLE.
```

### P-TEC: Technical/Product Claim Verification

**Trigger**: Evidence classified as `TEC`

**Rationale**: Product and technical claims require verification against actual specifications, independent testing, and regulatory compliance. Based on ProPublica's data-driven verification and FDA/FTC enforcement patterns.

```
Level 1: VERIFY THE CLAIMED SPECIFICATION
  Task: (1) Find the product's actual specification/ingredient list
        from official sources (not marketing). (2) Compare marketing
        claims against actual specs. (3) Check for certifications
        claimed vs. certifications held.
  Required outputs: actualSpecs, claimedSpecs, discrepancies,
                    certificationsVerified, ingredientList
  Branches:
    IF discrepancies found → Level 2 + flag
    ALWAYS → Level 2

Level 2: INDEPENDENT TESTING AND REVIEW
  Task: (1) Find independent lab tests or third-party evaluations.
        (2) Search consumer testing organizations (Consumer Reports,
        Wirecutter, independent labs). (3) Check if any regulatory body
        has tested or evaluated the product.
  Required outputs: independentTests, consumerTestResults,
                    regulatoryEvaluation, testResults
  Branches:
    IF independentTests found → Level 3
    IF no independent tests → flag as unverified, still proceed to Level 3

Level 3: REGULATORY AND SAFETY CHECK
  Task: (1) Search for FDA warning letters, recalls, safety notices.
        (2) Search for FTC enforcement actions (false advertising).
        (3) Search for international equivalent actions (EU RAPEX, etc).
        (4) Check adverse event reporting databases (FAERS, CPSC).
  Required outputs: warningLetters, recalls, enforcementActions,
                    adverseEvents, safetyNotices
  Branches:
    ALWAYS → Level 4

Level 4: COMPARATIVE ANALYSIS
  Task: (1) Compare against competing/alternative products on the same
        verified metrics. (2) Identify best-in-class products based on
        independent evidence, not marketing. (3) Produce actionable
        ranking if sufficient data exists.
  Required outputs: competitiveComparison, bestInClass, rankingBasis,
                    dataQuality
  Exit: Compute confidence.
```

### P-CON: Contrarian Analysis (10th Man Protocol)

**Trigger**: Consensus exceeds 80% across accumulated evidence for any key claim

**Rationale**: Based on Israeli 10th Man doctrine and CIA Team A/Team B analysis. Strong consensus can mask groupthink or systematic bias across sources.

```
Level 1: CONSTRUCT STRONGEST COUNTER-ARGUMENT
  Task: (1) Given the consensus position, construct the strongest possible
        case for the opposite conclusion. (2) Identify the evidence that
        most challenges the consensus. (3) Identify what would have to be
        true for the consensus to be wrong. (4) Check if any credible
        minority position exists among experts.
  Required outputs: counterArgument, challengingEvidence,
                    whatWouldHaveToBeTrue, minorityPosition
  Branches:
    IF challengingEvidence is substantial → Level 2
    IF challengingEvidence is weak → EXIT (consensus confirmed)

Level 2: EVALUATE THE CONTRARIAN CASE
  Task: (1) Apply the same rigorous evidence evaluation to the contrarian
        evidence. (2) Determine if the contrarian position has been
        suppressed, underfunded, or marginalized for non-scientific reasons.
        (3) If the contrarian position is credible, determine whether it
        should lower the confidence of the consensus claim or be presented
        as an alternative interpretation.
  Required outputs: contrarianEvidenceQuality, suppressionEvidence,
                    adjustmentRecommendation
  Exit: Adjust consensus confidence if warranted.
```

---

## 7. Confidence Scoring Model

Every investigation pathway terminates in a confidence score. This is computed deterministically from the accumulated evidence.

### Confidence Levels

Adapted from the UK JIC Probability Yardstick, the CIA confidence framework, and GRADE quality levels:

| Level | Label | Definition | Conditions |
|-------|-------|-----------|------------|
| `V` | **VERIFIED** | True beyond reasonable doubt | 3+ independent confirmations from A/B sources, no contradictions, no significant bias found |
| `P` | **PLAUSIBLE** | Probably true | 1-2 independent confirmations, or 3+ from C-rated sources, minor concerns |
| `U` | **UNVERIFIED** | Cannot confirm or deny | Evidence found but insufficient for confirmation, significant gaps |
| `D` | **DISPUTED** | Actively contested | Contradictory evidence of similar quality, unresolved conflicts |
| `R` | **RETRACTED** | Known to be false or withdrawn | Source retracted, regulatory action, proven fabrication |

### Scoring Algorithm

The confidence score is computed from four weighted dimensions:

```
FINAL_CONFIDENCE = f(
  SOURCE_QUALITY,      # Admiralty rating of best sources (weight: 0.25)
  CORROBORATION,       # Number of independent confirmations (weight: 0.30)
  BIAS_ASSESSMENT,     # Results of funding/conflict investigation (weight: 0.25)
  METHODOLOGY_QUALITY  # Results of methodology assessment (weight: 0.20)
)
```

**Scoring rules (deterministic, applied in order)**:

```
1. IF any evidence is RETRACTED → confidence = R
2. IF contradictory evidence of equal quality exists → confidence = D
3. IF 3+ independent sources (rated A or B) confirm,
   AND no unresolved bias flags,
   AND methodology rated sound → confidence = V
4. IF 1-2 independent sources confirm,
   OR 3+ sources rated C or lower confirm,
   OR bias flags exist but are minor → confidence = P
5. OTHERWISE → confidence = U
```

**Modifiers (applied after base computation)**:

| Condition | Effect |
|-----------|--------|
| Industry funding with no independent replication | Cannot exceed P |
| Testimonial-only evidence | Cannot exceed P |
| Case report / animal / in-vitro only | Cannot exceed P |
| Sample size < 30 | Cannot exceed P |
| P-hacking or cherry-picking detected | Downgrade one level |
| Contrarian analysis found credible counter | Downgrade one level |
| Large effect size (RR > 5 or < 0.2) from quality study | Upgrade one level |
| Dose-response relationship confirmed | Upgrade one level |

---

## 8. Pipeline Integration

### Modified Pipeline Architecture

The pipeline changes from:

```
plan → research → verify → synthesize
```

To:

```
plan → classify → investigate(tree) → adjudicate → synthesize
```

### Phase-by-Phase Design

#### Phase 1: PLANNING (mostly unchanged)

Same as current — break topic into 5-8 sub-questions. **Addition**: each sub-question now includes `expectedEvidenceTypes`, a list of the evidence types likely to be encountered.

#### Phase 2: CLASSIFY (new)

For each sub-question, a research worker performs an initial broad search and classifies all encountered evidence by type (using the taxonomy in Section 3). This phase produces an **evidence manifest**:

```json
{
  "subQuestionId": "q1",
  "evidenceItems": [
    {
      "id": "e1",
      "type": "SCI",
      "sourceRating": "B",
      "infoRating": "2",
      "description": "RCT on X published in Y",
      "citation": { "text": "...", "url": "...", "pmid": "..." },
      "triggeredPathway": "P-SCI"
    }
  ]
}
```

**Worker template**: `research`
**Worker count**: Same batching as current phase 2 (3-5 workers for 5-8 questions)
**Output**: Evidence manifest JSON per worker

#### Phase 3: INVESTIGATE (new — replaces old research + verify)

The pipeline reads the evidence manifests and spawns investigation workers along the pathways:

```javascript
// Pseudocode for the investigation phase
for (const item of evidenceManifest) {
  const pathway = loadPathway(item.triggeredPathway);

  // Start at Level 1
  const level1Output = await spawnInvestigationWorker(pathway, 1, item);

  // Evaluate branch conditions
  for (const branch of pathway.levels[0].branches) {
    if (evaluateCondition(branch.condition, level1Output.branchSignals)) {
      // Spawn next level worker
      const level2Output = await spawnInvestigationWorker(
        pathway, branch.nextLevel, item, level1Output
      );
      // Continue evaluating branches recursively...
    }
  }
}
```

Key implementation details:

1. **Parallelism**: Evidence items that trigger different pathways (or the same pathway for different evidence) execute in parallel. Levels within a single pathway chain execute sequentially (each level depends on the previous level's output).

2. **Cross-pathway spawning**: When a pathway discovers new evidence of a different type (e.g., P-ORG discovers a scientific claim → spawns P-SCI), the new pathway runs in parallel with the current one.

3. **Worker task construction**: Each investigation worker receives a task constructed from the pathway definition's `task` template, with placeholders filled from the evidence item and any parent-level outputs:

```javascript
function buildWorkerTask(pathway, level, evidenceItem, parentOutput) {
  const levelDef = pathway.levels.find(l => l.depth === level);
  return {
    purpose: interpolate(levelDef.task.purpose, { evidence: evidenceItem, parent: parentOutput }),
    keyTasks: levelDef.task.keyTasks.map(t => interpolate(t, { evidence: evidenceItem, parent: parentOutput })),
    endState: interpolate(levelDef.task.endState, { evidence: evidenceItem }),
    requiredOutputSchema: levelDef.requiredOutputs
  };
}
```

4. **Output validation**: Each worker's output is validated against the level's `requiredOutputs` schema. Missing fields trigger a retry or a gap flag.

5. **Depth limit enforcement**: The pipeline enforces the 4-level maximum. No pathway can spawn beyond depth 4.

6. **Timeout**: Each level has a per-worker timeout (default: 15 minutes). If a worker times out, the pathway continues with available data and flags the gap.

#### Phase 4: ADJUDICATE (new)

After all investigation pathways complete, the adjudication phase:

1. **Computes confidence scores** for every evidence item using the scoring algorithm (Section 7)
2. **Triggers P-CON (Contrarian Analysis)** for any claim where consensus exceeds 80%
3. **Resolves conflicts** between evidence items that reached different conclusions
4. **Produces the adjudicated evidence record** — a single JSON file per sub-question containing all evidence items with their final confidence ratings

This phase uses a single `review`-template worker per sub-question.

```json
{
  "subQuestionId": "q1",
  "adjudicatedEvidence": [
    {
      "evidenceId": "e1",
      "confidence": "V",
      "confidenceRationale": "Confirmed by 3 independent RCTs, no bias flags, methodology sound",
      "pathwayResults": { "P-SCI": { ... } },
      "flags": [],
      "key finding": "..."
    }
  ],
  "consensusClaims": [
    {
      "claim": "...",
      "consensusLevel": 0.95,
      "contrarianAnalysisTriggered": true,
      "contrarianResult": "consensus confirmed"
    }
  ]
}
```

#### Phase 5: SYNTHESIS (modified)

Mostly unchanged, but now receives adjudicated evidence with confidence ratings instead of raw research + separate verification. The synthesis worker:

- Uses confidence ratings directly (no need to re-evaluate evidence quality)
- Maps confidence levels to graph node `confidence` field
- Includes pathway audit trails in topic citations
- Flags any node built primarily on `U` (unverified) or `D` (disputed) evidence

### New File Structure

```
~/.researchlab/projects/{id}/
  project.json
  plan.json
  evidence/
    manifest-0.json          # Evidence manifest from classify phase
    manifest-1.json
    ...
  investigation/
    P-SCI-e1-L1.json         # Pathway output: P-SCI, evidence e1, level 1
    P-SCI-e1-L2A.json        # Pathway output: P-SCI, evidence e1, level 2A
    P-SCI-e1-L3.json
    P-SCI-e1-L4.json
    P-ORG-e2-L1.json
    ...
  adjudication/
    q1-adjudicated.json      # Adjudicated evidence for sub-question 1
    q2-adjudicated.json
    ...
  graph.json
```

### New Module: `lib/investigation-tree.js`

This new module handles:

1. **Loading pathway definitions** from `pathways/*.json`
2. **Evaluating branch conditions** against worker outputs
3. **Spawning investigation workers** with constructed tasks
4. **Enforcing depth limits and timeouts**
5. **Computing confidence scores**

```javascript
// Sketch of the investigation-tree module API
module.exports = {
  loadPathway(pathwayId),           // Load a pathway definition from JSON
  evaluateCondition(condition, signals), // Evaluate a branch condition
  buildWorkerTask(pathway, level, evidence, parentOutput), // Construct task
  computeConfidence(pathwayResults), // Compute final confidence score
  runPathway(evidence, emitEvent),  // Execute a full pathway for one evidence item
  runInvestigationPhase(manifests, emitEvent) // Orchestrate all pathways
};
```

### Pathway Definition Storage

Pathway definitions are stored as JSON files in a `pathways/` directory at the project root:

```
pathways/
  P-SCI.json
  P-GOV.json
  P-ORG.json
  P-EXP.json
  P-STA.json
  P-FIN.json
  P-DOC.json
  P-MED.json
  P-HIS.json
  P-TES.json
  P-TEC.json
  P-CON.json
  schema.json          # The JSON Schema from Section 5
```

This allows pathway definitions to be versioned, modified, and extended without code changes. New evidence types and pathways can be added by dropping a new JSON file.

---

## 9. How This Achieves Repeatability

### Source of Inconsistency → Fix

| Current Problem | Cause | Investigation Tree Fix |
|----------------|-------|----------------------|
| Workers investigate different things | Ad-hoc decisions about what to explore | Evidence type triggers a specific pathway; no worker discretion in choosing what to investigate next |
| Investigation depth varies | Workers decide when they've gone "deep enough" | Depth is determined by branch conditions, not worker judgment; max 4 levels |
| Evidence quality is assessed inconsistently | No standardized evaluation criteria | Every pathway applies the same structured assessment (RoB 2 for RCTs, ROBINS-I for observational, etc.) |
| Funding/conflict checks are optional | Workers may or may not investigate funding | Funding investigation is a mandatory level in every pathway that involves evidence claims |
| Different confidence assessments | Subjective "how confident are we?" | Deterministic scoring algorithm with explicit rules and modifiers |
| Contrarian perspectives missed | Workers follow confirmation bias | P-CON is automatically triggered when consensus exceeds 80% |
| Some evidence types get deeper investigation | Workers are more thorough on topics they're familiar with | Every evidence type has its own complete pathway of equal rigor |

### Determinism Guarantees

1. **Same evidence type → same pathway**: Evidence classification is based on objective characteristics (Is it a published study? Is it government data? Is it an expert opinion?), not worker interpretation.

2. **Same pathway → same levels executed**: Branch conditions are evaluated against structured output fields with explicit operators. Two workers processing the same evidence through the same pathway will trigger the same branches (given they find the same facts).

3. **Same levels → same confidence score**: The scoring algorithm is a deterministic function of source ratings, corroboration count, bias flags, and methodology assessment.

4. **Remaining variance**: The only remaining variance is in *what evidence a worker finds during each level*. This is inherent in research (search results vary, some sources are behind paywalls, etc.). The investigation tree minimizes this by:
   - Specifying exactly what to look for at each level
   - Requiring structured outputs that make gaps visible
   - Using the scoring algorithm to correctly propagate uncertainty from missing information

### Estimated Repeatability Improvement

- **Current system**: Two independent runs produce ~40-60% overlap in findings and significantly different confidence assessments
- **With investigation trees**: Two independent runs should produce ~85-95% overlap in *structure* (same pathways executed, same levels reached) and consistent confidence ratings (within one level for any given claim)

---

## 10. Implementation Roadmap

### Phase 1: Foundation (required before anything else)

1. Create `lib/investigation-tree.js` module with:
   - Pathway loader (reads JSON definitions from `pathways/`)
   - Condition evaluator
   - Worker task builder (interpolates templates with evidence data)
   - Confidence scorer

2. Create `pathways/` directory with JSON definitions for all 12 pathways

3. Create `pathways/schema.json` with the JSON Schema from Section 5

### Phase 2: Pipeline Modification

4. Add new `phaseClassify()` function to `lib/pipeline.js`:
   - Spawns research workers with classification-focused task descriptions
   - Produces evidence manifests

5. Add new `phaseInvestigate()` function to `lib/pipeline.js`:
   - Reads evidence manifests
   - Calls `investigation-tree.runInvestigationPhase()`
   - Manages parallel pathway execution
   - Enforces global timeouts

6. Add new `phaseAdjudicate()` function to `lib/pipeline.js`:
   - Reads all investigation outputs
   - Computes confidence scores
   - Triggers P-CON where needed
   - Produces adjudicated evidence records

7. Modify `phaseSynthesis()` to consume adjudicated evidence instead of raw research + verification

### Phase 3: Integration

8. Update `start()` function in `lib/pipeline.js`:
   ```
   plan → classify → investigate → adjudicate → synthesize
   ```

9. Update SSE events to include investigation-tree progress:
   - `pathway_started`, `pathway_level`, `pathway_branch`, `pathway_complete`
   - `confidence_computed`

10. Update `graph-builder.js` to:
    - Add `investigationPathway` field to nodes
    - Add `confidenceRationale` to node metadata

### Phase 4: Validation

11. Run the same topic through the pipeline twice independently
12. Compare structural overlap and confidence consistency
13. Iterate on pathway definitions based on results

### Estimated Complexity

| Component | New/Modified | Estimated Lines | Effort |
|-----------|-------------|-----------------|--------|
| `lib/investigation-tree.js` | New | ~400 | Medium |
| `pathways/*.json` (12 files) | New | ~200 each, ~2400 total | Medium |
| `lib/pipeline.js` modifications | Modified | ~300 new | Medium |
| `lib/graph-builder.js` updates | Modified | ~30 | Small |
| SSE event additions | Modified (server.js) | ~20 | Small |

---

## Appendix A: Full Branch Condition Evaluation Spec

Branch conditions are evaluated using this logic:

```javascript
function evaluateCondition(condition, signals) {
  const value = signals[condition.field];

  switch (condition.operator) {
    case 'equals':      return value === condition.value;
    case 'notEquals':   return value !== condition.value;
    case 'contains':    return String(value).includes(condition.value);
    case 'greaterThan': return Number(value) > Number(condition.value);
    case 'lessThan':    return Number(value) < Number(condition.value);
    case 'in':          return Array.isArray(condition.value) && condition.value.includes(value);
    case 'exists':      return value !== undefined && value !== null;
    case 'notExists':   return value === undefined || value === null;
    default:            return false;
  }
}
```

## Appendix B: Evidence Type Classification Decision Tree

Workers use this tree to classify evidence. It must be followed exactly to ensure consistent classification:

```
Is it a published research study (journal article, preprint, thesis)?
├── YES → SCI
└── NO →
    Is it data from a government agency or regulatory body?
    ├── YES → GOV
    └── NO →
        Is it a claim made by an organization (company, NGO, institution)?
        ├── YES → Is the claim primarily about a product's specs or ingredients?
        │   ├── YES → TEC
        │   └── NO → ORG
        └── NO →
            Is it a statement by a named expert citing their expertise?
            ├── YES → EXP
            └── NO →
                Is it primarily a specific number, percentage, or statistic?
                ├── YES → STA
                └── NO →
                    Does it involve money, funding, or financial relationships?
                    ├── YES → FIN
                    └── NO →
                        Is it a primary document (legal filing, contract, memo, patent)?
                        ├── YES → DOC
                        └── NO →
                            Is it a news/media report?
                            ├── YES → MED
                            └── NO →
                                Is it a claim about historical events?
                                ├── YES → HIS
                                └── NO →
                                    Is it a personal account, testimonial, or review?
                                    ├── YES → TES
                                    └── NO → Default to MED
```

## Appendix C: Worker Task Template Example

Here is a complete example of a constructed worker task for P-SCI, Level 3 (Funding Investigation):

```
PURPOSE: Investigate who funded the study "{parentOutput.findings.studyTitle}"
({parentOutput.findings.doi}) and whether the funding source has financial
interests that could bias the results. This matters because industry-funded
studies show a systematic pattern of favorable outcomes.

KEY TASKS:
1. Identify the funding source(s) from the paper's disclosure section. If no
   disclosure section exists, search for the corresponding author's grants
   and industry relationships.
2. For each funder: determine if they are independent (government grant agency,
   private foundation with no commercial interest), industry (company that
   sells a product related to the study), or undisclosed.
3. For industry funders: search for other studies they have funded. Check if
   there is a pattern of results favoring their products.
4. Check author financial disclosures. Search "Dollars for Docs" (Open Payments
   database) for U.S.-based authors. For non-U.S. authors, check the journal's
   conflict of interest disclosures.
5. Write findings as JSON to: {outputPath}

OUTPUT FORMAT:
{
  "pathwayId": "P-SCI",
  "depth": 3,
  "evidenceFound": true,
  "sourceRating": "B",
  "infoRating": "2",
  "findings": {
    "fundingSource": "Company X / NIH Grant R01-... / Not disclosed",
    "funderType": "industry / independent / government / undisclosed",
    "conflictsFound": true/false,
    "authorDisclosures": "summary...",
    "fundingBiasPattern": "description if found..."
  },
  "branchSignals": {
    "funderType": "industry",
    "conflictsFound": true,
    "fundingBiasPattern": "found"
  },
  "citations": [...]
}

END STATE: Output JSON exists with complete funding investigation. Every funder
identified, funder type classified, and conflicts documented.
```
