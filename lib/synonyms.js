'use strict';

/**
 * Shared synonym / related-terms map for common research domains.
 * Each group is a set of terms that should match each other.
 *
 * Used by both lib/sources.js (source matching) and
 * lib/research-index.js (research index search).
 */
const SYNONYM_GROUPS = [
  ['skincare', 'dermatology', 'skin', 'skin-health', 'complexion', 'epidermis'],
  ['water', 'contamination', 'pollution', 'water-quality', 'waterborne', 'wastewater'],
  ['nutrition', 'diet', 'food', 'dietary', 'nutrient', 'macronutrient', 'micronutrient'],
  ['health', 'wellness', 'wellbeing', 'well-being', 'medical', 'medicine', 'healthcare'],
  ['climate', 'global-warming', 'greenhouse', 'carbon', 'emissions', 'climate-change'],
  ['ai', 'artificial-intelligence', 'machine-learning', 'ml', 'deep-learning', 'neural-network'],
  ['cybersecurity', 'security', 'infosec', 'cyber', 'hacking', 'vulnerability'],
  ['genetics', 'genomics', 'dna', 'gene', 'genome', 'hereditary', 'genetic'],
  ['psychology', 'mental-health', 'cognition', 'cognitive', 'behavioral', 'psychiatric'],
  ['energy', 'renewable', 'solar', 'wind', 'battery', 'electricity', 'power-generation'],
  ['education', 'learning', 'pedagogy', 'teaching', 'curriculum', 'academic'],
  ['economy', 'economics', 'economic', 'finance', 'financial', 'market', 'fiscal'],
  ['environment', 'ecology', 'ecological', 'ecosystem', 'biodiversity', 'conservation'],
  ['agriculture', 'farming', 'crop', 'soil', 'irrigation', 'agronomy'],
  ['pharmaceutical', 'drug', 'medication', 'pharma', 'therapeutic', 'treatment'],
  ['technology', 'tech', 'digital', 'computing', 'software', 'hardware'],
];

// Build a fast lookup: token → Set of related tokens
const SYNONYM_MAP = new Map();
for (const group of SYNONYM_GROUPS) {
  for (const term of group) {
    const lower = term.toLowerCase();
    if (!SYNONYM_MAP.has(lower)) SYNONYM_MAP.set(lower, new Set());
    for (const related of group) {
      SYNONYM_MAP.get(lower).add(related.toLowerCase());
    }
  }
}

/**
 * Expand a single token into itself plus all known synonyms.
 */
function expandToken(token) {
  const expanded = new Set([token]);
  const related = SYNONYM_MAP.get(token);
  if (related) {
    for (const r of related) expanded.add(r);
  }
  return expanded;
}

module.exports = { SYNONYM_GROUPS, SYNONYM_MAP, expandToken };
