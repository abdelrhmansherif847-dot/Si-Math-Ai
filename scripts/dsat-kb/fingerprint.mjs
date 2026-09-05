// Fingerprints for the DSAT Question Knowledge Base.
//
// Two fingerprints, because two different questions get asked of the corpus:
//
//   structural   — what SHAPE is this item? representation, what is asked, how
//                  it is answered, what stimulus carries it, which mechanisms
//                  are load-bearing. Two items with the same structural
//                  fingerprint pose the same kind of demand.
//
//   mathematical — what OBJECT is this item about? the schematic relations with
//                  their numerals erased, the roles of what is given and asked.
//                  Two items with the same mathematical fingerprint are the
//                  same construction, whatever numbers were printed.
//
// The second is the one that matters for diversity. "Same construction with
// changed numbers" is the commonest form of hidden repetition in an item bank,
// and it is invisible to any hash of the text. Erasing numerals is what makes
// it visible.
//
// NEITHER FINGERPRINT TOUCHES QUESTION TEXT. They are computed from the coded
// record only, so a fingerprint can live in a public repository while the item
// it identifies does not.

import { createHash } from 'node:crypto';

export const FINGERPRINT_BYTES = 8;   // 16 hex chars — ample for a corpus of this size

// Canonical JSON: keys sorted, arrays sorted, so equal content hashes equal
// however it was written down.
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).sort().join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

const hash = s => createHash('sha256').update(s).digest('hex').slice(0, FINGERPRINT_BYTES * 2);

// Numerals become '#', so 3x + 7 = 22 and 5x + 2 = 17 collide. Decimal points
// and signs are kept: 0.5 and 5 are different constructions, and −x differs
// from x. Repeated digits collapse to one '#' so 22 and 7 collide too.
export function eraseNumerals(s) {
  return String(s).replace(/\d+(\.\d+)?/g, m => (m.includes('.') ? '#.#' : '#'));
}

// ── structural ───────────────────────────────────────────────────────────────
export function structuralTuple(rec) {
  return {
    representation: rec.representation ?? null,
    representation_transition: rec.representation_transition ?? null,
    target_type: rec.target_type ?? null,
    answer_structure: rec.answer_structure ?? null,
    stimulus_type: rec.stimulus_type ?? null,
    // Only load-bearing mechanisms shape the demand. A mechanism that is
    // present but not load-bearing is noise for this purpose.
    mechanisms: (rec.reasoning_mechanisms ?? [])
      .filter(m => m.load_bearing).map(m => m.id).sort(),
    distractor_kinds: [...new Set((rec.distractor_logic ?? [])
      .map(d => d.category).filter(c => c && c !== 'unknown'))].sort(),
  };
}
export const structuralFingerprint = rec => hash('S1|' + canonical(structuralTuple(rec)));

// ── mathematical ─────────────────────────────────────────────────────────────
export function mathematicalTuple(sig = {}) {
  return {
    objects: [...(sig.objects ?? [])].sort(),
    relations: [...(sig.relations ?? [])].map(eraseNumerals).sort(),
    given_roles: [...(sig.given_roles ?? [])].sort(),
    asked_role: sig.asked_role ?? null,
    constraints: [...(sig.constraints ?? [])].sort(),
    // numeric_profile is deliberately EXCLUDED: it describes the numbers, and
    // this fingerprint exists to see past them.
  };
}
export const mathematicalFingerprint = sig => hash('M1|' + canonical(mathematicalTuple(sig)));

// ── similarity, for near-duplicates ──────────────────────────────────────────
// A fingerprint answers "identical?". Near-duplicates need a distance, so each
// record also carries a component set and pairs are scored by Jaccard.
export function components(rec, sig = {}) {
  const t = structuralTuple(rec), m = mathematicalTuple(sig);
  return [...new Set([
    `rep:${t.representation}`, `tgt:${t.target_type}`, `ans:${t.answer_structure}`,
    `stim:${t.stimulus_type}`,
    ...t.mechanisms.map(x => `mech:${x}`),
    ...t.distractor_kinds.map(x => `dis:${x}`),
    ...m.objects.map(x => `obj:${x}`),
    ...m.relations.map(x => `rel:${x}`),
    ...m.given_roles.map(x => `giv:${x}`),
    `ask:${m.asked_role}`,
    ...m.constraints.map(x => `con:${x}`),
  ].filter(x => !/:(null|undefined)$/.test(x)))].sort();
}

export function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

// PROVISIONAL. Both numbers are starting values chosen by judgement, NOT fitted
// against real records — there are none yet. `provisional` names every threshold
// that has not been measured, and `fittedOn` stays null until one is: a validator
// fails if a numeric threshold is neither listed as provisional nor recorded as
// fitted, so these cannot quietly harden into settled constants.
//
// Re-fit once a few hundred records exist and the false-positive rate can be
// measured. Changing a number without recording the fit is the failure this
// guards against.
export const SIMILARITY = {
  nearDuplicate: 0.85,        // same construction, cosmetic differences
  sameArchetypeFamily: 0.65,
  provisional: ['nearDuplicate', 'sameArchetypeFamily'],
  fittedOn: null,             // e.g. { records: 412, date: '…', falsePositiveRate: … }
};

// The numeric thresholds, so a new one cannot be added without being classified.
export const SIMILARITY_THRESHOLDS =
  Object.keys(SIMILARITY).filter(k => typeof SIMILARITY[k] === 'number');

// The relation a pair stands in. Ordered most specific first; the first match
// wins. `renumbered` is the interesting one — identical mathematics, identical
// shape, different printed numbers — and it is exactly what a text hash misses.
export function classifyPair(a, b) {
  const sameS = a.structural_fingerprint === b.structural_fingerprint;
  const sameM = a.mathematical_fingerprint === b.mathematical_fingerprint;
  const sim = jaccard(a.fingerprint_components ?? [], b.fingerprint_components ?? []);
  if (sameS && sameM) return { relation: 'duplicate_or_renumbered', similarity: sim };
  if (sameM) return { relation: 'same_construction_different_shape', similarity: sim };
  if (sameS) return { relation: 'same_shape_different_mathematics', similarity: sim };
  if (sim >= SIMILARITY.nearDuplicate) return { relation: 'near_duplicate', similarity: sim };
  if (sim >= SIMILARITY.sameArchetypeFamily) return { relation: 'same_archetype_family', similarity: sim };
  return { relation: 'distinct', similarity: sim };
}

// Group records into duplicate / near-duplicate sets. Records are GROUPED, never
// dropped: provenance of every copy is the evidence for source-overlap
// measurement later, and deleting one destroys it.
export function groupDuplicates(records) {
  const groups = [];
  for (const rec of records) {
    let placed = false;
    for (const g of groups) {
      const rel = classifyPair(rec, g.exemplar);
      if (rel.relation === 'duplicate_or_renumbered' || rel.relation === 'near_duplicate') {
        g.members.push(rec.question_id); g.relations.push(rel.relation); placed = true; break;
      }
    }
    if (!placed) groups.push({ exemplar: rec, members: [rec.question_id], relations: ['exemplar'] });
  }
  return groups.filter(g => g.members.length > 1)
    .map((g, i) => ({
      group_id: `DG-${String(i + 1).padStart(4, '0')}`,
      members: g.members,
      relation: g.relations.includes('duplicate_or_renumbered') ? 'duplicate_or_renumbered' : 'near_duplicate',
    }));
}
