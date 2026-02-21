# Knowledge Graph Construction: Ontology Patterns, Quality Frameworks, and Provenance

**Research Report — ResearchLab Pipeline Improvement**
**Date:** 2026-02-21
**Worker:** e5b21fa5 (RESEARCH: Knowledge Graph Construction)
**Parent:** b9b965d3 (GENERAL: Research Methodology Campaign)

---

## Executive Summary

This report examines knowledge graph construction best practices across six domains — ontology frameworks, real-world KG schemas, quality metrics, graph topology, provenance/confidence tracking, and graph evolution — and evaluates the current ResearchLab graph-builder against these findings. The current implementation is a lightweight property-graph model with domain-specific node and edge types, basic validation, and topic-based content storage. While pragmatically effective, the analysis identifies specific gaps in provenance tracking, confidence granularity, temporal validity, schema extensibility, and edge-level metadata.

Key findings:
1. The current schema uses a **closed type system** (8 node types, 7 edge types) that maps well to research domains but lacks extensibility mechanisms found in established ontologies.
2. **Provenance is critically underserved**: edges support a single `citation` string; nodes lack source attribution, temporal validity, and evidence chain tracking.
3. **Confidence scoring** exists (`verified/plausible/unverified/disputed`) but lacks the granularity and numeric scoring (0–1) used in production KGs like Wikidata and Google's Enterprise KG.
4. The graph has **no temporal dimension** — facts have no validity period, creation timestamp, or version history.
5. **Edge metadata is minimal**: no weight, confidence, directionality semantics, or provenance — a gap relative to both RDF reification and labeled property graph best practices.
6. **Topic coverage validation** is a strength — the requirement that every non-domain node have a topic entry is a quality gate absent from many KG systems.

---

## 1. Ontology Frameworks for Research Knowledge

### 1.1 OWL (Web Ontology Language)

OWL is the W3C standard for defining formal ontologies with class hierarchies, property domains/ranges, cardinality constraints, and logical characteristics (transitive, symmetric, inverse relations). OWL enables automated reasoning — inferring new facts from declared axioms.

**Relevance to ResearchLab:** OWL's class hierarchy model maps conceptually to the node type system (`domain` > `contaminant` > specific contaminants). However, OWL's complexity (three profiles: OWL Lite, DL, Full) is overkill for a research synthesis tool. The key takeaway is OWL's **property constraint model** — defining what types of nodes can connect via what types of edges — which ResearchLab currently lacks.

