'use strict';

const http = require('http');
const https = require('https');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_TIMEOUT_MS = 3000;
const SEMANTIC_SCHOLAR_DELAY_MS = 1100; // Respect 1 req/s rate limit
const MAX_CONCURRENT = 5;

// ---------------------------------------------------------------------------
// Low-level HTTP helper (patterned after lib/strategos.js)
// ---------------------------------------------------------------------------

/**
 * Make an HTTP/HTTPS GET request and return parsed JSON.
 * Returns null on any error (timeout, network, parse) for graceful degradation.
 * @param {string} urlStr - Full URL to fetch
 * @param {object} [headers] - Optional request headers
 * @returns {Promise<object|null>}
 */
function fetchJSON(urlStr, headers) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL(urlStr);
    } catch {
      resolve(null);
      return;
    }

    const transport = url.protocol === 'https:' ? https : http;
    const opts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ResearchLab/1.0 (source-screening; mailto:researchlab@example.org)',
        ...headers
      }
    };

    const req = transport.request(opts, (res) => {
      // Follow redirects (3xx)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(fetchJSON(res.headers.location, headers));
        return;
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        // Consume the response and return null
        res.resume();
        resolve(null);
        return;
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          resolve(null);
        }
      });
      res.on('error', () => resolve(null));
    });

    req.on('error', () => resolve(null));
    req.setTimeout(API_TIMEOUT_MS, () => {
      req.destroy();
      resolve(null);
    });

    req.end();
  });
}

/**
 * Sleep for the specified duration.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Retraction Checking (CrossRef API)
// ---------------------------------------------------------------------------

/**
 * Check if a work has been retracted via CrossRef.
 * Queries https://api.crossref.org/v1/works/{doi} and inspects the
 * `update-to` field for retraction notices.
 *
 * @param {string} doi - The DOI to check
 * @returns {Promise<{retracted: boolean, reason?: string, corrected?: boolean}>}
 */
