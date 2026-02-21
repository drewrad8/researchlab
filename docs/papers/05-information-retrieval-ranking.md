# Information Retrieval and Ranking: Optimizing Search Strategies, Source Matching, and Relevance Scoring

**Research Paper 05** | February 2026  
**Purpose**: Inform improvements to researchlab source matching (`lib/sources.js`) and research index search (`lib/research-index.js`) by surveying classical and modern information retrieval methods — from BM25 and language models through dense passage retrieval and hybrid systems, with evaluation metrics and concrete gap analysis.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Classical IR Models](#2-classical-ir-models)
3. [Semantic Retrieval](#3-semantic-retrieval)
4. [Hybrid Retrieval](#4-hybrid-retrieval)
5. [Query Expansion and Rewriting](#5-query-expansion-and-rewriting)
6. [Learning to Rank](#6-learning-to-rank)
7. [IR Evaluation Metrics](#7-ir-evaluation-metrics)
8. [Current Researchlab Source Matching: Gap Analysis](#8-current-researchlab-source-matching-gap-analysis)
9. [Recommendations](#9-recommendations)
10. [Sources](#10-sources)

---

## 1. Executive Summary

Information Retrieval (IR) is the science of matching queries to relevant documents. Researchlab currently uses two IR-adjacent systems: **source matching** (`lib/sources.js`) for selecting relevant data sources for research workers, and **research index search** (`lib/research-index.js`) for finding prior completed research. Both use hand-crafted keyword/tag matching with simple scoring — a pattern that, while functional, leaves significant relevance quality on the table.

This report surveys the IR landscape across six dimensions:

1. **Classical models** (TF-IDF, BM25, language models) that remain the backbone of lexical retrieval
2. **Semantic retrieval** (DPR, ColBERT, SBERT) that captures meaning beyond keyword overlap
3. **Hybrid systems** that combine both via Reciprocal Rank Fusion (RRF) and other fusion methods
4. **Query expansion** techniques that augment sparse queries with related terms
5. **Learning-to-rank** frameworks that optimize multi-feature ranking functions
6. **Evaluation metrics** (nDCG, MAP, MRR) that measure retrieval quality

The key finding is that researchlab's source matching is conceptually a **tag-based Boolean retrieval system with ad-hoc scoring weights** — roughly equivalent to a simplified TF-IDF without term frequency or document length normalization. The research index search is more sophisticated with synonym expansion, bigram matching, and position-weighted scoring, but still lacks the probabilistic foundations of BM25, any form of semantic matching, or the benefit of hybrid retrieval.

The most impactful improvements would be: (1) adopting BM25-style scoring with term frequency saturation and document length normalization, (2) adding lightweight semantic matching via embedding similarity, (3) implementing query expansion using the existing synonym map as a foundation, and (4) using RRF to combine lexical and semantic signals.

---

## 2. Classical IR Models

### 2.1 TF-IDF (Term Frequency–Inverse Document Frequency)

TF-IDF is the foundational term-weighting scheme in IR, introduced by Karen Spärck Jones (1972) and refined by Salton and Buckley (1988). The core insight: a term's importance to a document is proportional to its frequency in that document (TF) and inversely proportional to how common it is across the collection (IDF).

**Formula:**

```
TF-IDF(t, d, D) = TF(t, d) × IDF(t, D)
  where TF(t, d) = count of term t in document d
        IDF(t, D) = log(N / df(t))
        N = total documents, df(t) = documents containing t
```

**Strengths:**
- Simple, interpretable, fast to compute
- Works well for small collections with short documents
- No training data required

**Weaknesses:**
- Linear TF assumption: 100 occurrences scored as 10× more important than 10 occurrences, which rarely reflects true relevance
- No document length normalization: longer documents naturally accumulate more term matches, creating a length bias
- No term frequency saturation: repeated terms inflate scores without bound

### 2.2 BM25 (Best Matching 25 / Okapi BM25)

BM25, developed by Robertson and Walker at City University London in the 1990s as part of the Okapi information retrieval project, is the de facto standard for lexical retrieval. It addresses TF-IDF's limitations with two key innovations: **term frequency saturation** and **document length normalization**.

**Formula:**

```
Score(D, Q) = Σ IDF(qi) × [f(qi, D) × (k1 + 1)] / [f(qi, D) + k1 × (1 - b + b × |D| / avgdl)]
```

Where:
- `qi` = individual query terms
- `f(qi, D)` = frequency of term qi in document D
- `|D|` = document length (number of tokens)
- `avgdl` = average document length across the collection
- `k1` = term frequency saturation parameter (default: 1.2)
- `b` = document length normalization parameter (default: 0.75)

**IDF component (Lucene/Elasticsearch variant):**

```
IDF(qi) = log(1 + (docCount - f(qi) + 0.5) / (f(qi) + 0.5))
```

**Parameter effects:**

| Parameter | Low Value | High Value | Default |
|-----------|-----------|------------|---------|
| `k1` | Earlier TF saturation (diminishing returns kick in faster) | Later saturation (repeated terms continue boosting score) | 1.2 |
| `b` | Less length normalization (b=0 ignores length entirely) | Full length normalization (b=1 maximizes length penalty) | 0.75 |

**Tuning guidance** (from Elastic's practical BM25 series): The defaults of k1=1.2 and b=0.75 work well for most corpora. Common tuning ranges: k1 ∈ [1.2, 2.0], b ∈ [0.5, 0.8]. Research suggests 1.2 < k1 < 2 generally yields good results. Any changes affect all queries, not just the target query, so tuning must be evaluated across the full query workload.

**BM25F** extends BM25 to multi-field documents (e.g., a source with separate name, description, and tags fields), allowing different fields to receive different weights. This is directly relevant to researchlab's source matching, where a match in `name` should arguably weigh more than a match in `tags`.

**Practical performance:** Empirical evaluations consistently show BM25 outperforming TF-IDF — one study found BM25 achieving average precision of 0.75, recall of 0.6, and F1 of 0.67, vs. TF-IDF precision of 0.33 on the same dataset. BM25 is the default scoring algorithm in Elasticsearch (since version 5.0, replacing TF-IDF), Lucene, Whoosh, and most modern search engines.

### 2.3 Language Models for IR

The language modeling approach to IR, introduced by Ponte and Croft (1998), takes a fundamentally different view: instead of scoring query-document similarity, it estimates the probability that a document's language model would generate the query.

**Query Likelihood Model:**

```
P(Q|Md) = Π P(qi|Md)
```

For each document d, build a language model Md, then rank documents by how likely they are to generate the query terms.

**The smoothing problem:** Maximum likelihood estimation assigns zero probability to terms not in a document, which is catastrophic for ranking (a single missing term zeros out the whole score). Two dominant smoothing methods:

**Jelinek-Mercer (linear interpolation):**
```
P(w|d) = λ × P_ml(w|d) + (1 - λ) × P(w|C)
```
Mixes the document's maximum likelihood estimate with the collection-wide probability. λ close to 0 means less smoothing — good for short, keyword queries where document-specific signal is strong.

**Dirichlet prior:**
```
P(w|d) = (f(w,d) + μ × P(w|C)) / (|d| + μ)
```
Adds μ pseudo-counts drawn from the collection distribution. Conceptually, it "adds μ terms to each document distributed according to collection statistics." The μ parameter (commonly 1000–2000) adapts smoothing to document length: short documents get more smoothing, long documents less.

**Trade-offs vs. BM25:** Language models provide a principled probabilistic framework and often perform comparably to BM25. Dirichlet smoothing tends to work slightly better for verbose queries, while BM25 is generally preferred for short keyword queries. In practice, BM25 dominates due to its simplicity and well-understood parameter tuning, while language models see more use in academic settings and as components within larger systems.

---

## 3. Semantic Retrieval

### 3.1 The Vocabulary Mismatch Problem

Classical IR models match exact terms — they cannot recognize that "automobile" and "car" are synonymous, or that "heart attack" relates to "myocardial infarction." This **vocabulary mismatch problem** is the primary motivation for semantic retrieval methods that operate on meaning rather than surface forms.

### 3.2 Dense Passage Retrieval (DPR)

DPR (Karpukhin et al., 2020, Facebook AI) uses two independent BERT encoders — one for queries, one for passages — to produce dense vector representations. Similarity is computed via dot product between the query's [CLS] vector and each passage's [CLS] vector.

**Architecture:**
```
query_vector = BERT_query(query)[CLS]
passage_vector = BERT_passage(passage)[CLS]
similarity = dot_product(query_vector, passage_vector)
```

**Strengths:**
- Captures semantic similarity beyond keyword overlap
- Passage embeddings are pre-computed offline, enabling fast approximate nearest neighbor (ANN) search at query time
- Effective for open-domain question answering where questions are natural language and don't share vocabulary with answers

**Weaknesses:**
- Requires supervised training data (e.g., NaturalQuestions, MS MARCO)
- Single-vector compression loses fine-grained token-level information
- Lower zero-shot robustness on out-of-domain data compared to cross-encoders
- Index size: each passage requires a 768-dimensional float vector (~3KB)

**Performance:** On NaturalQuestions, DPR achieves top-20 accuracy of 79.4% vs. BM25's 59.1% — a dramatic improvement for semantic queries. However, DPR underperforms BM25 on entity-centric or keyword-heavy queries where exact match matters.

### 3.3 Sentence-BERT (SBERT) and Bi-Encoders

SBERT (Reimers & Gurevych, 2019) adapts BERT for producing semantically meaningful sentence embeddings. It uses Siamese/triplet network architectures trained on natural language inference (NLI) and semantic textual similarity (STS) datasets.

**Bi-encoder pattern:**
- Query and document are encoded independently
- Embeddings compared via cosine similarity or dot product
- Documents can be pre-indexed; query encoding happens once at search time
- Scales to millions of documents via FAISS, HNSW, or other ANN indexes

**Key models (2024–2025):** all-MiniLM-L6-v2 (fast, 384-dim), all-mpnet-base-v2 (higher quality, 768-dim), BGE and E5 families, GTE models, Nomic-embed-text.

### 3.4 Cross-Encoders

Cross-encoders process query and document jointly through BERT's full cross-attention mechanism. They concatenate query and document as a single input: `[CLS] query [SEP] document [SEP]`, producing a single relevance score.

**Advantages over bi-encoders:**
- Richer attention-based representations — can model fine-grained query-document interactions
- Higher accuracy, especially on out-of-domain tasks
- Better at handling nuanced relevance judgments

**Disadvantages:**
- Cannot pre-compute document representations — every query-document pair requires a forward pass
- O(N) inference cost per query, making it impractical for large collections
- Typically used as a **re-ranker** on top of a first-stage retriever (bi-encoder or BM25)

**Practical pattern:** Use bi-encoder to retrieve top-100 candidates, then cross-encoder to re-rank into final top-10. This bi-encoder → cross-encoder pipeline is the dominant architecture in production semantic search systems.

### 3.5 ColBERT and Late Interaction

ColBERT (Khattab & Zaharia, 2020, Stanford) introduces a middle ground between bi-encoders and cross-encoders called **late interaction**. Instead of compressing each document to a single vector, ColBERT preserves **per-token embeddings**.

**MaxSim Mechanism:**
1. Encode query into matrix of token embeddings: Q = [q1, q2, ..., qn]
2. Encode document into matrix of token embeddings: D = [d1, d2, ..., dm]
3. For each query token qi, compute maximum similarity with any document token: max_j(sim(qi, dj))
4. Sum all per-query-token maximum similarities: Score = Σi max_j(sim(qi, dj))

**Trade-offs:**

| Model Type | Pre-compute Docs | Token-Level Interaction | Scalability | Quality |
|------------|:---:|:---:|:---:|:---:|
| Bi-encoder (DPR/SBERT) | ✓ | ✗ | Excellent | Good |
| Cross-encoder | ✗ | ✓ | Poor | Excellent |
| Late interaction (ColBERT) | ✓ | ✓ | Good | Very Good |

**Storage concern:** ColBERT stores per-token embeddings (128-dim per token, ~50–100 tokens per passage), creating significantly larger indexes than single-vector approaches. ColBERTv2 addressed this with **residual compression**, reducing the MS MARCO index from 154GB to 16GB (1-bit) or 25GB (2-bit) — a 6–10× reduction.

**PLAID optimization:** Accelerates ColBERT search through centroid interaction and pruning — achieving 45× lower latency than vanilla ColBERTv2 while maintaining retrieval quality. PLAID summarizes documents by centroids, computes query-centroid dot products once, filters via "bags of centroids," then runs full MaxSim only on a reduced candidate set.

**Recent performance:** Multi-representation (late-interaction) models yield statistically significant improvements in MRR and MAP on hard and definitional queries over single-vector DPR. However, newer pre-training innovations (SimLM, BoW Prediction, CoT-MAE) have achieved state-of-the-art MRR@10 (SimLM: 41.1) that beats even ColBERTv2 (39.7) on MS MARCO, suggesting that single-vector models may close the gap with better pre-training strategies.

### 3.6 ColPali: Late Interaction for Multimodal Retrieval

ColPali (2024) extends late interaction to visual documents by treating PDFs as images divided into patches. Each patch gets a token-level embedding, enabling late interaction over visual content — "text and images in PDF documents can be simply treated together as screenshots." This eliminates the need for OCR, layout detection, or text extraction pipelines, and can retrieve relevant pages from documents with complex layouts, tables, and figures.

---

## 4. Hybrid Retrieval

### 4.1 Why Hybrid?

Neither lexical nor semantic retrieval dominates across all query types:
- **BM25 excels** at exact keyword matches, entity names, rare terms, and code/technical identifiers
- **Dense retrieval excels** at paraphrased queries, natural language questions, conceptual similarity, and cross-lingual search

Hybrid retrieval combines both to capture complementary relevance signals.

### 4.2 Reciprocal Rank Fusion (RRF)

RRF (Cormack, Clarke, & Butt, 2009) is the most widely adopted fusion method. It converts ranked lists from multiple retrievers into a single ranked list using a simple formula:

**Formula:**

```
RRF_score(d) = Σ 1 / (k + rank_i(d))
```

Where:
- `rank_i(d)` = document d's rank in retriever i's result list
- `k` = smoothing constant (typically 60, controls how quickly scores decrease with rank)
- Summation over all retrievers

**Example:** If document d is ranked 1st by BM25 and 3rd by vector search:
```
RRF_score = 1/(60+1) + 1/(60+3) = 0.0164 + 0.0159 = 0.0323
```

**Why RRF works well:**
- No score normalization needed — works purely on ranks, so different score scales don't matter
- No training data required — plug-and-play
- Robust to outlier scores from individual retrievers
- Documents ranked highly by multiple retrievers get the highest combined scores

**Limitations:** RRF treats all retrievers as equally trustworthy and cannot learn query-dependent weighting. Linear combination of normalized scores can outperform RRF when tuned with labeled data.

### 4.3 Alternative Fusion Methods

**Linear combination (weighted sum):**
```
score(d) = α × normalize(score_lexical(d)) + (1 - α) × normalize(score_semantic(d))
```
Requires score normalization (min-max or z-score) since BM25 and cosine similarity operate on different scales. The α parameter controls the balance (typically 0.5–0.8, leaning toward semantic). Higher potential accuracy when tuned, but requires labeled data.

**Relative Score Fusion (Weaviate):** Normalizes scores from each retriever to [0, 1] range before combining, addressing the scale mismatch without requiring external training data.

**Convex Combination Ranking (Elasticsearch):** Supports both RRF and convex combination (CC) approaches, allowing developers to choose based on their tuning budget.

### 4.4 Platform Implementations

**Elasticsearch:**
- Hybrid search via the `rrf` retriever combining a lexical `match` query with a `knn` vector query
- Supports both RRF and CC fusion
- Default since version 8.x; uses BM25 for lexical side
- Configurable k parameter for RRF smoothing

**Weaviate:**
- Hybrid search since v1.17, combining BM25/BM25F with vector search
- `alpha` parameter (0–1) controls sparse vs. dense weighting (0.75 default)
- Two fusion algorithms: `rankedFusion` (RRF) and `relativeScoreFusion`
- Returns score breakdown showing each method's contribution

**Vespa:**
- First-phase BM25 + second-phase neural re-ranking architecture
- Native ColBERT embedder support for late-interaction retrieval
- Supports custom ranking expressions combining multiple signals
- Designed for real-time hybrid search at scale

**Key observation:** All major search platforms now support hybrid retrieval as a first-class feature. The convergence around BM25 + dense vectors + RRF as the default hybrid architecture suggests this is the production standard for 2024–2025.

### 4.5 Dynamic Weighting

Advanced hybrid systems detect query characteristics and adjust the BM25/semantic balance per query. Hybrid retrieval frameworks with dynamic weighting per query yield up to 6–7 point gains vs. static weighting. For example:
- Named entity queries → higher BM25 weight
- Natural language questions → higher semantic weight
- Technical/code queries → higher BM25 weight
- Conceptual/abstract queries → higher semantic weight

---

## 5. Query Expansion and Rewriting

### 5.1 Classical Query Expansion

Query expansion adds terms to the original query to address vocabulary mismatch and improve recall. Three foundational approaches:

**Synonym expansion:** Replace or augment query terms with known synonyms from a thesaurus (e.g., WordNet) or domain-specific vocabulary. Researchlab's `research-index.js` already implements this with its `SYNONYM_GROUPS` map — a strong foundation.

**Pseudo-Relevance Feedback (PRF):** Assume the top-k results from an initial retrieval are relevant, extract frequent terms from those results, and add them to the query for a second retrieval pass. The Rocchio algorithm (1971) is the classic PRF formulation:
```
Q_expanded = α × Q_original + β × (Σ D_relevant / |D_relevant|) - γ × (Σ D_nonrelevant / |D_nonrelevant|)
```

**Risks:** If initial results are poor, PRF amplifies errors (query drift). Selecting good expansion terms requires careful filtering — raw frequency in pseudo-relevant documents is insufficient.

**Statistical co-occurrence:** Identify terms that frequently co-occur with query terms across the collection, even without appearing in the same documents. Pointwise Mutual Information (PMI) and association measures can discover useful expansion terms.

### 5.2 LLM-Based Query Expansion (2024–2025)

Large language models have transformed query expansion by generating contextually appropriate expansion terms without requiring a feedback loop:

**Zero-shot generation:** Prompt an LLM to generate related terms, alternative phrasings, or hypothetical documents that would answer the query. GenQREnsemble (2024) uses zero-shot LLM ensemble prompting for generative query reformulation, combining multiple prompts' outputs for robustness.

**Knowledge-aware expansion:** NAACL 2025 work on knowledge-aware query expansion uses LLMs to inject structured knowledge into query representations, addressing the knowledge gap between user queries and relevant documents.

**Chain-of-thought query decomposition:** Break complex queries into simpler sub-queries, each targeting a specific aspect:
- "What are the health effects of microplastics in drinking water?" →
  - "microplastics concentration drinking water studies"
  - "microplastic health effects human exposure"
  - "water treatment microplastic removal methods"

Recent systems (2025):
- **DeepRAG:** Decomposes queries into sub-queries using self-calibration, employing binary tree search to help models understand their knowledge boundaries
- **Omni-RAG:** Preprocesses user queries through denoising and intent decomposition
- **UniRAG:** Unifies query augmentation and query encoding phases, adaptively selecting augmentation strategies per query
- **CoT-RAG:** Integrates chain-of-thought reasoning with retrieval

### 5.3 Hallucination Risk

A critical concern with LLM-based expansion: generative models can produce "fluent but factually incorrect or semantically irrelevant content." Generative Relevance Feedback (GRF) methods still rest on the relevance assumption — that generated expansions faithfully reflect user intent. Mitigation strategies include:
- Filtering expansion terms against the collection vocabulary (only add terms that actually appear in the index)
- Ensemble approaches that require multiple generation strategies to agree
- Using expansion as one signal combined with original query, not as a replacement

### 5.4 Multi-Dimensional Semantic PRF

Recent work (Nature, 2024) proposes a multi-dimensional semantic PRF framework that captures semantic information from pseudo-relevant documents using pre-trained models. The key insight: the semantic information within pseudo-relevant documents plays a critical role in selecting appropriate query expansion terms, beyond just term frequency.

---

## 6. Learning to Rank

### 6.1 Overview

Learning to Rank (LTR) uses machine learning to combine multiple relevance signals (features) into an optimal ranking function. Instead of hand-tuning scoring weights, LTR learns the weights from labeled training data.

### 6.2 Three Approaches

**Pointwise:** Treats ranking as regression or classification — predict a relevance score for each document independently, then sort by predicted score.
- Models: Linear regression, random forests, neural networks
- Loss: MSE, cross-entropy
- Limitation: Ignores relative ordering between documents; optimizing per-document accuracy doesn't necessarily optimize ranking quality
- Complexity: O(n) inference per query

**Pairwise:** Treats ranking as a preference problem — given two documents, predict which is more relevant.
- Models: RankNet (Burges et al., 2005), LambdaMART (from LightGBM), RankSVM
- Loss: Cross-entropy or hinge loss on document pairs
- Advantage: Captures relative ordering, which is closer to the ranking objective
- Limitation: O(n²) pairs per query; doesn't directly optimize list-level metrics
- LambdaMART remains one of the most competitive LTR models, especially for feature-rich ranking

**Listwise:** Optimizes the entire ranked list directly, often targeting a specific IR metric.
- Models: ListNet, LambdaRank, AdaRank, SoftRank
- Loss: Directly approximates nDCG or other list metrics
- Advantage: Best alignment between training objective and evaluation metric
- Recent: AFR-Rank (2025) — LLM-based listwise reranking that filters irrelevant documents before reranking, improving efficiency

**Efficient Pointwise-Pairwise hybrid (Amazon, EMNLP 2024):** A novel framework integrating both pointwise relevance prediction and pairwise comparisons in a scalable manner for news recommendation — suggesting the boundaries between approaches are blurring.

### 6.3 Important Features for Ranking

Effective LTR systems combine diverse feature types:

| Feature Category | Examples | Signal Type |
|------------------|----------|-------------|
| Query-document | BM25 score, TF-IDF cosine, embedding similarity | Relevance |
| Query features | Query length, number of terms, query type | Context |
| Document features | Document length, freshness, authority score, link count | Quality |
| Interaction features | Click-through rate, dwell time, bounce rate | Behavioral |
| Field-specific | Title match, description match, tag match | Structural |
| Derived | Coverage (% query terms matched), min/max/avg term IDF | Statistical |

For researchlab's source matching, the most applicable features would be: BM25-style tag match score, description match score, name match score, source freshness, number of endpoints (richness), past usage frequency, and topic-source co-occurrence from historical research.

### 6.4 When LTR is Appropriate

LTR requires labeled training data (relevance judgments), multiple ranking features, and enough query volume to train on. For researchlab's current scale (small source registry, limited query volume), hand-tuned scoring weights are appropriate. LTR becomes valuable when:
- The source registry grows beyond ~50 sources
- Multiple ranking signals exist that are difficult to weight manually
- Historical query-source success data is available for training

---

## 7. IR Evaluation Metrics

### 7.1 Precision@K

**Measures:** What fraction of the top K retrieved items are relevant.

```
Precision@K = |relevant items in top K| / K
```

**Use case:** When you care about the quality of a fixed-size result set. Good for "show me exactly 3 data sources" scenarios (researchlab's default maxResults=3).

**Limitation:** Order-unaware — position within top K doesn't matter.

### 7.2 Recall@K

**Measures:** What fraction of all relevant items appear in the top K results.

```
Recall@K = |relevant items in top K| / |total relevant items|
```

**Use case:** When missing a relevant source is costly. Important for researchlab: failing to surface a relevant API source means workers miss critical data.

**Limitation:** Improves mechanically as K increases; also order-unaware.

### 7.3 Mean Reciprocal Rank (MRR)

**Measures:** How quickly the first relevant result appears, averaged across queries.

```
MRR = (1/|Q|) × Σ (1 / rank_of_first_relevant_result)
```

**Use case:** When finding one good result fast matters most — question answering, chatbot search, "I'm feeling lucky" scenarios.

**Limitation:** Only considers the first relevant result; ignores quality of the rest of the ranking.

### 7.4 Mean Average Precision (MAP@K)

**Measures:** Average of precision values calculated at each rank position where a relevant item appears.

```
AP(q) = (1 / |relevant|) × Σ_k (Precision@k × rel(k))
MAP = mean(AP) across all queries
```

Where `rel(k)` = 1 if the item at rank k is relevant, 0 otherwise.

**Use case:** When multiple relevant results exist and their ranking order matters. Good for evaluating researchlab's research index search, where multiple past projects may be relevant.

**Limitation:** Binary relevance only — a source is either relevant or not, no graded scores.

### 7.5 Normalized Discounted Cumulative Gain (nDCG@K)

**Measures:** Quality of ranking accounting for graded relevance, with logarithmic position discount.

```
DCG@K = Σ_i (relevance_i / log₂(1 + i))
IDCG@K = DCG@K of the ideal ranking
nDCG@K = DCG@K / IDCG@K
```

**Use case:** The gold standard for search evaluation. Supports graded relevance (e.g., 0=irrelevant, 1=somewhat relevant, 2=relevant, 3=highly relevant), is order-aware, and produces interpretable 0–1 scores.

**For researchlab:** nDCG would be the most appropriate primary metric if building an evaluation set, since source relevance is naturally graded (a source about exactly the right API is more relevant than a loosely related one).

### 7.6 Metric Selection Guide

| Metric | Order-Aware | Multi-Result | Graded Relevance | Best For |
|--------|:-----------:|:------------:|:-----------------:|----------|
| Precision@K | No | Yes | No | Fixed-size result quality |
| Recall@K | No | Yes | No | Coverage analysis |
| MRR | Yes | No | No | First-result quality |
| MAP@K | Yes | Yes | No | Multi-result binary ranking |
| nDCG@K | Yes | Yes | Yes | General search evaluation |

---

## 8. Current Researchlab Source Matching: Gap Analysis

### 8.1 How Source Matching Works Today

`lib/sources.js:matchSources()` (lines 62–111) implements tag-based matching:

1. **Tokenize** the topic string: lowercase, remove non-alphanumeric chars, split on whitespace, filter tokens <3 chars, remove stop words
2. **Score** each source by iterating its tags against topic tokens:
   - Exact token match in tag → +3 points
   - Multi-word hyphenated tag found as substring in topic → +3 points
   - Tag found as substring in topic → +2 points
   - Topic token found in hyphenated tag parts → +1 point
3. **Filter** sources with score < 3 (MIN_SCORE), sort descending, return top `maxResults` (default 3)

### 8.2 How Research Index Search Works Today

`lib/research-index.js:search()` (lines 238–348) implements a more sophisticated scoring system:

1. **Tokenize** query, generate bigrams, expand tokens with synonyms from SYNONYM_GROUPS
2. **Score** each index entry across three fields (topic, tags, searchTerms):
   - Topic exact match: +3 pts (+1 position bonus for early matches)
   - Topic synonym match: +2 pts
   - Tag exact match: +2 pts, synonym: +1 pt
   - SearchTerms exact match: +1.5 pts, synonym: +0.75 pts
   - Bigram match in topic: +4 pts, in tags/searchTerms: +2.5 pts
   - Multi-token coverage bonus: +0.5 per distinct matching token (if >1)

### 8.3 Gap Analysis

| IR Capability | Best Practice | sources.js | research-index.js | Gap Severity |
|---------------|---------------|:----------:|:------------------:|:------------:|
| **Term frequency saturation** | BM25 k1 parameter | ✗ (binary match only) | ✗ (binary match only) | High |
| **Document length normalization** | BM25 b parameter | ✗ | ✗ | Medium |
| **IDF weighting** | Common terms worth less | ✗ (stop words only) | ✗ (stop words only) | High |
| **Field weighting** | BM25F (name > tags > description) | ✗ (tags only) | Partial (topic > tags > searchTerms) | Medium |
| **Synonym expansion** | Thesaurus/embedding similarity | ✗ | ✓ (SYNONYM_GROUPS) | High (sources.js) |
| **Semantic matching** | Embedding cosine similarity | ✗ | ✗ | High |
| **Query expansion** | PRF, LLM-based | ✗ | ✗ | Medium |
| **Bigram/phrase matching** | Multi-word concepts | ✗ | ✓ (bigrams) | Medium (sources.js) |
| **Multi-field search** | Search across name, desc, tags | ✗ (tags only) | ✓ (topic, tags, searchTerms) | High (sources.js) |
| **Collection statistics** | IDF computed from actual collection | ✗ | ✗ | Medium |
| **Fusion/hybrid** | Combine lexical + semantic | ✗ | ✗ | Medium |
| **Evaluation framework** | nDCG, MAP on test queries | ✗ | ✗ | High |

### 8.4 Specific Issues in sources.js

**1. Tags-only matching ignores rich text fields.** Each source has `name`, `description`, `baseUrl`, `notes`, and `exampleQueries` — all of which could contribute to relevance scoring. The current system only matches against `tags`.

**2. Binary match, no term frequency.** A tag either matches or it doesn't. If a topic mentions "water" three times and a source's tags include "water," the repetition isn't captured. BM25 would give higher scores to stronger signal.

**3. No IDF — common tags score the same as rare tags.** A tag like "health" (which might match many sources) contributes the same +3 as a tag like "microplastics" (which might match only one source). IDF would down-weight common tags.

**4. No document length normalization.** A source with 20 tags has 20 chances to score points vs. a source with 3 tags, creating a bias toward tag-rich sources.

**5. Hard score threshold (MIN_SCORE=3).** A source that partially matches on two weak signals (1+1=2) is completely filtered out, even if it's the only relevant source available. Rank-based cutoffs or dynamic thresholds would be more robust.

**6. No semantic understanding.** "machine learning" won't match a source tagged "artificial-intelligence" unless a substring match happens to fire.

### 8.5 Specific Issues in research-index.js

The research index search is significantly more advanced. Its main gaps are:

**1. No IDF.** All tokens weighted equally regardless of how common they are across the index.

**2. Manually curated synonyms.** The SYNONYM_GROUPS map requires manual maintenance and has no coverage for domain-specific terminology. A source registered after the synonym map was written may use terminology not covered.

**3. Substring matching can produce false positives.** `searchTermsStr.includes(token)` matches "car" inside "cardiac" and "art" inside "artificial." Token-boundary matching would be more precise.

**4. No evaluation harness.** Without a test set of (query, relevant-results) pairs and evaluation metrics, it's impossible to know whether scoring changes actually improve retrieval quality.

---

## 9. Recommendations

### 9.1 High-Impact, Low-Complexity Improvements

These can be implemented within the current stdlib-only constraint:

**R1: Multi-field matching for sources.js.** Extend `matchSources()` to also search `name` and `description` fields, with field weights (name: 4x, tags: 2x, description: 1x). This is the single highest-impact change — it dramatically increases the surface area for matching.

**R2: BM25-style scoring.** Replace the binary match scoring with a simplified BM25 scorer that accounts for:
- Term frequency within the concatenated text of each source (tf saturation via k1)
- Document length normalization (tags.length, description.length)
- Collection-level IDF computed at match time from the source registry

A minimal BM25 implementation is ~30 lines of code with no external dependencies.

**R3: Synonym expansion for sources.js.** Port the `SYNONYM_GROUPS` and `expandToken()` from research-index.js to sources.js (or extract to a shared module). This directly addresses semantic gaps like "AI" ↔ "artificial-intelligence."

**R4: Token-boundary matching in research-index.js.** Replace `string.includes(token)` with a word-boundary-aware check (e.g., RegExp with `\b` anchors or tokenize-then-compare) to eliminate false substring matches.

**R5: Dynamic score threshold.** Replace MIN_SCORE=3 with a relative threshold — e.g., return results scoring above 50% of the top result's score, or always return at least the best match if any match exists.

### 9.2 Medium-Impact Improvements

**R6: Bigram matching for sources.js.** Add bigram matching (already implemented in research-index.js) to capture multi-word concepts like "machine learning" or "water quality" in source matching.

**R7: Source usage feedback.** Track which sources workers actually use successfully (the data is partially available via `sourcesUsed` in the research index). Sources that have historically been useful for similar topics should receive a relevance boost.

**R8: Build an evaluation test set.** Create 20–30 (topic, expected-sources) pairs representing known-good matches. Compute Precision@3 and nDCG@3 before and after any scoring changes. This is essential for validating improvements and preventing regressions.

### 9.3 Higher-Complexity Improvements (Future)

**R9: Lightweight embedding similarity.** If an embedding model becomes available (e.g., via a Strategos-accessible API), compute source embeddings offline and add cosine similarity as a second retrieval signal, fused with BM25 via RRF. This would address the semantic gap without abandoning lexical matching.

**R10: LLM-based query expansion.** Before matching, use the planning worker's LLM to expand the topic into related terms and alternative phrasings. This is essentially free if the LLM call is already happening during planning.

**R11: Per-query fusion weighting.** If implementing hybrid retrieval (R9), use query characteristics (length, presence of entities, abstractness) to dynamically weight the BM25 vs. semantic balance.

### 9.4 Implementation Priority

| Priority | Recommendation | Effort | Impact | Dependencies |
|:--------:|---------------|:------:|:------:|:------------:|
| 1 | R1: Multi-field matching | Low | High | None |
| 2 | R3: Synonym expansion for sources | Low | High | None |
| 3 | R2: BM25-style scoring | Medium | High | None |
| 4 | R5: Dynamic threshold | Low | Medium | None |
| 5 | R8: Evaluation test set | Medium | High (enables validation) | None |
| 6 | R4: Token-boundary matching | Low | Medium | None |
| 7 | R6: Bigram matching | Low | Medium | None |
| 8 | R7: Source usage feedback | Medium | Medium | Index data |
| 9 | R9: Embedding similarity | High | High | Embedding API |
| 10 | R10: LLM query expansion | Medium | Medium | LLM access |

---

## 10. Sources

### Classical IR Models
- Robertson, S. E. & Walker, S. (1994). "Some simple effective approximations to the 2-Poisson model for probabilistic weighted retrieval." *SIGIR '94*.
- Spärck Jones, K. (1972). "A statistical interpretation of term specificity and its application in retrieval." *Journal of Documentation*, 28(1), 11–21.
- Ponte, J. M. & Croft, W. B. (1998). "A Language Modeling Approach to Information Retrieval." *SIGIR '98*.
- Zhai, C. & Lafferty, J. (2001). "A study of smoothing methods for language models applied to Ad Hoc information retrieval." *SIGIR '01*. https://dl.acm.org/doi/10.1145/383952.384019
- Elastic Blog. "Practical BM25 — Parts 2 and 3." https://www.elastic.co/blog/practical-bm25-part-2-the-bm25-algorithm-and-its-variables
- Wikipedia. "Okapi BM25." https://en.wikipedia.org/wiki/Okapi_BM25

### Semantic Retrieval
- Karpukhin, V. et al. (2020). "Dense Passage Retrieval for Open-Domain Question Answering." *EMNLP 2020*.
- Reimers, N. & Gurevych, I. (2019). "Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks." *EMNLP 2019*.
- Khattab, O. & Zaharia, M. (2020). "ColBERT: Efficient and Effective Passage Search via Contextualized Late Interaction over BERT." *SIGIR 2020*.
- Santhanam, K. et al. (2022). "ColBERTv2: Effective and Efficient Retrieval via Lightweight Late Interaction." *NAACL 2022*.
- Santhanam, K. et al. (2022). "PLAID: An Efficient Engine for Late Interaction Retrieval." *CIKM 2022*.
- Weaviate Blog. "An Overview of Late Interaction Retrieval Models." https://weaviate.io/blog/late-interaction-overview
- Zhao, W. X. et al. (2024). "Dense Text Retrieval Based on Pretrained Language Models: A Survey." *ACM TOIS*. https://dl.acm.org/doi/full/10.1145/3637870

### Hybrid Retrieval
- Cormack, G. V., Clarke, C. L. A., & Butt, S. (2009). "Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods." *SIGIR 2009*.
- Weaviate Blog. "Hybrid Search Explained." https://weaviate.io/blog/hybrid-search-explained
- Elastic. "A Comprehensive Hybrid Search Guide." https://www.elastic.co/what-is/hybrid-search
- Vespa Blog. "Announcing ColBERT Embedder in Vespa." https://blog.vespa.ai/announcing-colbert-embedder-in-vespa/

### Query Expansion
- Rocchio, J. J. (1971). "Relevance feedback in information retrieval." *The SMART Retrieval System*.
- Singh, P. & Bhowmick, P. K. (2025). "Semantics-aware query expansion using pseudo-relevance feedback." *Journal of Information Science*. https://journals.sagepub.com/doi/abs/10.1177/01655515231184831
- Nature (2024). "A multi-dimensional semantic pseudo-relevance feedback framework for information retrieval." *Scientific Reports*. https://www.nature.com/articles/s41598-024-82871-0
- NAACL 2025. "Knowledge-Aware Query Expansion with Large Language Models." https://aclanthology.org/2025.naacl-long.216.pdf
- Chuang et al. (2025). "Query Expansion in the Age of Pre-trained and Large Language Models: A Survey." https://arxiv.org/pdf/2509.07794

### Learning to Rank
- Burges, C. et al. (2005). "Learning to Rank using Gradient Descent." *ICML 2005*.
- Liu, T.-Y. (2009). "Learning to Rank for Information Retrieval." *Foundations and Trends in Information Retrieval*, 3(3), 225–331.
- Amazon Science / EMNLP 2024. "Efficient Pointwise-Pairwise Learning-to-Rank for News Recommendation." https://arxiv.org/abs/2409.17711
- CMJ Publishers (2025). "A Review of Machine Learning Ranking Systems." https://www.cmjpublishers.com/wp-content/uploads/2025/10/a-review-of-machine-learning-ranking-systems-methods-applications-and-challenges.pdf

### Evaluation Metrics
- Pinecone. "Evaluation Measures in Information Retrieval." https://www.pinecone.io/learn/offline-evaluation/
- Weaviate. "Evaluation Metrics for Search and Recommendation Systems." https://weaviate.io/blog/retrieval-evaluation-metrics
- Evidently AI. "Normalized Discounted Cumulative Gain (NDCG) explained." https://www.evidentlyai.com/ranking-metrics/ndcg-metric
- Stanford CS276. "Evaluation in Information Retrieval." https://web.stanford.edu/class/cs276/handouts/EvaluationNew-handout-1-per.pdf