**Source:** [W3C OWL Specification](https://www.w3.org/OWL/); [Ontology Standards Overview](https://medium.com/@jaywang.recsys/ontology-taxonomy-and-graph-standards-owl-rdf-rdfs-skos-052db21a6027)

### 1.2 RDF / RDFS (Resource Description Framework)

RDF represents knowledge as subject-predicate-object triples. RDFS adds vocabulary for defining classes and properties. RDF's strength is global interoperability through URI-based identifiers and standardized serialization (Turtle, JSON-LD, N-Triples).

**Key distinction from property graphs:** RDF triples cannot carry metadata directly. To say "this causation link was established by Study X with confidence 0.85," RDF requires **reification** (creating additional triples about the triple) or **named graphs** (grouping triples into labeled contexts). This is architecturally important because ResearchLab needs exactly this capability — statement-level metadata.

**Practical tradeoff:** Property graphs (like ResearchLab's JSON model) allow key-value pairs directly on edges, making statement-level metadata straightforward. RDF's advantage is standardized reasoning; property graphs' advantage is simplicity and performance for traversal queries.

**Source:** [RDF vs. Property Graphs](https://neo4j.com/blog/knowledge-graph/rdf-vs-property-graphs-knowledge-graphs/); [Property Graph vs RDF](https://www.puppygraph.com/blog/property-graph-vs-rdf)

### 1.3 SKOS (Simple Knowledge Organization System)

SKOS is a W3C recommendation for representing thesauri, taxonomies, and classification schemes using `broader`, `narrower`, and `related` relationships. SKOS concepts are identified by URIs and can carry labels in multiple languages, documentation notes, and mapping links to other vocabularies.

**Relevance to ResearchLab:** The graph's `parent` field on nodes implements a SKOS-like `broader/narrower` hierarchy. SKOS's key contribution is the **explicit distinction between hierarchical and associative relationships** — the current schema conflates these (a `composition` edge and a `parent` field both express hierarchy). SKOS also provides `closeMatch`, `exactMatch`, and `relatedMatch` for cross-graph alignment, which would be valuable when ResearchLab graphs reference each other.

**Source:** [SKOS Reference](https://www.w3.org/TR/skos-reference/); [SKOS Overview (ISKO)](https://www.isko.org/cyclo/skos.htm)

### 1.4 Dublin Core

Dublin Core provides 15 metadata elements: Title, Creator, Subject, Description, Publisher, Contributor, Date, Type, Format, Identifier, Source, Language, Relation, Coverage, Rights. Since 2012, these have been expressible as RDF vocabularies.

**Relevance to ResearchLab:** Dublin Core's elements map directly to what graph nodes should carry but currently don't:
- **Creator** → who/what generated this node (pipeline worker, source study)
- **Date** → when the fact was established / when it was added to the graph
- **Source** → the primary evidence source
- **Coverage** → temporal and geographic scope of the claim
- **Rights** → license information for cited data

The current `buildNode()` function accepts `id`, `label`, `type`, and optional `severity/confidence/parent/summary/keyStats` — missing Dublin Core's creator, date, source, and coverage.

**Source:** [Dublin Core Metadata Basics](https://www.dublincore.org/resources/metadata-basics/); [DCMI Terms](https://www.dublincore.org/specifications/dublin-core/dcmi-terms/)

### 1.5 Schema.org

Schema.org provides a collaborative, community-driven vocabulary of schemas for structured data on web pages. Its `Thing` hierarchy (with `CreativeWork`, `Event`, `Organization`, `Person`, `Place`, etc.) is the most widely deployed ontology on the web. Google Knowledge Graph uses Schema.org types extensively.

**Relevance to ResearchLab:** Schema.org's `ScholarlyArticle`, `Claim`, `MedicalEntity`, and `Review` types align with research graph needs. Its `citation`, `evidence`, and `isBasedOn` properties model provenance relationships. Most practically, Schema.org's type hierarchy demonstrates how to make a type system extensible — every type is a specialization of a broader type, allowing new types without breaking existing consumers.

---

## 2. Knowledge Graph Schemas in Practice

### 2.1 Wikidata Property Model

Wikidata represents entities as **items** (Q-identifiers) with **statements** composed of property-value pairs. Each statement can carry:
- **Qualifiers** — additional context (e.g., "start time," "applies to part," "determination method")
- **References** — sourcing information (who stated this, when, from what publication)
- **Rank** — preferred, normal, or deprecated

This three-layer structure (claim → qualifiers → references) is the gold standard for statement-level metadata. Wikidata validates data using **Shape Expressions (ShEx)**, defining what properties are expected for items of a given type.

**Key design principle:** "Only simple hierarchical properties should be recorded as statements. Properties like grandparent can be derived from existing parent relationships." This derivability principle is relevant to ResearchLab — currently all relationships are explicitly stored, including some that could be inferred.

**Gap in ResearchLab:** The current edge model (`source`, `target`, `label`, `type`, optional `citation`) has no equivalent to qualifiers or references. A single `citation` string cannot express "claimed by Study A (2023), corroborated by Study B (2024), contradicted by Study C (2025)."

**Source:** [Wikidata Data Model](https://www.wikidata.org/wiki/Wikidata:Data_model); [Wikidata Properties](https://www.wikidata.org/wiki/Help:Properties)

### 2.2 Google Knowledge Graph / Enterprise KG

Google's Knowledge Graph uses Schema.org types with entity reconciliation. Its Enterprise KG product assigns **reconciliation confidence scores** between 0 and 1 for entity matching. Each fact maintains provenance metadata including origin URLs and retrieval timestamps. Facts carry an average of three independent sources.

**Key insight:** Confidence is numeric (0–1), not categorical. This enables mathematical operations — averaging, weighting, threshold-based filtering — that categorical labels (`verified/plausible`) cannot support.

**Source:** [Google Enterprise KG Confidence Scores](https://cloud.google.com/enterprise-knowledge-graph/docs/confidence-score); [Google Enterprise KG Overview](https://docs.cloud.google.com/enterprise-knowledge-graph/docs/overview)

### 2.3 OpenAlex (Successor to Microsoft Academic Graph)

OpenAlex represents scholarly knowledge with seven entity types: **Works**, **Authors**, **Sources** (journals/repos), **Institutions**, **Topics**, **Publishers**, and **Funders**. Relationships form a heterogeneous directed graph. The key design pattern is the **authorship object** — a three-way link connecting Author ↔ Work ↔ Institution, creating rich compound relationships.

**Key design principle:** Entity types map to distinct real-world categories with well-defined relationship semantics. OpenAlex avoids generic "entity" types — every node has a specific type with expected properties.

**Relevance to ResearchLab:** OpenAlex's approach of compound relationships (author-work-institution) suggests that some ResearchLab edges need to carry structured metadata, not just a label and citation. For example, a `causation` edge between a contaminant and a health effect should specify mechanism, dose-response, population studied, and study type — not just "CAUSES."

**Source:** [OpenAlex Entity Overview](https://docs.openalex.org/api-entities/entities-overview); [OpenAlex Documentation](https://docs.openalex.org/)

### 2.4 Cross-Schema Comparison

| Feature | Wikidata | Google KG | OpenAlex | ResearchLab |
|---------|----------|-----------|----------|-------------|
| Entity types | Open (any Q-item) | Schema.org hierarchy | 7 fixed types | 8 fixed types |
| Edge metadata | Qualifiers + references | Provenance + confidence | Typed relationships | Label + citation string |
| Confidence model | Statement rank (3 levels) | Numeric 0–1 | N/A | Categorical (4 levels) |
| Validation | ShEx schemas | Internal | API constraints | `validateGraph()` function |
| Temporal validity | Qualifier-based | Retrieval timestamp | Publication dates | **None** |
| Multi-source attribution | Multiple references per claim | ~3 sources per fact | Citation networks | Single citation per edge |
| Type extensibility | Unlimited | Schema.org inheritance | Fixed | Fixed |

---

## 3. Graph Quality Metrics and Validation

### 3.1 Quality Dimensions Framework

Research literature identifies four categories of KG quality dimensions:

**Intrinsic Quality:**
- **Semantic accuracy** — do facts correctly represent the real world?
- **Syntactic consistency** — are naming conventions, formats, and types applied uniformly?
- **Conciseness** — are there duplicate or redundant nodes/edges?
- **Completeness** — are all expected entities and relationships present?

**Contextual Quality:**
- **Relevancy** — does the graph contain information pertinent to its purpose?
- **Trustworthiness** — can the provenance and reliability of facts be assessed?
- **Understandability** — can consumers interpret the graph without external documentation?
- **Timeliness** — are facts current, or are outdated claims retained without annotation?

**Representational Quality:**
- **Representational conciseness** — is the schema minimal but sufficient?
- **Interoperability** — can the graph be consumed by different systems?
- **Interpretability** — are labels, types, and relationships self-explanatory?

**Accessibility Quality:**
- **Availability** — can the graph be queried and retrieved efficiently?
- **Security** — are access controls appropriate?

**Source:** [KG Quality Survey (Semantic Scholar)](https://www.semanticscholar.org/paper/Knowledge-Graph-Quality-Management:-A-Comprehensive-Xue-Zou/ae5b587fb5ff55c074a770acf81c27d9d3046748); [Quality Metrics Overview (AAAI)](https://ojs.aaai.org/index.php/AAAI-SS/article/download/36888/39026/40965)

### 3.2 Assessment of Current ResearchLab Validation

The `validateGraph()` function (graph-builder.js:77–152) checks:

| Check | Quality Dimension | Assessment |
|-------|-------------------|------------|
| Nodes array exists | Syntactic consistency | ✅ Good |
| Required fields (id, label, type) | Syntactic consistency | ✅ Good |
| Valid node types | Schema conformance | ✅ Good |
| No duplicate node IDs | Conciseness | ✅ Good |
| Edges array exists | Syntactic consistency | ✅ Good |
| Edge required fields | Syntactic consistency | ✅ Good |
| Valid edge types | Schema conformance | ✅ Good |
| Dangling edge detection | Referential integrity | ✅ Good |
| Topics map exists | Completeness | ✅ Good |
| Topic coverage (non-domain nodes) | Completeness | ✅ Good |
| Topic sections array | Structural validity | ✅ Good |

**Missing validation checks:**
- **Semantic accuracy** — no check for logical consistency (e.g., a `solution` edge should connect a `solution` node to a `health-effect` or `contaminant` node, not two `context` nodes)
- **Completeness** — no minimum graph density check (isolated nodes, disconnected subgraphs)
- **Conciseness** — no duplicate content detection (nodes with near-identical labels)
- **Timeliness** — no temporal metadata to check against
- **Consistency** — no check for contradictory edges (e.g., two edges between same nodes with conflicting confidence levels)
- **Hierarchy validation** — `parent` references are not validated (could point to non-existent nodes)
- **Edge type constraints** — no validation of which node types can be connected by which edge types (e.g., `causation` should only link `contaminant` → `health-effect`)

### 3.3 Recommended Validation Additions

**Priority 1 — Referential integrity:**
```javascript
// Validate parent references point to existing nodes
if (n.parent && !nodeIds.has(n.parent)) {
  errors.push(`nodes[${i}]: parent "${n.parent}" not found in nodes`);
}
```

**Priority 2 — Edge type constraints (domain/range):**
Define a constraint map specifying valid source→target type combinations for each edge type:
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

**Priority 3 — Graph connectivity:**
```javascript
// Check for isolated nodes (no incoming or outgoing edges)
const connectedNodes = new Set();
for (const e of graph.edges) {
  connectedNodes.add(e.source);
  connectedNodes.add(e.target);
}
const isolated = graph.nodes.filter(n => !connectedNodes.has(n.id) && n.type !== 'domain');
if (isolated.length > 0) {
  errors.push(`${isolated.length} isolated non-domain node(s): ${isolated.slice(0,3).map(n => n.id).join(', ')}`);
}
```

---

## 4. Graph Navigation Patterns and Topology

### 4.1 Hub-and-Spoke vs Dense Interconnection

**Hub-and-spoke** graphs have central nodes (hubs) with many connections radiating to peripheral nodes (spokes). This pattern creates clear navigation anchors — users enter via hubs and traverse to details. ResearchLab's `domain` nodes serve as hubs, with child nodes (`contaminant`, `health-effect`, `solution`) as spokes.

**Densely interconnected** graphs have many cross-links between nodes at all levels. Research shows that dense interconnection **improves learning but impairs retrieval** — users can discover relationships but struggle to find specific facts. For a research synthesis tool, this tradeoff matters: the graph should aid discovery while remaining navigable.

**Recommendation:** ResearchLab should maintain its hub-and-spoke primary structure (domain → child categories → specific entities) while adding selective cross-links between related entities in different branches. These cross-links should be typed distinctly (e.g., `related` or `co-occurs`) to differentiate them from the primary hierarchy.

**Source:** [Local Patterns to Global Architectures (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4970514/); [How to Read Knowledge Graphs as Text Networks](https://support.noduslabs.com/hc/en-us/articles/13467504644892)

### 4.2 Bridging Nodes

Bridging nodes connect otherwise separate clusters in the graph. In network analysis, these have high **betweenness centrality** — removing them would disconnect parts of the graph. In research knowledge graphs, bridging nodes often represent cross-cutting concerns: a chemical compound that appears in both environmental contamination and pharmaceutical contexts, for example.

**Relevance to ResearchLab:** The `context` node type can serve as a natural bridging type — connecting `contaminant` clusters to `health-effect` clusters through shared regulatory, geographic, or temporal context. The `investigation` node type also bridges, connecting disputed claims to their evidence chains.

### 4.3 Hierarchy Depth Tradeoffs

| Depth | Pros | Cons | Use Case |
|-------|------|------|----------|
| 1–2 levels | Fast navigation, easy overview | Low detail, large nodes | Executive summaries |
| 3–4 levels | Good balance of overview + detail | Requires navigation effort | Research synthesis (recommended) |
| 5+ levels | Maximum granularity | Cognitive overload, navigation fatigue | Specialized technical ontologies |

**Current ResearchLab depth:** The schema supports 2 levels (domain → child), with the `parent` field enabling deeper nesting. The pipeline prompt instructs synthesis workers to create domain nodes with children, suggesting 2–3 levels in practice. This is appropriate for the use case, but **explicit depth constraints** in validation would prevent synthesis workers from creating arbitrarily deep hierarchies.

### 4.4 Recommended Topology Metrics

Add computable graph quality metrics:
- **Density** = `|edges| / (|nodes| × (|nodes| - 1))` — target 0.05–0.15 for navigability
- **Average degree** = `2 × |edges| / |nodes|` — target 2–5 for research graphs
- **Diameter** (longest shortest path) — target ≤ 6 for navigability
- **Connected component count** — target 1 (fully connected)

---

## 5. Provenance and Confidence Tracking

### 5.1 The PROV Ontology (W3C PROV-O)

PROV-O is the W3C standard for provenance, built on three core concepts:
- **Entity** — a thing with provenance (a fact, a document, a dataset)
- **Activity** — something that occurs (a research process, an extraction, a verification)
- **Agent** — something that bears responsibility (a researcher, a pipeline worker, a model)

Key relationships: `wasGeneratedBy` (entity → activity), `wasAttributedTo` (entity → agent), `wasDerivedFrom` (entity → entity), `used` (activity → entity).

**Application to ResearchLab:** Each graph node is an Entity. The pipeline phases (planning, classify, investigate, adjudicate, synthesize) are Activities. The Strategos workers are Agents. Currently, none of these relationships are tracked in the graph output. The adjudication phase assigns confidence but doesn't record which worker, which evidence items, or which investigation pathway produced each conclusion.

**Source:** [PROV-O W3C Recommendation](https://www.w3.org/TR/prov-o/); [Full Traceability for KGs (FOIS 2024)](https://www.utwente.nl/en/eemcs/fois2024/resources/papers/dibowski-full-traceability-and-provenance-for-knowledge-graphs.pdf)

### 5.2 Current ResearchLab Confidence Model

The pipeline uses a five-level categorical system:

| Code | Label | Meaning |
|------|-------|---------|
| V | VERIFIED | Confirmed through investigation pathway |
| P | PLAUSIBLE | Probably true based on evidence |
| U | UNVERIFIED | Not yet investigated |
| D | DISPUTED | Conflicting evidence found |
| R | RETRACTED | Withdrawn or debunked |

This is mapped to graph nodes as `confidence: "verified|plausible|unverified|disputed"` (RETRACTED items are excluded). The `confidenceRationale` field stores a text explanation.

**Strengths:**
- Clear categorical labels that humans can understand
- Rationale field provides auditability
- Integration with investigation pathways (`investigationPathway` field)
- Contrarian analysis via P-CON pathway can downgrade consensus claims

**Weaknesses:**
- **No numeric scoring** — cannot express "85% confident" vs "55% confident" within "plausible"
- **Node-level only** — confidence is assigned to nodes but not to edges, meaning the strength of a `causation` relationship cannot be expressed independently of the nodes it connects
- **No multi-source aggregation** — when multiple evidence items support a node, there's no mechanism to combine their individual confidence ratings
- **No temporal decay** — a "verified" claim from 2020 data is treated identically to one from 2025 data
- **Missing "uncertain" category** — the jump from PLAUSIBLE to UNVERIFIED is large; a "low confidence" or "tentative" level would add useful granularity

### 5.3 Recommended Provenance Model

Extend node metadata to include:

```javascript
{
  id: "pfas-kidney-cancer",
  label: "PFAS LINKED TO KIDNEY CANCER",
  type: "health-effect",
  confidence: "plausible",
  confidenceScore: 0.72,        // NEW: numeric 0-1
  confidenceRationale: "...",
  investigationPathway: "P-SCI",
  provenance: {                  // NEW: structured provenance
    createdAt: "2026-02-21T14:30:00Z",
    createdBy: "worker-abc123",
    pipelinePhase: "adjudicate",
    derivedFrom: ["e1", "e5", "e12"],  // evidence item IDs
    lastVerified: "2026-02-21T14:30:00Z",
    validFrom: "2023-01-01",    // temporal validity
    validUntil: null             // null = still valid
  },
  sources: [                     // NEW: multi-source attribution
    { citation: "Smith et al. (2024)", url: "...", pmid: "12345", reliability: "A", infoRating: "2" },
    { citation: "EPA (2023)", url: "...", reliability: "A", infoRating: "1" }
  ]
}
```

Extend edge metadata:

```javascript
{
  source: "pfas-contamination",
  target: "pfas-kidney-cancer",
  label: "CAUSES",
  type: "causation",
  confidence: 0.72,              // NEW: edge-level confidence
  weight: 3,                     // NEW: number of supporting sources
  citation: "Smith et al. (2024)", // existing
  qualifiers: {                  // NEW: Wikidata-inspired qualifiers
    mechanism: "oxidative stress",
    doseResponse: "positive correlation above 10 ng/mL",
    population: "occupational exposure cohort",
    studyType: "prospective cohort"
  }
}
```

### 5.4 Evidence Chain Tracking

The adjudication phase produces detailed evidence chains (evidence manifest → investigation pathway → adjudication) but this chain is not preserved in the final graph. The graph only stores the final confidence level. Recommendation: store the evidence chain ID on each node and edge, linking back to the adjudication files for full traceability.

---

## 6. Graph Evolution and Conflict Resolution

### 6.1 Update Strategies

When new information arrives about existing graph entities, three strategies exist:

1. **Overwrite (Last-Write-Wins):** Replace old facts with new ones. Simple but loses history. Appropriate for corrections, not for evolving knowledge.

2. **Append (Temporal Versioning):** Keep all versions with validity timestamps. Each fact carries `validFrom` and `validUntil`. Queries can specify a point in time. This is the approach used by temporal knowledge graphs and bitemporal databases.

3. **Merge with Conflict Detection:** Compare incoming facts against existing ones, flag conflicts for resolution. EVOKG applies confidence-based contradiction resolution and temporal trend tracking.

**Current ResearchLab behavior:** Each research run produces a new graph. There is no merging of graphs across projects. The `research-index` tracks completed projects and the adjudication phase does cross-project reconciliation, but the final graph is always a fresh construction.

**Source:** [ConVer-G: Concurrent KG Versioning](https://arxiv.org/html/2409.04499v1); [Temporal Conflict Resolution (TeCoRe)](https://www.vldb.org/pvldb/vol10/p1929-schoenfisch.pdf)

### 6.2 Conflict Resolution Patterns

| Pattern | Description | Suitability for ResearchLab |
|---------|-------------|----------------------------|
| Source priority | Higher-reliability source wins | Good for initial resolution |
| Recency | Most recent fact wins | Risky — new ≠ correct |
| Voting (majority) | Multiple sources agreeing wins | Already used (consensus detection) |
| Confidence-weighted | Higher confidence wins | Good fit with existing model |
| Human arbitration | Flag for manual review | Appropriate for disputed claims |

**Current implementation:** The adjudication phase detects consensus (>80% agreement) and triggers contrarian analysis (P-CON pathway). Cross-project reconciliation checks for disputed nodes in prior graphs and flags them. This is sophisticated but operates at the evidence level, not the graph level — the final graph doesn't carry conflict metadata.

### 6.3 Version Control for Graphs

Production knowledge graphs use one of:
- **Snapshot versioning:** Store complete graph state at each version. Simple, space-intensive.
- **Delta versioning:** Store only changes between versions. Efficient, requires reconstruction for point-in-time queries.
- **Named graph versioning:** Each version is a named graph context. Enables SPARQL queries across versions.

**Recommendation for ResearchLab:** The file-based storage (`~/.researchlab/projects/{id}/graph.json`) naturally supports snapshot versioning. When a topic is re-researched, the system should:
1. Rename the existing graph to `graph-v{N}.json`
2. Produce the new graph
3. Generate a diff summary showing what changed (added/removed/modified nodes and edges)
4. Carry forward confidence ratings from the previous version where the same entities appear, noting whether confidence increased or decreased

### 6.4 Temporal Validity

Facts have temporal scope — a claim that "PFAS is unregulated" may have been true in 2020 but not in 2025 after new EPA regulations. Knowledge graphs should annotate facts with:
- **Transaction time** — when the fact was added to the graph
- **Valid time** — the period during which the fact was true in the real world

The current graph has neither. Adding `createdAt` (transaction time) is trivial. Adding `validFrom` / `validUntil` (valid time) requires the synthesis worker to assess temporal scope — this could be guided by the investigation pathway results which already examine source dates.

**Source:** [Temporal Agents with Knowledge Graphs (OpenAI)](https://developers.openai.com/cookbook/examples/partners/temporal_agents_with_knowledge_graphs/temporal_agents/); [TeCre Temporal Conflict Resolution](https://www.mdpi.com/2078-2489/14/3/155)

---

## 7. Assessment of Current ResearchLab Graph Schema

### 7.1 Node Type Analysis

| Node Type | Purpose | Assessment |
|-----------|---------|------------|
| `domain` | Top-level category hub | ✅ Good — clear hierarchical root |
| `contaminant` | Substance being investigated | ✅ Good — well-scoped |
| `health-effect` | Health impact of contaminant | ✅ Good — clear semantics |
| `solution` | General solution approach | ⚠️ Overlaps with `recommendation` |
| `product` | Specific product | ✅ Good — actionable |
| `recommendation` | Actionable advice | ⚠️ Overlaps with `solution` |
| `context` | Background/regulatory info | ✅ Good — bridging type |
| `investigation` | Disputed claims under review | ✅ Good — supports uncertainty |

**Concern:** The `solution` and `recommendation` types overlap. A "recommendation" is a specific type of solution. Consider: (a) merging them into `solution` with a `specificity` qualifier (general/specific/product), or (b) making `recommendation` a subtype of `solution` with an explicit hierarchy.

### 7.2 Edge Type Analysis

| Edge Type | Purpose | Assessment |
|-----------|---------|------------|
| `causation` | Causal relationship | ✅ Good — but needs strength/mechanism metadata |
| `evidence` | Evidentiary support | ✅ Good — generic catch-all |
| `composition` | Part-whole relationship | ✅ Good — structural |
| `solution` | Solution addresses problem | ⚠️ Same name as a node type — confusing |
| `gap` | Knowledge gap identified | ✅ Good — unique and valuable |
| `context` | Contextual relationship | ⚠️ Same name as a node type — confusing |
| `investigation` | Under investigation | ⚠️ Same name as a node type — confusing |

**Concern:** Three edge types share names with node types (`solution`, `context`, `investigation`). This creates ambiguity — does `type: "solution"` on an edge mean the edge is of solution type, or that it connects to a solution node? Recommend renaming edge types to verb forms: `solution` → `addresses`, `context` → `contextualizes`, `investigation` → `investigates`.

### 7.3 Metadata Completeness

| Metadata | Node Support | Edge Support | Best Practice |
|----------|-------------|-------------|---------------|
| Label | ✅ Required | ✅ Required | ✅ |
| Type | ✅ Required | ✅ Required | ✅ |
| Confidence | ✅ Optional | ❌ Missing | Both needed |
| Citation/Source | ❌ Missing (in `sources` via topics) | ⚠️ Single string | Multi-source array |
| Temporal validity | ❌ Missing | ❌ Missing | Both needed |
| Creation timestamp | ❌ Missing | ❌ Missing | Both needed |
| Numeric weight/score | ❌ Missing | ❌ Missing | Useful for ranking |
| Provenance chain | ❌ Missing | ❌ Missing | Links to evidence |
| Qualifiers/context | ❌ Missing | ❌ Missing | Wikidata-style |

### 7.4 Strengths of the Current Schema

1. **Topic coverage validation** — the requirement that every non-domain node has a topic entry ensures content completeness. This is unusual and valuable.
2. **Typed nodes and edges** — the closed type system prevents garbage types and enables frontend rendering.
3. **Simple, flat JSON** — no nesting complexity, easy to serialize/deserialize, easy for LLMs to generate.
4. **Severity and confidence on nodes** — these fields, while basic, provide the infrastructure for richer metadata.
5. **Citation on edges** — acknowledges provenance even if currently minimal.
6. **Investigation nodes** — explicitly modeling uncertainty and disputed claims is a significant design strength that many KG systems lack.
7. **`buildNode`/`buildEdge` builder functions** — enforce schema at construction time, not just at validation.

### 7.5 Weaknesses of the Current Schema

1. **No edge-level confidence** — the strength of a relationship cannot be expressed
2. **Single citation per edge** — cannot represent multi-source corroboration
3. **No temporal dimension** — no creation time, no validity period, no version history
4. **No provenance chain** — cannot trace a fact back through evidence → investigation → adjudication
5. **No edge type constraints** — any node type can connect to any other via any edge type
6. **Name collisions** — three edge types share names with node types
7. **No schema extensibility** — adding a new node or edge type requires code changes
8. **UPPERCASE label forcing** — `label.toUpperCase()` in `buildNode` and `buildEdge` prevents mixed-case labels needed for proper nouns, chemical names, etc.
9. **No graph-level metadata** — the graph object has no metadata about when it was created, what topic it covers, what pipeline version produced it, or what confidence distribution it contains

---

## 8. Specific Recommendations

### 8.1 High Priority (Immediate Impact)

**R1. Add graph-level metadata:**
```javascript
{
  meta: {
    topic: "PFAS Contamination",
    projectId: "abc-123",
    createdAt: "2026-02-21T14:30:00Z",
    pipelineVersion: "1.0",
    confidenceDistribution: { verified: 5, plausible: 12, unverified: 3, disputed: 1 },
    nodeCount: 21,
    edgeCount: 35,
    topicCoverage: "100%"
  },
  nodes: [...],
  edges: [...],
  topics: {...}
}
```

**R2. Add numeric confidence scores (0–1) alongside categorical labels:**
Keep the categorical labels for human readability but add a numeric score for computational use. Map: verified=0.85–1.0, plausible=0.5–0.84, unverified=0.2–0.49, disputed=0.05–0.19.

**R3. Add parent reference validation in `validateGraph()`:**
Check that all `parent` fields point to existing node IDs. This is a one-line addition to the existing validation function.

**R4. Add edge type constraint validation:**
Define valid source→target node type pairs for each edge type and validate in `validateGraph()`.

### 8.2 Medium Priority (Schema Enhancement)

**R5. Rename overlapping edge types:**
`solution` → `addresses`, `context` → `contextualizes`, `investigation` → `investigates`. Update `VALID_EDGE_TYPES` and pipeline prompts accordingly.

**R6. Add edge-level confidence and weight:**
Extend `buildEdge` to accept optional `confidence` (0–1) and `weight` (number of supporting sources).

**R7. Add creation timestamps:**
Add `createdAt` to both `buildNode` and `buildEdge`, defaulting to `new Date().toISOString()`.

**R8. Extend citation model to multi-source:**
Change `citation` on edges from a string to an array of citation objects: `[{ text, url, pmid, year, reliability }]`. Maintain backward compatibility by accepting either format in validation.

### 8.3 Lower Priority (Future Enhancement)

**R9. Add provenance linking:**
Store `evidenceIds` on nodes, referencing the evidence items from the adjudication phase that contributed to the node's creation.

**R10. Add temporal validity:**
Add optional `validFrom` and `validUntil` fields to nodes. Guide synthesis workers to extract temporal scope from evidence.

**R11. Add qualifier support to edges:**
Extend edges with an optional `qualifiers` object for structured metadata (mechanism, population, dose-response, etc.).

**R12. Add graph-level topology metrics:**
Compute and store density, average degree, connected components, and diameter in graph metadata. Use as validation gates (e.g., reject graphs with >1 connected component).

**R13. Add schema extensibility mechanism:**
Allow custom node and edge types by moving type definitions from code constants to a configurable schema file. The validation function would load valid types from configuration rather than hardcoded sets.

**R14. Consider removing UPPERCASE forcing:**
Replace `label.toUpperCase()` with a convention documented in pipeline prompts. This preserves proper casing for chemical names (e.g., "PFAS" vs "Bisphenol A"), brand names, and proper nouns.

---

## 9. Open Questions

1. **Should ResearchLab graphs be mergeable?** Currently each project produces an independent graph. Cross-project knowledge integration would require entity resolution (matching nodes across graphs), conflict resolution, and a unified namespace.

2. **Is RDF interoperability needed?** The current JSON property graph is simpler to work with but cannot be queried with SPARQL or integrated with linked data ecosystems. A JSON-LD context could provide RDF compatibility without changing the data model.

3. **Should confidence decay over time?** A fact verified in 2023 may be less reliable in 2026. Time-based confidence decay would require a decay function and a re-verification mechanism.

4. **How should the graph handle retracted claims?** Currently, RETRACTED evidence is excluded entirely. Should retracted claims be preserved with annotations (as Wikidata does with deprecated rank) to prevent re-discovery of debunked information?

5. **Should edge types be further differentiated?** The current `causation` type covers direct causes, contributing factors, correlations, and risk factors. Differentiating these (as medical ontologies like SNOMED CT do) would add precision at the cost of complexity.

---

## Sources

- [Ontology, Taxonomy, and Graph Standards: OWL, RDF, RDFS, SKOS](https://medium.com/@jaywang.recsys/ontology-taxonomy-and-graph-standards-owl-rdf-rdfs-skos-052db21a6027)
- [Knowledge Graph: Practical Guide Across RDF and Property Graphs](https://taewoon.kim/2025-10-06-knowledge-graph/)
- [RDF vs. Property Graphs (Neo4j)](https://neo4j.com/blog/knowledge-graph/rdf-vs-property-graphs-knowledge-graphs/)
- [Property Graph vs RDF (PuppyGraph)](https://www.puppygraph.com/blog/property-graph-vs-rdf)
- [Wikidata Data Model](https://www.wikidata.org/wiki/Wikidata:Data_model)
- [Wikidata Properties](https://www.wikidata.org/wiki/Help:Properties)
- [Ontology-Grounded KG Construction under Wikidata Schema](https://arxiv.org/html/2412.20942v1)
- [Google Enterprise KG Overview](https://docs.cloud.google.com/enterprise-knowledge-graph/docs/overview)
- [Google Enterprise KG Confidence Scores](https://cloud.google.com/enterprise-knowledge-graph/docs/confidence-score)
- [OpenAlex Entity Overview](https://docs.openalex.org/api-entities/entities-overview)
- [Microsoft Academic Knowledge Graph](https://www.researchgate.net/publication/336594090_The_Microsoft_Academic_Knowledge_Graph)
- [KG Quality Survey (Semantic Scholar)](https://www.semanticscholar.org/paper/Knowledge-Graph-Quality-Management:-A-Comprehensive-Xue-Zou/ae5b587fb5ff55c074a770acf81c27d9d3046748)
- [Quality Metrics Overview (AAAI)](https://ojs.aaai.org/index.php/AAAI-SS/article/download/36888/39026/40965)
- [KG Completeness Systematic Review (HAL)](https://hal.science/hal-03621495v1/file/Knowledge_Graph_Completeness_A_Systematic_Literature_Review.pdf)
- [Dynamic KG Evaluation (TechRxiv)](https://www.techrxiv.org/users/791451/articles/1070833/master/file/data/Dynamic_KG_Evaluation_FINAL/Dynamic_KG_Evaluation_FINAL.pdf)
- [SKOS W3C Reference](https://www.w3.org/TR/skos-reference/)
- [SKOS Overview (ISKO)](https://www.isko.org/cyclo/skos.htm)
- [Dublin Core Metadata Basics](https://www.dublincore.org/resources/metadata-basics/)
- [DCMI Terms](https://www.dublincore.org/specifications/dublin-core/dcmi-terms/)
- [PROV-O W3C Recommendation](https://www.w3.org/TR/prov-o/)
- [Full Traceability for KGs (FOIS 2024)](https://www.utwente.nl/en/eemcs/fois2024/resources/papers/dibowski-full-traceability-and-provenance-for-knowledge-graphs.pdf)
- [PAV Ontology: Provenance, Authoring, Versioning (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4177195/)
- [Uncertainty Management in KG Construction (Survey)](https://arxiv.org/html/2405.16929v2)
- [ConVer-G: Concurrent KG Versioning](https://arxiv.org/html/2409.04499v1)
- [Temporal Conflict Resolution (TeCoRe)](https://www.vldb.org/pvldb/vol10/p1929-schoenfisch.pdf)
- [Temporal Agents with Knowledge Graphs (OpenAI)](https://developers.openai.com/cookbook/examples/partners/temporal_agents_with_knowledge_graphs/temporal_agents/)
- [Local Patterns to Global Architectures (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4970514/)
- [LeanRAG: Hierarchical Knowledge Graph Retrieval](https://arxiv.org/html/2508.10391v1)
- [Context Graph Architecture (Datafloq)](https://datafloq.com/context-graph-the-next-evolution-in-knowledge-graph-architecture/)
- [Knowledge Graph Schema Design Patterns (TerminusDB)](https://terminusdb.com/blog/knowledge-graph-schema-design/)
- [How to Build a Knowledge Graph (Neo4j)](https://neo4j.com/blog/knowledge-graph/how-to-build-knowledge-graph/)
- [Data Provenance (Diffbot)](https://blog.diffbot.com/knowledge-graph-glossary/data-provenance/)