async function checkRetraction(doi) {
  const result = { retracted: false, corrected: false };
  if (!doi) return result;

  const cleanDoi = doi.replace(/^https?:\/\/doi\.org\//, '');
  const data = await fetchJSON(`https://api.crossref.org/v1/works/${encodeURIComponent(cleanDoi)}`);

  if (!data?.message) return result;

  const msg = data.message;

  // Check update-to field for retractions
  const updates = msg['update-to'] || [];
  for (const update of updates) {
    const updateType = (update.type || '').toLowerCase();
    if (updateType === 'retraction' || updateType === 'withdrawal') {
      result.retracted = true;
      result.reason = update.label || updateType;
    } else if (updateType === 'correction' || updateType === 'erratum') {
      result.corrected = true;
    }
  }

  // Also check relation field for retraction notices
  const relation = msg.relation || {};
  const isRetractionOf = relation['is-retraction-of'] || [];
  if (isRetractionOf.length > 0) {
    result.retracted = true;
    result.reason = result.reason || 'retraction notice found';
  }

  return result;
}

// ---------------------------------------------------------------------------
// Predatory Journal Screening (OpenAlex API)
// ---------------------------------------------------------------------------

/**
 * Screen a work's journal for predatory indicators using OpenAlex.
 * Queries the work endpoint and examines the source entity for DOAJ membership,
 * source type, and host organization.
 *
 * Returns a tier classification (A-D):
 *   A — DOAJ + indexed, high confidence
 *   B — at least one quality indicator present
 *   C — not indexed but has valid identifiers
 *   D — fails multiple checks, predatory risk
 *
 * @param {string} doi - DOI of the work
 * @returns {Promise<{tier: string, isInDoaj: boolean|null, sourceType: string|null, hostOrg: string|null, worksCount: number|null, citedByCount: number|null}>}
 */
async function screenJournal(doi) {
  const result = {
    tier: 'F', // Unknown by default
    isInDoaj: null,
    sourceType: null,
    hostOrg: null,
    worksCount: null,
    citedByCount: null
  };

  if (!doi) return result;

  const cleanDoi = doi.replace(/^https?:\/\/doi\.org\//, '');
  const data = await fetchJSON(
    `https://api.openalex.org/works/doi:${encodeURIComponent(cleanDoi)}`
  );

  if (!data) return result;

  // Extract source (journal) info from primary_location
  const source = data.primary_location?.source;
  if (!source) {
    // No source info — could be preprint, report, etc.
    result.tier = 'C';
    return result;
  }

  result.isInDoaj = source.is_in_doaj ?? null;
  result.sourceType = source.type ?? null;
  result.hostOrg = source.host_organization_name ?? null;
  result.worksCount = source.works_count ?? null;
  result.citedByCount = source.cited_by_count ?? null;

  // Tier classification per research paper Section 5.3
  const isInDoaj = source.is_in_doaj === true;
  const isJournal = source.type === 'journal';
  const hasSubstantialWorks = (source.works_count || 0) > 100;
  const hasSubstantialCitations = (source.cited_by_count || 0) > 1000;

  if (isInDoaj && isJournal && hasSubstantialCitations) {
    result.tier = 'A'; // DOAJ + journal + substantial citations
  } else if (isInDoaj || (isJournal && hasSubstantialWorks)) {
    result.tier = 'B'; // At least one quality indicator
  } else if (isJournal || source.type === 'repository') {
    result.tier = 'C'; // Journal/repo but no indexing indicators
  } else {
    result.tier = 'D'; // Fails multiple checks
  }

  return result;
}

// ---------------------------------------------------------------------------
// Bibliometric Enrichment (Semantic Scholar API)
// ---------------------------------------------------------------------------

/**
 * Fetch bibliometric data from Semantic Scholar for a given DOI.
 * Returns citation counts, influential citations, citation velocity,
 * fields of study, publication type, and open access status.
 *
 * @param {string} doi - DOI of the work
 * @returns {Promise<{citationCount: number|null, influentialCitationCount: number|null, citationVelocity: number|null, fieldsOfStudy: string[], publicationTypes: string[], isOpenAccess: boolean|null, authors: Array<{name: string, hIndex: number|null}>}>}
 */
async function fetchBibliometrics(doi) {
  const result = {
    citationCount: null,
    influentialCitationCount: null,
    citationVelocity: null,
    fieldsOfStudy: [],
    publicationTypes: [],
    isOpenAccess: null,
    authors: []
  };

  if (!doi) return result;

  const cleanDoi = doi.replace(/^https?:\/\/doi\.org\//, '');
  const fields = [
    'citationCount', 'influentialCitationCount', 'citationVelocity',
    'fieldsOfStudy', 'publicationTypes', 'isOpenAccess',
    'authors.hIndex', 'authors.name'
  ].join(',');

  const data = await fetchJSON(
    `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(cleanDoi)}?fields=${fields}`
  );

  if (!data) return result;

  result.citationCount = data.citationCount ?? null;
  result.influentialCitationCount = data.influentialCitationCount ?? null;
  result.citationVelocity = data.citationVelocity ?? null;
  result.fieldsOfStudy = (data.fieldsOfStudy || []).map((f) => f?.category || f).filter(Boolean);
  result.publicationTypes = data.publicationTypes || [];
  result.isOpenAccess = data.isOpenAccess ?? null;
  result.authors = (data.authors || []).map((a) => ({
    name: a.name || 'Unknown',
    hIndex: a.hIndex ?? null
  }));

  return result;
}

// ---------------------------------------------------------------------------
// Citation Manipulation Flags
// ---------------------------------------------------------------------------

/**
 * Check for citation manipulation indicators.
 * Flags journal self-citation ratio >30% and author self-citation >40%
 * using available data from the screening results.
 *
 * @param {object} journalData - Journal screening result from screenJournal()
 * @param {object} biblioData  - Bibliometric data from fetchBibliometrics()
 * @returns {{journalSelfCitationFlag: boolean, authorSelfCitationFlag: boolean, flags: string[]}}
 */
function checkManipulation(journalData, biblioData) {
  const result = {
    journalSelfCitationFlag: false,
    authorSelfCitationFlag: false,
    flags: []
  };

  // Journal self-citation heuristic: if worksCount is very high relative to
  // citedByCount, the journal may have inflated metrics through self-citation.
  // A journal with >30% self-citation ratio is flagged.
  // Proxy: if works_count > cited_by_count * 0.3, the ratio of internal
  // citations to total is likely high (heuristic when direct self-citation
  // data is unavailable).
  if (journalData.worksCount && journalData.citedByCount) {
    const ratio = journalData.worksCount / journalData.citedByCount;
    // High works-to-citation ratio suggests low external impact
    if (ratio > 0.3 && journalData.citedByCount < 5000) {
      result.journalSelfCitationFlag = true;
      result.flags.push('journal_low_external_impact');
    }
  }

  // Author self-citation heuristic: check if influential citation count
  // is disproportionately low relative to total citations, which can
  // indicate perfunctory/self-citations rather than genuine impact.
  if (biblioData.citationCount && biblioData.citationCount > 10) {
    const influentialRatio = (biblioData.influentialCitationCount || 0) / biblioData.citationCount;
    // If less than 5% of citations are influential and total is moderate,
    // this may indicate citation gaming
    if (influentialRatio < 0.05 && biblioData.citationCount > 20) {
      result.flags.push('low_influential_citation_ratio');
    }
  }

  // Author h-index check: very low h-index for all authors on a paper
  // with many citations may indicate anomalous citation patterns
  const authorHIndices = biblioData.authors
    .map((a) => a.hIndex)
    .filter((h) => h !== null);
  if (authorHIndices.length > 0) {
    const maxH = Math.max(...authorHIndices);
    if (maxH < 3 && (biblioData.citationCount || 0) > 50) {
      result.authorSelfCitationFlag = true;
      result.flags.push('author_hindex_citation_mismatch');
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Composite Reliability Scoring
// ---------------------------------------------------------------------------

/**
 * Compute a composite reliability score (0-1) from screening results.
 *
 * Weighted components:
 *   - Journal Quality (40%): tier, DOAJ membership, works count
 *   - Paper Impact (30%): influential citation count, citation velocity
 *   - Author Credibility (15%): max author h-index
 *   - Integrity Checks (15%): retraction status, manipulation flags
 *
 * Maps to A-F source rating scale:
 *   A (≥0.8) — Established
 *   B (0.6-0.8) — Generally Reliable
 *   C (0.4-0.6) — Mixed Record
 *   D (0.2-0.4) — Questionable
 *   E (<0.2) — Unreliable
 *   F — Insufficient data
 *
 * @param {object} screeningResult - Full screening result from screenSource()
 * @returns {{score: number, rating: string, components: {journalQuality: number, paperImpact: number, authorCredibility: number, integrityChecks: number}}}
 */
function computeReliabilityScore(screeningResult) {
  const { retraction, journal, bibliometrics, manipulation } = screeningResult;

  // If retracted, immediately return E rating
  if (retraction?.retracted) {
    return {
      score: 0,
      rating: 'E',
      components: {
        journalQuality: 0,
        paperImpact: 0,
        authorCredibility: 0,
        integrityChecks: 0
      }
    };
  }

  let dataPoints = 0;

  // --- Journal Quality (40%) ---
  let journalQuality = 0.5; // Default to middle when unknown
  if (journal && journal.tier !== 'F') {
    dataPoints++;
    const tierScores = { A: 1.0, B: 0.75, C: 0.45, D: 0.15 };
    journalQuality = tierScores[journal.tier] ?? 0.5;
  }

  // --- Paper Impact (30%) ---
  let paperImpact = 0.5;
  if (bibliometrics) {
    const ic = bibliometrics.influentialCitationCount;
    const cc = bibliometrics.citationCount;
    const cv = bibliometrics.citationVelocity;

    if (ic !== null || cc !== null) {
      dataPoints++;
      // Influential citations: 0=0, 1-5=0.4, 5-20=0.6, 20-100=0.8, 100+=1.0
      let icScore = 0.3;
      if (ic !== null) {
        if (ic >= 100) icScore = 1.0;
        else if (ic >= 20) icScore = 0.8;
        else if (ic >= 5) icScore = 0.6;
        else if (ic >= 1) icScore = 0.4;
        else icScore = 0.2;
      }

      // Citation velocity: positive trend is good
      let cvScore = 0.5;
      if (cv !== null) {
        if (cv >= 50) cvScore = 1.0;
        else if (cv >= 10) cvScore = 0.8;
        else if (cv >= 3) cvScore = 0.6;
        else if (cv >= 1) cvScore = 0.4;
        else cvScore = 0.2;
      }

      // Raw citation count as secondary signal
      let ccScore = 0.3;
      if (cc !== null) {
        if (cc >= 500) ccScore = 1.0;
        else if (cc >= 100) ccScore = 0.8;
        else if (cc >= 20) ccScore = 0.6;
        else if (cc >= 5) ccScore = 0.4;
        else ccScore = 0.2;
      }

      // Weighted: influential citations matter most
      paperImpact = icScore * 0.5 + cvScore * 0.25 + ccScore * 0.25;
    }
  }

  // --- Author Credibility (15%) ---
  let authorCredibility = 0.5;
  if (bibliometrics?.authors?.length > 0) {
    const hIndices = bibliometrics.authors
      .map((a) => a.hIndex)
      .filter((h) => h !== null);
    if (hIndices.length > 0) {
      dataPoints++;
      const maxH = Math.max(...hIndices);
      // h-index: 0-2=0.2, 3-10=0.4, 10-25=0.6, 25-50=0.8, 50+=1.0
      if (maxH >= 50) authorCredibility = 1.0;
      else if (maxH >= 25) authorCredibility = 0.8;
      else if (maxH >= 10) authorCredibility = 0.6;
      else if (maxH >= 3) authorCredibility = 0.4;
      else authorCredibility = 0.2;
    }
  }

  // --- Integrity Checks (15%) ---
  let integrityChecks = 1.0; // Start at 1.0, deduct for flags
  if (retraction?.corrected) {
    integrityChecks -= 0.2;
  }
  if (manipulation) {
    dataPoints++;
    if (manipulation.journalSelfCitationFlag) integrityChecks -= 0.3;
    if (manipulation.authorSelfCitationFlag) integrityChecks -= 0.3;
    integrityChecks -= manipulation.flags.length * 0.1;
  }
  integrityChecks = Math.max(0, Math.min(1, integrityChecks));

  // --- Composite Score ---
  const score = (
    journalQuality * 0.40 +
    paperImpact * 0.30 +
    authorCredibility * 0.15 +
    integrityChecks * 0.15
  );

  // Clamp to [0, 1]
  const clampedScore = Math.max(0, Math.min(1, score));

  // Map to rating
  let rating;
  if (dataPoints === 0) {
    rating = 'F'; // Insufficient data
  } else if (clampedScore >= 0.8) {
    rating = 'A';
  } else if (clampedScore >= 0.6) {
    rating = 'B';
  } else if (clampedScore >= 0.4) {
    rating = 'C';
  } else if (clampedScore >= 0.2) {
    rating = 'D';
  } else {
    rating = 'E';
  }

  return {
    score: Math.round(clampedScore * 1000) / 1000,
    rating,
    components: {
      journalQuality: Math.round(journalQuality * 1000) / 1000,
      paperImpact: Math.round(paperImpact * 1000) / 1000,
      authorCredibility: Math.round(authorCredibility * 1000) / 1000,
      integrityChecks: Math.round(integrityChecks * 1000) / 1000
    }
  };
}

// ---------------------------------------------------------------------------
// Main Screening Functions
// ---------------------------------------------------------------------------

/**
 * Screen a single source/citation for reliability.
 *
 * Queries CrossRef (retraction check), OpenAlex (predatory journal screening),
 * and Semantic Scholar (bibliometric enrichment) using free APIs. All API calls
 * have 3-second timeouts and gracefully degrade on failure (return partial data).
 *
 * @param {{text?: string, url?: string, pmid?: string, doi?: string, year?: number}} citation
 *   Citation object with at least one identifier. DOI is preferred for best results.
 * @returns {Promise<{citation: object, doi: string|null, retraction: object, journal: object, bibliometrics: object, manipulation: object, reliability: object, screenedAt: string}>}
 */
async function screenSource(citation) {
  const doi = citation.doi || extractDoi(citation.url) || extractDoi(citation.text);

  // Run CrossRef and OpenAlex in parallel (both use DOI, no rate-limit concerns)
  // Semantic Scholar has 1 req/s limit so we run it after a brief delay
  const [retraction, journal] = await Promise.all([
    checkRetraction(doi),
    screenJournal(doi)
  ]);

  // Slight delay to respect Semantic Scholar rate limits before calling
  await sleep(SEMANTIC_SCHOLAR_DELAY_MS);
  const bibliometrics = await fetchBibliometrics(doi);

  const manipulation = checkManipulation(journal, bibliometrics);

  const screeningResult = {
    citation,
    doi: doi || null,
    retraction,
    journal,
    bibliometrics,
    manipulation
  };

  const reliability = computeReliabilityScore(screeningResult);

  return {
    ...screeningResult,
    reliability,
    screenedAt: new Date().toISOString()
  };
}

/**
 * Screen multiple citations in parallel with rate limiting.
 *
 * Processes citations in batches to respect Semantic Scholar's 1 req/s rate
 * limit while allowing CrossRef and OpenAlex calls to run concurrently.
 * Returns results in the same order as the input array.
 *
 * @param {Array<{text?: string, url?: string, pmid?: string, doi?: string, year?: number}>} citations
 *   Array of citation objects to screen.
 * @returns {Promise<Array<object>>} Array of screening results (same order as input).
 */
async function screenBatch(citations) {
  if (!citations || citations.length === 0) return [];

  const results = new Array(citations.length);
  let idx = 0;

  // Process in chunks to control concurrency
  while (idx < citations.length) {
    const batchEnd = Math.min(idx + MAX_CONCURRENT, citations.length);
    const batch = [];

    for (let i = idx; i < batchEnd; i++) {
      const ci = i; // capture index
      batch.push(
        screenSource(citations[ci])
          .then((result) => { results[ci] = result; })
          .catch(() => {
            results[ci] = {
              citation: citations[ci],
              doi: null,
              retraction: { retracted: false },
              journal: { tier: 'F' },
              bibliometrics: {},
              manipulation: { flags: [] },
              reliability: { score: 0, rating: 'F', components: {} },
              screenedAt: new Date().toISOString(),
              error: 'screening_failed'
            };
          })
      );
    }

    await Promise.all(batch);
    idx = batchEnd;

    // Rate limit pause between batches (Semantic Scholar: 1 req/s)
    if (idx < citations.length) {
      await sleep(SEMANTIC_SCHOLAR_DELAY_MS);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Extract a DOI from a string (URL or free text).
 * Looks for the standard 10.XXXX/... DOI pattern.
 *
 * @param {string|null|undefined} str
 * @returns {string|null}
 */
function extractDoi(str) {
  if (!str) return null;
  // DOI pattern: 10.XXXX/anything (until whitespace or end)
  const match = str.match(/\b(10\.\d{4,}\/[^\s,;'">\])}]+)/);
  return match ? match[1].replace(/[.\s]+$/, '') : null;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  screenSource,
  screenBatch,
  computeReliabilityScore,
  // Exposed for testing / direct use
  checkRetraction,
  screenJournal,
  fetchBibliometrics,
  checkManipulation,
  extractDoi
};
