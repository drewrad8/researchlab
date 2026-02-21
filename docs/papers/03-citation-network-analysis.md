# Citation Network Analysis and Bibliometric Methods for Source Reliability Assessment

**Research Paper 03** | February 2026
**Purpose**: Inform improvements to the researchlab source-level assessment by surveying bibliometric indicators, citation network analysis, citation manipulation detection, predatory journal identification, retraction tracking, and automated source reliability scoring.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Bibliometric Indicators](#2-bibliometric-indicators)
3. [Citation Network Analysis Methods](#3-citation-network-analysis-methods)
4. [Citation Manipulation Detection](#4-citation-manipulation-detection)
5. [Predatory Journal Detection](#5-predatory-journal-detection)
6. [Retraction Tracking](#6-retraction-tracking)
7. [Source Reliability Scoring APIs](#7-source-reliability-scoring-apis)
8. [Current Researchlab Gap Analysis](#8-current-researchlab-gap-analysis)
9. [Recommendations for Researchlab](#9-recommendations-for-researchlab)
10. [Sources](#10-sources)

---

## 1. Executive Summary

Researchlab's current pipeline performs claim-level verification through investigation pathways (P-SCI, P-GOV, P-ORG, etc.) but lacks systematic **source-level assessment**. The P-SCI pathway (Level 1) checks retraction status and records journal impact factor, but this is ad-hoc rather than systematic — there is no structured bibliometric evaluation, no citation network analysis to identify seminal vs. peripheral works, no automated detection of citation manipulation, and no programmatic predatory journal screening.

This report surveys six domains relevant to filling this gap:

1. **Bibliometric indicators** (h-index, Impact Factor, Eigenfactor, CiteScore, SNIP, SJR) — what each measures, their limitations, and which are suitable for automated assessment. **Key finding**: No single indicator is sufficient; field-normalized metrics (SNIP, SJR) are most useful for cross-domain automated assessment.

2. **Citation network analysis** (co-citation, bibliographic coupling, citation bursts, RPYS) — methods for identifying seminal works and emerging trends. **Key finding**: Citation burst detection (Kleinberg's algorithm) and RPYS are the most actionable for automated pipelines because they can flag whether a cited work is seminal, trending, or obscure.

3. **Citation manipulation detection** (cartels, rings, self-citation, coercive citation) — algorithms and heuristics for detecting artificial inflation. **Key finding**: The CIDRE algorithm detects >50% of journals later suspended from JCR. Self-citation ratios above 30-40% are strong red flags. Coercive citation affects ~20% of social science researchers.

4. **Predatory journal detection** (Beall's criteria, DOAJ, Think-Check-Submit) — programmatic classification of journal quality. **Key finding**: A whitelist approach (DOAJ membership + Scopus/WoS indexing) is more reliable than blacklists. Beall's 52 criteria can be partially automated through metadata checks.

5. **Retraction tracking** (Retraction Watch, CrossRef, PubMed) — automatic detection of retracted sources. **Key finding**: The Retraction Watch database is now available via CrossRef REST API (`filter=update-type:retraction`), enabling fully automated retraction checking.

6. **Source reliability scoring** (Semantic Scholar, OpenAlex, Dimensions) — features most predictive of reliability. **Key finding**: OpenAlex and Semantic Scholar provide the most comprehensive free APIs. Semantic Scholar's "influential citation count" and "citation velocity" are uniquely useful signals.

**Bottom line**: Researchlab should add a **source-level pre-screening phase** between classification (Phase 2) and investigation (Phase 3) that programmatically checks journal quality, retraction status, citation metrics, and manipulation indicators using free APIs (OpenAlex, Semantic Scholar, CrossRef). This would catch problematic sources before expensive investigation pathways run, and would provide structured source metadata that enriches the final knowledge graph.

---

## 2. Bibliometric Indicators

### 2.1 Journal Impact Factor (JIF)

**What it measures**: The ratio of citations received in a given year to citable items published in the previous two years. Produced annually by Clarivate in Journal Citation Reports (JCR).

**Formula**: JIF(2025) = Citations in 2025 to items published in 2023-2024 / Citable items published in 2023-2024

**Strengths**:
- Most widely recognized journal-level metric
- Long historical record (since 1975)
- Simple to understand

**Limitations**:
- **Two-year window is arbitrary** — favors fields with rapid citation turnover (e.g., biomedical) over slow-citing fields (e.g., mathematics)
- **Highly skewed distributions** — a small number of highly cited papers inflate the mean; the median article in a high-IF journal often has far fewer citations than the IF suggests
- **Discipline-dependent** — cannot meaningfully compare across fields (immunology journals routinely have IF>20; mathematics journals rarely exceed IF>5)
- **Manipulable** — editors can inflate IF through coercive citation, editorial self-citation, and strategic article timing
- **Only covers WoS-indexed journals** — excludes many legitimate open-access and regional journals
- **Conflates different document types** — reviews and letters are counted differently as "citable items"

**Suitability for automated assessment**: **Low-moderate**. Useful as one signal among many but unreliable as a sole indicator. Available programmatically only through Clarivate's paid API.

### 2.2 Eigenfactor Score

**What it measures**: The importance of a journal within the citation network, analogous to Google's PageRank. Uses five years of cited content. A citation from a high-Eigenfactor journal counts more than one from a low-Eigenfactor journal. Self-citations are excluded.

**Strengths**:
- Network-aware: accounts for citation source quality, not just quantity
- Self-citation exclusion reduces manipulation
- Five-year window captures slower-citing fields better than JIF
- Freely available at eigenfactor.org

**Limitations**:
- Assigns each journal to a single category, making cross-discipline comparison difficult
- Still based on Web of Science data — same coverage gap as JIF
- Correlates strongly with total article output (larger journals get higher scores), though the Article Influence Score (Eigenfactor/article count) corrects this

**Suitability for automated assessment**: **Moderate**. Free access is a plus. The network-aware scoring is conceptually superior to raw citation counts.

### 2.3 CiteScore

**What it measures**: Scopus-based metric. Citations received in a year to documents published in the previous four years, divided by documents published in those four years. Produced by Elsevier.

**Formula**: CiteScore(2025) = Citations in 2025 to items published in 2022-2025 / Items published 2022-2025

**Strengths**:
- Four-year window captures more citations than JIF's two-year window
- Counts all document types (articles, reviews, letters, editorials) consistently
- Transparent methodology — all data visible in Scopus
- Broader coverage than JIF (Scopus indexes more journals than WoS)

**Limitations**:
- Still susceptible to outlier effects (single highly cited paper can inflate CiteScore)
- Not field-normalized — same cross-discipline comparison problem as JIF
- Scopus coverage, while broader, still excludes many journals

**Suitability for automated assessment**: **Moderate**. Broader coverage than JIF. Available via Scopus API (requires institutional access).

### 2.4 SNIP (Source Normalized Impact per Paper)

**What it measures**: Journal citations per publication relative to the citation potential of its field. Developed by Henk Moed at CWTS Leiden. The normalization accounts for the fact that some fields cite more than others.

**Formula**: SNIP = Journal's raw impact per paper / Citation potential of its field

**Strengths**:
- **Field-normalized** — the most critical advantage for automated cross-domain assessment
- Accounts for database coverage differences across fields
- Accounts for citation speed differences across fields
- Available through CWTS Journal Indicators (free)

**Limitations**:
- Based on Scopus data — same coverage limitations
- The normalization methodology can be opaque
- Less widely recognized than IF, making it harder to calibrate expectations

**Suitability for automated assessment**: **High**. Field normalization makes this the most useful single indicator for a system that evaluates sources across diverse topics. Free availability is a major advantage.

### 2.5 SJR (SCImago Journal Rank)

**What it measures**: Journal prestige based on the PageRank algorithm applied to the Scopus citation network. Like Eigenfactor, a citation from a prestigious journal counts more than one from a less prestigious journal.

**Strengths**:
- Network-aware prestige measure (not just citation counts)
- Penalizes excessive self-citation (self-cites are weighted down)
- Field-normalized — allows meaningful cross-field comparison
- Freely available at scimagojr.com and via their API
- Covers all Scopus-indexed journals

**Limitations**:
- Algorithm is more complex than simple ratios, making interpretation harder
- The three-year citation window may still miss slow-citing fields
- Prestige is a lagging indicator — new high-quality journals start with low SJR

**Suitability for automated assessment**: **High**. Combines network awareness with field normalization. Free API access. Together with SNIP, provides the best automated journal quality signal.

### 2.6 h-index (Author-Level)

**What it measures**: An author has h-index h if h of their publications have at least h citations each. Proposed by Jorge Hirsch in 2005.

**Strengths**:
- Captures both productivity and impact in a single number
- Robust against a single highly cited outlier paper
- Simple to compute

**Limitations**:
- **Never decreases** — career h-index only grows, even if recent work is poor
- **Discipline-dependent** — typical h-index varies enormously by field
- **Penalizes early-career researchers** — directly correlates with career length
- **Ignores co-authorship** — a 100-author paper contributes the same as a solo paper
- **Self-citation inflatable** — authors can game it through strategic self-citation
- Variants (h5, hc, m-index) attempt to address time window issues but add complexity

**Suitability for automated assessment**: **Low-moderate** for individual papers. More useful as a rough author credibility signal. Available via Google Scholar Profiles, Scopus, and Semantic Scholar API.

### 2.7 Summary: Recommended Indicators for Automated Use

| Indicator | Level | Field-Normalized | Free API | Manipulation Resistance | Recommended |
|-----------|-------|------------------|----------|------------------------|-------------|
| JIF | Journal | No | No (paid) | Low | No — paid, manipulable |
| Eigenfactor | Journal | Partial | Yes | Moderate | Secondary signal |
| CiteScore | Journal | No | Scopus API | Low-Moderate | Secondary signal |
| SNIP | Journal | **Yes** | Yes (CWTS) | Moderate | **Yes — primary** |
| SJR | Journal | **Yes** | Yes (SCImago) | Moderate-High | **Yes — primary** |
| h-index | Author | No | Yes (S2/OA) | Low | Context only |

**Recommendation for researchlab**: Use SNIP and SJR as primary journal-level indicators. Supplement with Eigenfactor for network analysis. Use h-index only as an author-level contextual signal, not a quality gate.

---

## 3. Citation Network Analysis Methods

### 3.1 Co-Citation Analysis

**What it is**: Two documents are co-cited when they appear together in the reference list of a third document. High co-citation frequency indicates that the research community perceives the two documents as related.

**Method**: Construct a co-citation matrix where cell (i,j) = number of times documents i and j are co-cited. Apply clustering algorithms (e.g., hierarchical clustering, modularity optimization) to identify research fronts and intellectual bases.

**What it reveals**:
- Intellectual structure of a field — which foundational works cluster together
- Research fronts — groups of co-cited works that represent active areas
- Evolution of a field over time — how co-citation clusters shift
- "Invisible colleges" — researcher communities working on related problems

**Strengths**: Dynamic (co-citation patterns change as new papers cite old ones), captures perceived relatedness as judged by the community.

**Limitations**: Biased toward older, well-established works. Cannot identify emerging work that hasn't been co-cited yet. Sensitive to database coverage.

**Tools**: CiteSpace, VOSviewer, CitNetExplorer, bibliometrix (R package).

**Applicability to researchlab**: **Moderate**. Useful for identifying whether a cited source belongs to the intellectual core of a field or is peripheral. Could inform source reliability — core papers co-cited with many other authoritative works are more likely to be reliable.

### 3.2 Bibliographic Coupling

**What it is**: Two documents are bibliographically coupled when they share references in their reference lists. Unlike co-citation (which is retrospective), bibliographic coupling is forward-looking — it identifies documents working on similar problems based on what they cite.

**Method**: Construct a coupling matrix where cell (i,j) = number of shared references between documents i and j. Cluster to find topical communities.

**Key difference from co-citation**: Bibliographic coupling is fixed at publication time (a paper's reference list doesn't change), while co-citation is dynamic (new papers change co-citation patterns). Research by Kleminski et al. (2022) found that bibliographic coupling captures more unique information than either direct citation or co-citation for topic identification.

**Applicability to researchlab**: **Moderate**. Could help identify whether a source is part of a coherent research cluster or is an isolated outlier with no bibliographic connections to established work.

### 3.3 Citation Burst Detection (Kleinberg's Algorithm)

**What it is**: An algorithm that detects sudden increases in citation frequency for a particular work or term over time. Originally proposed by Jon Kleinberg (2002) for detecting bursts in text streams, adapted for bibliometric use.

**Method**: Models citation activity as a probabilistic automaton with two states (baseline and burst). Transitions between states are penalized, so a burst is detected only when the citation rate significantly exceeds the baseline for a sustained period. The algorithm produces burst intervals: start year, end year, and burst strength.

**What it reveals**:
- **Seminal works receiving renewed attention** — old papers that experience citation bursts may be gaining new relevance
- **Emerging research fronts** — terms or papers that burst indicate hot topics
- **Transient patterns** — topics that briefly surge and then fade
- **Paradigm shifts** — sudden changes in what the community cites

**Implementation**: CiteSpace implements Kleinberg's algorithm. The key parameters are: γ (cost ratio controlling burst sensitivity) and minimum burst duration.

**Applicability to researchlab**: **High**. Citation burst detection could be used to:
1. Flag sources that cite "hot" papers — indicating recency and relevance
2. Identify whether a cited study is currently in a burst period (high relevance) vs. historical baseline
3. Detect emerging trends that the knowledge graph should capture
4. Weight evidence from burst-period papers differently in confidence scoring

### 3.4 Reference Publication Year Spectroscopy (RPYS)

**What it is**: A method to identify the historical roots and seminal papers of a research field by analyzing the distribution of reference publication years across a corpus. Proposed by Marx, Bornmann, Barth, and Leydesdorff (2014).

**Method**:
1. Collect all references from a publication set (e.g., all papers on a given topic)
2. Count how many references were published in each year
3. Plot the frequency distribution across publication years
4. Calculate deviations from a five-year median
5. Peaks (positive deviations) identify years with seminal publications; the specific papers from those years that are most frequently cited are the seminal works

**What it reveals**:
- Foundational works in a field — the specific papers that established key concepts
- Historical roots — when and where a field originated
- Paradigm shifts — years where citation patterns change dramatically
- Underappreciated but important contributions that appear as smaller peaks

**Software**: CRExplorer is specifically designed for RPYS analysis.

**Applicability to researchlab**: **Moderate-High**. When evaluating a body of evidence on a topic, RPYS could identify which cited works are genuinely foundational vs. peripheral. A source that cites recognized seminal works demonstrates awareness of the field's foundations, which is a positive reliability signal.

### 3.5 Summary: Network Methods for Researchlab

| Method | What It Detects | Computation Cost | Data Requirements | Priority |
|--------|----------------|-----------------|-------------------|----------|
| Co-citation | Intellectual structure | High | Full citation graph | Low — too expensive for per-query use |
| Bibliographic coupling | Topical clusters | High | Full reference lists | Low — same issue |
| Citation burst | Hot topics, seminal works | Moderate | Time-series citation data | **High** — actionable per-source |
| RPYS | Foundational works | Moderate | Reference year distribution | **Moderate** — useful for topic-level assessment |

**Recommendation**: Implement citation burst detection as a per-source signal (is this paper in a citation burst? Is this a historical baseline paper?). Use RPYS at the topic level during planning to identify which works the evidence should reference.

---

## 4. Citation Manipulation Detection

### 4.1 Types of Citation Manipulation

#### 4.1.1 Excessive Self-Citation

**What it is**: Authors or journals citing their own prior work at rates significantly above field norms, primarily to inflate h-index or Impact Factor.

**Scale**: Since 2007, Thomson Reuters (now Clarivate) has suspended 227 journals from JCR due to excessive citations. Of these, 173 (76%) were suspended due to excessive self-citation.

**Heuristics for detection**:
- **Journal self-citation rate > 30%**: Strong red flag. Normal self-citation rates vary by field but typically range 5-20%
- **Author self-citation rate**: More than 40% self-citation in reference lists is anomalous in most fields
- **Self-citation trend**: Increasing self-citation over time suggests strategic behavior
- **Self-citation concentration**: Self-citations concentrated in a small number of citing articles (e.g., reviews or editorials) rather than distributed across many papers

#### 4.1.2 Citation Cartels / Citation Rings

**What it is**: Groups of journals that systematically cite each other at rates far exceeding what would be expected from their topical overlap. Journal A disproportionately cites Journal B, which disproportionately cites Journal C, which disproportionately cites Journal A.

**Detection algorithms**:

**CIDRE (Citation Interaction-Driven Retraction Estimator)**: Developed by researchers at The Alan Turing Institute. Detects anomalous groups of journals that exchange citations at excessively high rates compared to a null model that accounts for:
- Scientific community structure (journals in the same field naturally cite each other)
- Journal size (larger journals naturally receive and make more citations)

CIDRE detects more than 50% of journals subsequently suspended from JCR due to anomalous citation behavior, often detecting them in the year of suspension or in advance.

**ACTION Framework**: Detects anomalous citations in heterogeneous academic networks using non-negative matrix factorization and network representation learning. Considers relevance of citation content alongside relationships among journals, papers, and authors.

**Graph-based approaches**: Mining citation networks for cliques and cartel-like patterns using community detection algorithms. Anomalous inter-community citation rates signal potential manipulation.

#### 4.1.3 Citation Stacking

**What it is**: A variant of citation cartels where a journal inflates another journal's metrics through concentrated citations in a small number of articles (typically review articles or editorials). One or two articles in Journal A cite Journal B dozens of times, producing the same IF boost as many distributed citations.

**Detection heuristic**: Flag journal pairs where >15% of the target journal's citations come from a single source journal, AND those citations are concentrated in <5% of the source journal's articles.

#### 4.1.4 Coercive Citation

**What it is**: Editors or reviewers requiring authors to add citations to specific journals (usually the editor's own journal) as a condition of publication, without scholarly justification.

**Prevalence**: Approximately 20% of researchers in economics, sociology, psychology, and business disciplines have experienced coercive citation. Business journals coerce more frequently than economics journals. More highly ranked journals are more likely to coerce, and younger researchers are targeted more frequently.

**Detection signals**:
- Sudden jumps in a journal's citation count from a small number of citing articles
- High proportion of citations to the journal appearing in the final (post-review) version of papers but not in the submitted version
- Disproportionate citation concentration from articles in the same journal (internal coercion)
- Reviewer/editor demands for citations that lack topical justification

**Programmatic detection**: Difficult to detect programmatically from metadata alone. Best addressed through:
- Monitoring for unusual citation pattern changes around editorial board changes
- Tracking journal self-citation ratio trends over time
- Cross-referencing with COPE (Committee on Publication Ethics) reports

#### 4.1.5 Citation Mills

**What it is**: A recent and growing form of manipulation where citation-boosting services offer to insert citations to target papers into manuscripts they help produce, often through pre-print servers. This industrializes citation manipulation beyond individual journal-level gaming.

### 4.2 Automated Detection Heuristics for Researchlab

Based on the literature, the following heuristics can be implemented with metadata available from free APIs:

| Signal | Threshold | Data Source | Confidence Impact |
|--------|-----------|-------------|-------------------|
| Journal self-citation ratio | > 30% | OpenAlex source entity | Downgrade one level |
| Author self-citation ratio | > 40% | Semantic Scholar author entity | Flag for review |
| Journal suspended from JCR | Any suspension | Clarivate (manual list) | Downgrade to DISPUTED |
| Citation concentration | > 15% from single source | OpenAlex cited_by data | Flag for review |
| Reciprocal citation anomaly | Bidirectional excess | OpenAlex source-to-source | Flag for review |
| IF anomaly (year-over-year jump) | > 50% increase in one year | Historical IF data | Flag for review |

---

## 5. Predatory Journal Detection

### 5.1 Beall's Criteria

Jeffrey Beall developed 52 criteria for identifying predatory publishers and journals, organized into several categories:

**Editor and Staff Criteria**:
- No named editor or editorial board
- Editor has no academic affiliation or credentials in the journal's field
- Fake or non-existent editorial board members
- Same person listed as editor across multiple unrelated journals

**Business Practice Criteria**:
- Aggressive solicitation emails with flattery and urgency
- No or very low article processing charges (or hidden fees revealed after acceptance)
- Extremely rapid peer review (days rather than weeks/months)
- No retraction policy or mechanism
- No clear description of the peer review process
- Journal name designed to be confused with a prestigious journal (e.g., "International Journal of..." with no established reputation)

**Integrity and Quality Criteria**:
- Articles contain plagiarized content
- No digital preservation (no LOCKSS, CLOCKSS, or Portico archiving)
- No ISSN or fake ISSN
- False or misleading claims of indexing (claiming to be in PubMed, WoS, or Scopus when not actually indexed)
- Fake or inflated impact factor claims (using non-standard IF providers)

### 5.2 Programmatic Classification Features

Based on Beall's criteria and subsequent research, the following features can be checked programmatically:

**Checkable via APIs**:

| Feature | Check Method | API Source |
|---------|-------------|------------|
| DOAJ membership | Query DOAJ API | DOAJ REST API (free) |
| Scopus indexing | Check source entity | Scopus/OpenAlex |
| Web of Science indexing | Check JCR list | Clarivate (paid) / manual list |
| PubMed/MEDLINE indexing | Check NLM catalog | PubMed E-utilities (free) |
| ISSN validity | Validate against ISSN portal | ISSN API |
| CrossRef DOI registration | Check DOI prefix | CrossRef API (free) |
| Digital preservation | Check LOCKSS/CLOCKSS/Portico | Keepers Registry API |
| Publisher COPE membership | Check COPE directory | COPE website (scrape) |

**Checkable via metadata analysis**:

| Feature | Heuristic | Threshold |
|---------|-----------|-----------|
| Review speed | Time from submission to acceptance | < 14 days = red flag |
| Editorial board size | Named board members | < 5 = red flag |
| Article volume anomaly | Sudden large increase in published articles | > 3x year-over-year = flag |
| Geographic concentration | All authors from one country/institution | > 90% = flag |

### 5.3 Whitelist vs. Blacklist Approach

**Blacklist approach** (Beall's List, Cabell's Predatory Reports):
- *Pro*: Identifies known bad actors
- *Con*: Incomplete — new predatory journals appear constantly; subjective criteria; legal risks (Beall's original list was taken down due to threats); false positives harm legitimate new journals

**Whitelist approach** (DOAJ, Scopus, WoS indexing):
- *Pro*: More reliable — inclusion requires meeting quality criteria; harder to game
- *Con*: Excludes legitimate journals that haven't applied for indexing; slow to include new journals; DOAJ only covers open access

**Recommended approach for researchlab**: **Whitelist-primary with blacklist supplementation**.

1. **Tier A** — Journal is in DOAJ AND Scopus AND PubMed/MEDLINE: High confidence in legitimacy
2. **Tier B** — Journal is in at least one of DOAJ, Scopus, WoS: Moderate confidence
3. **Tier C** — Journal is not in any major index but has valid ISSN, CrossRef DOIs, and COPE membership: Low confidence, flag for manual review
4. **Tier D** — Journal fails multiple whitelist checks: Predatory risk, downgrade source rating

### 5.4 Think-Check-Submit

Think-Check-Submit is a campaign (thinkchecksubmit.org) that provides a checklist for researchers to evaluate journals. While designed for human use, its criteria can inform programmatic checks:

1. Do you or your colleagues know the journal? (Not automatable)
2. Can you easily identify and contact the publisher? (Check: publisher has valid contact info in CrossRef)
3. Is the journal clear about the type of peer review it uses? (Check: journal metadata includes peer review policy)
4. Are articles indexed in services that you use? (Automatable: check DOAJ, Scopus, PubMed)
5. Is it clear what fees will be charged? (Partially automatable: check DOAJ APC data)
6. Do you recognize the editorial board? (Partially automatable: check if board members have Scopus/ORCID profiles)

---

## 6. Retraction Tracking

### 6.1 Retraction Watch Database

The Retraction Watch database, maintained by the Center for Scientific Integrity and now hosted by CrossRef, is the most comprehensive resource for tracking retractions. As of 2025, it contains over 47,000 retraction notices and related post-publication changes.

**Data fields include**:
- Record ID (internal Retraction Watch identifier)
- Title of retracted/corrected work
- DOI and PMID (where available)
- Journal and publisher
- Retraction date
- Reason for retraction (categorized: data fabrication, plagiarism, authorship issues, etc.)
- Original paper date
- Country of origin

### 6.2 Programmatic Access Methods

#### 6.2.1 CrossRef REST API

Since 2023, the Retraction Watch data is available directly through CrossRef's REST API:

```
# Get all retractions
GET https://api.crossref.org/v1/works?filter=update-type:retraction

# Check a specific DOI for retraction
GET https://api.crossref.org/v1/works/{doi}
# Check the "update-to" field in the response
```

The `update-to` field in CrossRef work metadata indicates whether a paper has been retracted, corrected, or withdrawn. The `type` field distinguishes retractions from corrections and expressions of concern.

#### 6.2.2 Retraction Watch CSV Dataset

The full database is available as a CSV file, updated daily:

```bash
git clone https://gitlab.com/crossref/retraction-watch-data
```

This enables local batch checking — load the CSV, index by DOI, and check any paper's retraction status in O(1).

#### 6.2.3 PubMed Retraction Flags

PubMed flags retracted articles with the publication type "Retracted Publication" and links retraction notices with publication type "Retraction of Publication". The E-utilities API can query these:

```
# Search for retracted publications
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=retracted+publication[pt]

# Check a specific PMID
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id={pmid}&rettype=xml
# Check for <CommentsCorrections RefType="RetractionIn">
```

### 6.3 Implementation for Researchlab

The current P-SCI pathway (Level 1, "Locate Original Study") includes retraction checking as a manual task for the worker. This should be supplemented with **automated pre-checks**:

```
Pre-check sequence (before spawning investigation workers):
1. If DOI available → query CrossRef API for update-type:retraction
2. If PMID available → query PubMed for retraction publication type
3. If neither → check title against Retraction Watch CSV (fuzzy match)
4. If retracted → immediately set confidence to "R" (RETRACTED), skip investigation
```

**Time savings**: A retraction pre-check via CrossRef API takes ~200ms. Running a full P-SCI investigation pathway (4 levels, ~15 min each) on a retracted paper wastes ~60 minutes of worker time. Pre-checking would prevent this.

### 6.4 Retraction Reasons and Quality Signals

Not all retractions are equal. The Retraction Watch database categorizes reasons:

| Category | Quality Signal | How to Use |
|----------|---------------|------------|
| Data fabrication/falsification | Severe — author credibility compromised | Flag all papers by same author |
| Plagiarism | Moderate — original work may still be valid | Check original source instead |
| Authorship disputes | Low — science may be valid | Note but don't discard |
| Publisher error | Low — not the author's fault | Check if corrected version exists |
| Duplicate publication | Low — same data, published twice | Use the version that wasn't retracted |
| Ethical concerns (no consent, etc.) | Variable — science may be valid but ethically compromised | Note in knowledge graph |

---

## 7. Source Reliability Scoring APIs

### 7.1 Semantic Scholar Academic Graph API

**Coverage**: ~215 million papers from all fields of science.

**Base URL**: `https://api.semanticscholar.org/graph/v1`

**Key fields for reliability assessment**:

| Field | Description | Reliability Signal |
|-------|-------------|-------------------|
| `citationCount` | Total citations received | Raw impact (not normalized) |
| `influentialCitationCount` | Citations where this paper had a significant influence on the citing paper | **High value** — filters out perfunctory citations |
| `citationVelocity` | Weighted average of citations over last 3 years | Trending/declining indicator |
| `tldr` | AI-generated one-sentence summary | Enables automated relevance checking |
| `fieldsOfStudy` | ML-classified fields | Enables field normalization |
| `publicationTypes` | Article, review, conference, etc. | Study type classification |
| `isOpenAccess` | Whether full text is freely available | Accessibility signal |
| `externalIds` | DOI, PMID, ArXiv, etc. | Cross-reference capability |
| `authors[].hIndex` | Author h-index | Author credibility signal |
| `authors[].paperCount` | Author publication count | Productivity signal |
| `venue` | Journal/conference name | Journal quality lookup |

**Unique value**: The `influentialCitationCount` is uniquely available from Semantic Scholar and is computed using a machine learning model trained to detect when a citation is central to the citing paper's contribution (vs. a passing mention in the introduction). This is far more informative than raw citation count.

**Rate limits**: 1 request/second without API key; 10 requests/second with free API key.

**Example query**:
```
GET https://api.semanticscholar.org/graph/v1/paper/DOI:{doi}?fields=title,citationCount,influentialCitationCount,citationVelocity,fieldsOfStudy,publicationTypes,isOpenAccess,authors.hIndex
```

### 7.2 OpenAlex API

**Coverage**: ~250 million works, 100K+ sources, 300M+ authors. Incorporates Microsoft Academic Graph data.

**Base URL**: `https://api.openalex.org`

**Key entities for reliability assessment**:

**Works entity** (`/works/{id}`):
| Field | Description | Reliability Signal |
|-------|-------------|-------------------|
| `cited_by_count` | Total citation count | Raw impact |
| `counts_by_year` | Annual citation breakdown | Citation trajectory |
| `referenced_works` | Outgoing citations | Bibliographic coupling input |
| `referenced_works_count` | Number of references | Scholarship depth |
| `concepts` | Topic classifications with scores | Field identification |
| `primary_location.source` | Publication venue | Journal quality lookup |
| `open_access` | OA status and URL | Accessibility |
| `authorships[].institutions` | Author affiliations | Institutional credibility |

**Sources entity** (`/sources/{id}`):
| Field | Description | Reliability Signal |
|-------|-------------|-------------------|
| `cited_by_count` | Total journal citations | Journal impact |
| `works_count` | Total works published | Journal size |
| `is_in_doaj` | DOAJ membership | Predatory journal check |
| `host_organization` | Publisher | Publisher reputation |
| `type` | journal, repository, conference | Venue type |
| `summary_stats.2yr_mean_citedness` | Mean citations per paper (2yr) | IF analog |
| `summary_stats.h_index` | Journal h-index | Journal quality |

**Rate limits**: Free API key provides $1/day budget; roughly 100K requests/day for simple queries.

**Unique value**: OpenAlex's `is_in_doaj` field enables one-call predatory journal pre-screening. The `sources` entity aggregates journal-level metrics that would otherwise require separate API calls. The `counts_by_year` field on works enables citation trajectory analysis.

### 7.3 CrossRef API

**Coverage**: ~150 million DOI-registered works.

**Base URL**: `https://api.crossref.org/v1`

**Key fields for reliability assessment**:

| Field | Description | Reliability Signal |
|-------|-------------|-------------------|
| `is-referenced-by-count` | Citation count | Raw impact |
| `references-count` | Number of references made | Scholarship depth |
| `update-to` | Corrections/retractions | **Critical** — retraction detection |
| `container-title` | Journal name | Journal lookup |
| `ISSN` | Journal ISSN | ISSN validation |
| `publisher` | Publisher name | Publisher validation |
| `funder` | Funding information | Funding bias detection |
| `license` | License information | Open access status |
| `member` | CrossRef member ID | Publisher registration |

**Unique value**: CrossRef is the authoritative source for DOI-registered metadata and the Retraction Watch database. The `funder` field enables automated funding bias detection (links to the Funder Registry).

### 7.4 Dimensions API

**Coverage**: ~140 million publications.

**Key additions over other APIs**:
- Patent citations (not just scholarly citations)
- Clinical trial linkages
- Policy document citations
- Grant-to-publication linkages
- Altmetric scores integration

**Limitations**: Free API has restricted access; full access requires institutional subscription.

### 7.5 Composite Reliability Score

Based on the available API data, a composite source reliability score can be constructed:

```
Source Reliability Score = weighted combination of:

  Journal Quality (40%):
    - SJR percentile in field (via SCImago or OpenAlex)
    - DOAJ membership (binary)
    - Scopus/WoS indexing (binary)
    - Self-citation ratio (negative signal)

  Paper Impact (30%):
    - Influential citation count (Semantic Scholar)
    - Citation velocity (Semantic Scholar)
    - Citation trajectory (OpenAlex counts_by_year — increasing vs. declining)

  Author Credibility (15%):
    - Author h-index (Semantic Scholar)
    - Institutional affiliation quality (OpenAlex)
    - Number of co-authors on the paper (context)

  Integrity Checks (15%):
    - Retraction status (CrossRef/Retraction Watch — binary)
    - Corrections/errata (CrossRef — flag)
    - Funding conflicts (CrossRef funder data)
    - Predatory journal indicators (DOAJ + heuristics)
```

This score would map to the existing source rating scale:
- **A (Established)**: Score ≥ 0.8 — Top-tier journal, high influential citations, no integrity flags
- **B (Generally Reliable)**: Score 0.6-0.8 — Good journal, moderate citations, no integrity flags
- **C (Mixed Record)**: Score 0.4-0.6 — Average journal or citation concerns or minor flags
- **D (Questionable)**: Score 0.2-0.4 — Poor journal metrics or integrity flags
- **E (Unreliable)**: Score < 0.2 — Predatory journal or retracted or severe manipulation indicators
- **F (Unknown)**: Insufficient metadata for scoring

---

## 8. Current Researchlab Gap Analysis

### 8.1 What Exists

The current pipeline has several source-assessment elements, but they are fragmented and incomplete:

**Phase 2 (Classify)**: Workers assign `sourceRating` (A-F) and `infoRating` (1-6) to evidence items, but this is based on the worker's subjective assessment during broad research. There are no structured criteria or automated checks guiding this assignment.

**Phase 3 (Investigate) — P-SCI Level 1 ("Locate Original Study")**: The investigation pathway instructs workers to:
- Find the original paper and extract metadata (DOI, PMID, journal, sample size)
- Check retraction status via Retraction Watch and PubMed
- Record journal impact factor
- Check predatory journal lists

This is the closest the pipeline comes to source-level assessment, but it has critical limitations:
1. It only applies to scientific evidence (P-SCI) — other evidence types (P-GOV, P-ORG, P-MED, etc.) have no equivalent source-level checks
2. It relies on the worker finding and correctly interpreting this information — no automated verification
3. It runs after classification, meaning a retracted paper still triggers a full investigation pathway before being caught
4. Impact factor is the only bibliometric indicator checked — no field normalization, no citation network analysis

**Phase 3 (Investigate) — P-SCI Level 3 ("Funding and COI Investigation")**: Checks funding sources and author conflicts, but again only for scientific evidence and only as a manual worker task.

**Phase 4 (Adjudicate)**: Uses `computeConfidence()` to score evidence, which checks for retraction, contradictory evidence, source ratings, independent confirmations, and bias flags. This is claim-level, not source-level.

### 8.2 What's Missing

| Capability | Current State | Gap |
|-----------|--------------|-----|
| Automated retraction checking | Manual worker task in P-SCI L1 | No automated pre-check; wastes investigation time on retracted papers |
| Journal quality assessment | Manual IF check in P-SCI L1 | No field-normalized metrics; no predatory journal screening |
| Citation network position | Not assessed | No way to distinguish seminal vs. peripheral sources |
| Citation manipulation detection | Not assessed | No checks for self-citation inflation, citation cartels |
| Author credibility scoring | Not assessed | h-index, institutional affiliation not checked |
| Predatory journal screening | Manual check in P-SCI L1 | No automated DOAJ/Scopus/WoS whitelist checking |
| Cross-evidence-type source assessment | Only P-SCI has source checks | P-GOV, P-ORG, P-MED, P-EXP, etc. have no source-level assessment |
| Composite source reliability score | Workers assign subjective A-F rating | No structured, reproducible scoring methodology |
| Citation burst detection | Not implemented | No way to identify trending vs. declining sources |

### 8.3 Architectural Observation

The pipeline's 5-phase architecture (plan → classify → investigate → adjudicate → synthesize) has a natural insertion point for source-level assessment: **between Phase 2 (Classify) and Phase 3 (Investigate)**. Evidence items exit classification with metadata (type, description, citations). A "source screening" step could:

1. Extract identifiers (DOI, PMID, URLs) from evidence items
2. Query free APIs (CrossRef, OpenAlex, Semantic Scholar) for source metadata
3. Compute a structured source reliability score
4. Filter out retracted papers immediately
5. Flag predatory journal sources
6. Enrich evidence items with bibliometric metadata before investigation

This would reduce wasted investigation cycles and provide structured source data for confidence scoring.

---

## 9. Recommendations for Researchlab

### 9.1 Add a Source Screening Pre-Check (Priority: High)

Insert automated source screening between Phase 2 (Classify) and Phase 3 (Investigate). For each evidence item with a DOI or PMID:

1. **Retraction check** (CrossRef API `update-type:retraction`): If retracted → immediately set confidence to "R", skip investigation. Estimated savings: prevents ~60 minutes of wasted worker time per retracted paper.

2. **Predatory journal check** (OpenAlex `is_in_doaj`, plus ISSN validation): Classify into Tiers A-D as described in Section 5.3. Tier D sources get downgraded source rating.

3. **Basic bibliometrics** (Semantic Scholar `influentialCitationCount`, `citationVelocity`): Enrich evidence items with quantitative impact data for use in confidence scoring.

This pre-check would be a Node.js function (no worker spawn needed), making ~3-5 API calls per evidence item. At ~200ms per call, screening 20 evidence items would take ~15-20 seconds — negligible compared to investigation pathway time.

### 9.2 Extend Source Assessment Beyond P-SCI (Priority: High)

Currently only scientific evidence gets source-level checks. Create equivalent source assessment for other evidence types:

- **P-GOV**: Check if the government source is a primary agency vs. a secondary report. Cross-reference with official government domain registries.
- **P-ORG**: Check organization credibility via cross-referencing with registered NGO/institution databases and checking for conflicts of interest.
- **P-MED**: Check media source reliability via known media bias/reliability databases (Ad Fontes Media Bias Chart, NewsGuard ratings if available).
- **P-EXP**: Check expert credibility via h-index, institutional affiliation, number of publications in the relevant field.

### 9.3 Implement Composite Source Reliability Scoring (Priority: Medium)

Replace the current subjective A-F source rating with a structured, reproducible scoring methodology as described in Section 7.5. The score should be computed from API data and stored as structured metadata, making it auditable and reproducible across pipeline runs.

### 9.4 Add Citation Manipulation Flags (Priority: Medium)

Implement the detection heuristics from Section 4.2 as part of source screening:
- Journal self-citation ratio > 30% → flag
- Author self-citation ratio > 40% → flag
- Journal suspended from JCR → downgrade to DISPUTED

These checks use data already available from OpenAlex and Semantic Scholar — no additional API calls needed beyond what recommendation 9.1 already requires.

### 9.5 Integrate Retraction Watch CSV for Batch Processing (Priority: Low-Medium)

For projects with many evidence items, loading the Retraction Watch CSV locally (from the CrossRef git repository) enables O(1) retraction checking without API rate limit concerns. The CSV is ~50MB and updated daily.

### 9.6 Add Citation Burst Detection for Topic-Level Assessment (Priority: Low)

During the planning phase, use citation data to identify which works in the field are currently experiencing citation bursts. This informs sub-question generation and helps workers focus on the most relevant current research.

### 9.7 Enrich Knowledge Graph with Source Metadata (Priority: Low)

Store source-level metadata (bibliometric scores, journal quality tier, manipulation flags) as node properties in graph.json. This enables the frontend to display source credibility information alongside findings.

---

## 10. Sources

### Bibliometric Indicators
- [Springer Nature: Current concepts on bibliometrics](https://link.springer.com/article/10.1007/s11845-018-1936-5) — Comprehensive review of IF, Eigenfactor, CiteScore, SJR, SNIP, h-index
- [University of Northern Colorado: Journal Metrics & Ranking](https://libguides.unco.edu/journalpublicationoutlets/metrics) — Practical guide comparing journal metrics
- [De Montfort University: Bibliometrics LibGuide](https://library.dmu.ac.uk/bibliometrics/metrics) — Overview of metric limitations
- [Durham University: Bibliometric Research Indicators](https://libguides.durham.ac.uk/research_support/evaluate_bibliometrics) — Overview including Eigenfactor limitations

### Citation Network Analysis
- [Kleminski et al. (2022): Analysis of direct citation, co-citation and bibliographic coupling](https://journals.sagepub.com/doi/10.1177/0165551520962775) — Comparison of coupling methods for topic identification
- [CiteSpace: Detecting and Visualizing Emerging Trends (Chen, 2006)](https://onlinelibrary.wiley.com/doi/abs/10.1002/asi.20317) — Foundational paper on CiteSpace and burst detection
- [Marx et al.: RPYS in practice](https://link.springer.com/article/10.1007/s11192-022-04369-8) — Software tutorial for Reference Publication Year Spectroscopy
- [CitNetExplorer](https://www.citnetexplorer.nl/) — Tool for analyzing citation patterns
- [CiteSpace Burst Detection Glossary](https://citespace.podia.com/glossary-burstness) — Explanation of Kleinberg's algorithm in CiteSpace

### Citation Manipulation Detection
- [Detecting anomalous citation groups in journal networks (Nature Scientific Reports, 2021)](https://www.nature.com/articles/s41598-021-93572-3) — CIDRE algorithm
- [The Alan Turing Institute: Revealing citation cartels](https://www.turing.ac.uk/research/research-projects/revealing-citation-cartels-network-data) — Research project on cartel detection
- [Anomalous citations detection in academic networks (Springer, 2023)](https://link.springer.com/article/10.1007/s10462-023-10655-5) — ACTION framework survey
- [Citation manipulation through citation mills (Nature Scientific Reports, 2025)](https://www.nature.com/articles/s41598-025-88709-7) — Citation mill phenomenon
- [Coercive citation classification method (ScienceDirect)](https://www.sciencedirect.com/science/article/abs/pii/S1751157713000898) — Logistic regression detection model
- [Wikipedia: Coercive citation](https://en.wikipedia.org/wiki/Coercive_citation) — Overview and prevalence data
- [COPE: Citation Manipulation](https://publicationethics.org/topic-discussions/citation-manipulation) — Committee on Publication Ethics guidelines

### Predatory Journal Detection
- [Beall's List: How to recognize predatory journals](https://beallslist.net/how-to-recognize-predatory-journals/) — Current Beall's criteria
- [Blacklists and Whitelists to Tackle Predatory Publishing (mBio, 2019)](https://journals.asm.org/doi/pdf/10.1128/mbio.00411-19) — Comparison of approaches
- [PMC: Predatory Journals — What They Are and How to Avoid Them](https://pmc.ncbi.nlm.nih.gov/articles/PMC7237319/) — Detection criteria overview
- [PMC: Distinguishing Predatory from Reputable Publishing Practices](https://pmc.ncbi.nlm.nih.gov/articles/PMC10391221/) — Feature-based classification

### Retraction Tracking
- [CrossRef: Retraction Watch Documentation](https://www.crossref.org/documentation/retrieve-metadata/retraction-watch/) — API integration guide
- [CrossRef Blog: Retraction Watch retractions in the API](https://www.crossref.org/blog/retraction-watch-retractions-now-in-the-crossref-api/) — Announcement and usage
- [CrossRef GitLab: Retraction Watch Data](https://gitlab.com/crossref/retraction-watch-data) — CSV dataset repository
- [Retraction Watch Database User Guide](https://retractionwatch.com/retraction-watch-database-user-guide/) — Field descriptions and coverage

### Source Reliability APIs
- [Semantic Scholar Academic Graph API](https://www.semanticscholar.org/product/api) — API documentation
- [OpenAlex Technical Documentation](https://docs.openalex.org/) — Full API reference
- [OpenAlex Work Object](https://docs.openalex.org/api-entities/works/work-object) — Citation field details
- [OpenAlex Source Object](https://docs.openalex.org/api-entities/sources/source-object) — Journal metadata fields
- [ScienceDirect: New trends in bibliometric APIs (2023)](https://www.sciencedirect.com/science/article/pii/S030645732300122X) — Comparative analysis of APIs
- [ScienceDirect: Coverage assessment of OpenAlex and Semantic Scholar](https://www.sciencedirect.com/science/article/pii/S0895435625001222) — Coverage comparison study

### Codebase References
- `lib/pipeline.js` — 5-phase pipeline architecture (plan → classify → investigate → adjudicate → synthesize)
- `lib/investigation-tree.js` — Investigation pathway execution and confidence scoring
- `lib/sources.js` — Data source registry and matching
- `lib/graph-builder.js` — Knowledge graph schema and validation
- `pathways/P-SCI.json` — Scientific evidence pathway (Level 1 includes retraction/IF checks)
