// Per-record validation for the DSAT Question Knowledge Base.
//
// One implementation, used by both the CI gate and the ingestion pipeline, so a
// record cannot be written by a route that checks less than CI does. That is the
// repository's established single-source rule; a second copy of a check is a
// defect with a delay on it.
//
// The checks are grouped by what they protect:
//   shape        — the record is well formed and its ids resolve
//   vocabulary   — every value comes from a bound enumeration, not free text
//   grounding    — mappings match the published alignment, or raise a conflict
//   support      — a claim carries the evidence its confidence level implies
//   hygiene      — no question text, in any field, ever

import * as S from './schema.mjs';
import { structuralFingerprint, mathematicalFingerprint, components } from './fingerprint.mjs';

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

export function validateRecord(rec, ctx = {}) {
  const { sourceIds = new Set(), archetypeIds = new Set(), seenIds = new Set() } = ctx;
  const bad = [];
  const at = (msg) => bad.push(`${rec.question_id ?? '<no id>'}: ${msg}`);

  // ── shape ──────────────────────────────────────────────────────────────────
  // `undefined` counts as missing even when the key is present: {...rec, x: undefined}
  // sets the key, so hasOwnProperty alone let an explicitly-blanked required
  // field through. The test suite caught that on its first run.
  const blank = v => v === undefined || v === null || v === ''
    || (Array.isArray(v) && v.length === 0 && false);
  for (const f of S.QUESTION_RECORD_FIELDS.required)
    if (!has(rec, f) || blank(rec[f])) at(`missing required field "${f}"`);
  const known = new Set([...S.QUESTION_RECORD_FIELDS.required, ...S.QUESTION_RECORD_FIELDS.optional]);
  for (const k of Object.keys(rec))
    if (!known.has(k)) at(`unknown field "${k}" — extend the schema deliberately, do not smuggle`);

  if (rec.question_id && !S.QUESTION_ID_RE.test(rec.question_id))
    at(`question_id "${rec.question_id}" is not of the form Q-<src>-p<page>-q<n>`);
  if (rec.question_id && seenIds.has(rec.question_id)) at('duplicate question_id');
  if (rec.source_id && !sourceIds.has(rec.source_id))
    at(`source_id "${rec.source_id}" is not in the source registry`);
  if (!Number.isInteger(rec.source_page) || rec.source_page < 1)
    at('source_page must be a positive integer — a record with no page cannot be checked against its source');

  // ── vocabulary ─────────────────────────────────────────────────────────────
  const inEnum = (field, list) => {
    if (has(rec, field) && rec[field] != null && !list.includes(rec[field]))
      at(`${field} "${rec[field]}" is not one of the bound values`);
  };
  inEnum('provenance', S.PROVENANCE_IDS);
  inEnum('knowledge_use', S.KNOWLEDGE_USE);
  inEnum('generation_eligibility', S.GENERATION_ELIGIBILITY);
  inEnum('exam', S.EXAMS);
  inEnum('representation', S.REPRESENTATIONS);
  inEnum('target_type', S.TARGET_TYPES);
  inEnum('answer_structure', S.ANSWER_STRUCTURES);
  inEnum('stimulus_type', S.STIMULUS_TYPES);
  for (const f of ['provenance_confidence', 'archetype_confidence', 'difficulty_confidence', 'kdg_confidence'])
    if (has(rec, f) && rec[f] != null && !S.CONFIDENCE.includes(rec[f]))
      at(`${f} "${rec[f]}" is not one of ${S.CONFIDENCE.join(' / ')}`);

  if (rec.exam && rec.topic && !(S.EXAM_TOPICS[rec.exam] ?? []).includes(rec.topic))
    at(`topic "${rec.topic}" is not a topic of ${rec.exam}`);

  for (const st of rec.taxonomy_subtopics ?? [])
    if (!S.TAXONOMY_SUBTOPICS.includes(st)) at(`taxonomy subtopic "${st}" does not exist in the frozen taxonomy`);
  for (const n of [...(rec.knowledge_nodes ?? []), ...(rec.secondary_knowledge_nodes ?? []), ...(rec.prerequisite_nodes ?? [])])
    if (!S.KDG_NODE_IDS.includes(n)) at(`KDG node "${n}" does not exist`);

  // ── grounding: mappings must match the published alignment or raise a conflict ──
  const conflicts = new Set(rec.conflicts ?? []);
  const taxRow = S.EXAM_TOPIC_TAXONOMY.find(r => r.topic === rec.topic);
  if (taxRow && (rec.taxonomy_subtopics ?? []).length) {
    const allowed = new Set(taxRow.subtopics);
    const strays = (rec.taxonomy_subtopics ?? []).filter(s => !allowed.has(s));
    if (strays.length && !conflicts.has('TOPIC_CLASSIFICATION_CONFLICT'))
      at(`taxonomy subtopics ${strays.join(', ')} are outside the published mapping for "${rec.topic}" ` +
         'and no TOPIC_CLASSIFICATION_CONFLICT is recorded');
  }
  if (taxRow && !taxRow.subtopics.length && (rec.taxonomy_subtopics ?? []).length === 0
      && !conflicts.has('TAXONOMY_CONFLICT'))
    at(`"${rec.topic}" has no taxonomy home; a TAXONOMY_CONFLICT must be recorded on the record`);

  const nodeRow = S.TOPIC_NODE_MAP.find(r => r.topic === rec.topic);
  if (nodeRow && (rec.knowledge_nodes ?? []).length) {
    const allowed = new Set(nodeRow.nodes);
    const invented = (rec.knowledge_nodes ?? []).filter(n => !allowed.has(n));
    if (invented.length && !conflicts.has('KDG_MAPPING_CONFLICT'))
      at(`knowledge nodes ${invented.join(', ')} are not in the published mapping for "${rec.topic}" ` +
         '— that is an invented KDG relationship unless a KDG_MAPPING_CONFLICT is recorded');
  }
  for (const c of rec.conflicts ?? [])
    if (!S.CONFLICT_KINDS.includes(c)) at(`conflict kind "${c}" is not one of the register's kinds`);

  // ── support: a claim needs the evidence its level implies ──────────────────
  if (S.provenanceNeedsEvidence(rec.provenance) && !(rec.provenance_evidence ?? '').trim())
    at(`provenance "${rec.provenance}" requires provenance_evidence — an unknown source is never silently upgraded`);
  if (rec.provenance_confidence === 'UNKNOWN' && S.provenanceRank(rec.provenance) >= 2)
    at('provenance is graded official or released while its confidence is UNKNOWN');

  for (const m of rec.reasoning_mechanisms ?? []) {
    if (S.NOT_MECHANISMS.includes(m.id))
      at(`"${m.id}" is not a reasoning mechanism — step count is a time-budget descriptor (step_count)`);
    else if (!S.MECHANISM_IDS.includes(m.id)) at(`mechanism "${m.id}" is not in the registry`);
    if (m.load_bearing && !(m.counterfactual ?? '').trim())
      at(`mechanism "${m.id}" is marked load-bearing with no counterfactual — ` +
         'load-bearing means removing it changes the reasoning demand, and that has to be said');
  }
  for (const d of rec.distractor_logic ?? []) {
    if (!S.DISTRACTOR_CATEGORIES.includes(d.category)) at(`distractor category "${d.category}" is not in the taxonomy`);
    if (d.category !== 'unknown' && !(d.wrong_route ?? '').trim())
      at(`distractor "${d.option ?? '?'}" names a category without the wrong route that produces it; use "unknown" instead of guessing`);
  }
  const de = rec.difficulty_evidence;
  if (de) {
    if (!S.DIFFICULTY_EVIDENCE_KINDS.includes(de.kind)) at(`difficulty_evidence.kind "${de.kind}" is invalid`);
    if (de.band && !S.DIFFICULTY_BANDS.includes(de.band)) at(`difficulty band "${de.band}" is invalid`);
    if (de.kind === 'UNKNOWN' && de.band && de.band !== 'unknown')
      at(`difficulty band "${de.band}" is asserted while the evidence is UNKNOWN — that is an unsupported difficulty claim`);
    if (de.kind === 'SOURCE-STATED' && !(de.source_statement ?? '').trim())
      at('difficulty is graded SOURCE-STATED with no source statement quoted');
    if (de.kind === 'INFERRED' && !(de.structural_basis ?? '').trim())
      at('difficulty is INFERRED with no structural basis — difficulty is explained by mechanisms, not by counting operations');
  }
  if (rec.generation_eligibility === 'APPROVED' && !(rec.provenance_evidence ?? '').trim())
    at('generation_eligibility APPROVED carries no provenance_evidence — direct use is a recorded decision, not a default');
  if (rec.archetype && !archetypeIds.has(rec.archetype))
    at(`archetype "${rec.archetype}" is not in the archetype registry`);
  if (rec.archetype_confidence === 'UNKNOWN' && rec.archetype && rec.archetype !== 'A-UNCLASSIFIED')
    at('an archetype is named while its confidence is UNKNOWN — use A-UNCLASSIFIED');

  if (rec.stimulus_type && rec.stimulus_type !== 'none' && !rec.stimulus_id)
    at(`stimulus_type "${rec.stimulus_type}" carries no stimulus_id`);
  if (rec.stimulus_type === 'none' && rec.stimulus_id) at('stimulus_id given while stimulus_type is none');

  // ── fingerprints recompute ─────────────────────────────────────────────────
  if (rec.structural_fingerprint) {
    if (!S.FINGERPRINT_RE.test(rec.structural_fingerprint)) at('structural_fingerprint is malformed');
    else if (structuralFingerprint(rec) !== rec.structural_fingerprint)
      at('structural_fingerprint does not match the record it is computed from');
  }
  if (rec.mathematical_fingerprint) {
    if (!S.FINGERPRINT_RE.test(rec.mathematical_fingerprint)) at('mathematical_fingerprint is malformed');
    else if (rec.mathematical_signature
      && mathematicalFingerprint(rec.mathematical_signature) !== rec.mathematical_fingerprint)
      at('mathematical_fingerprint does not match its mathematical_signature');
  }
  if (rec.fingerprint_components && rec.mathematical_signature) {
    const want = components(rec, rec.mathematical_signature);
    if (JSON.stringify(want) !== JSON.stringify([...rec.fingerprint_components].sort()))
      at('fingerprint_components do not match the record');
  }
  // The stored signature must already have its numerals erased, so the actual
  // printed numbers of a copyrighted item never enter the repository.
  // The guard exists to stop an ITEM'S printed numbers entering the repository.
  // 0 and 1 are structural — the 1 in (1 + p) is the growth-factor form, the 0 in
  // (0, v) is a y-intercept — and are not data from any source, so standalone 0
  // and 1 are permitted. Everything else must already be erased. The pilot found
  // this: the strict form rejected the standard exponential schematic itself.
  for (const r of rec.mathematical_signature?.relations ?? []) {
    const stripped = String(r)
      .replace(/\^\d+/g, '')     // exponent notation, e.g. x^2
      .replace(/#/g, '')          // the erase token
      .replace(/\b[01]\b/g, ''); // structural zero and one, standalone only
    if (/\d/.test(stripped))
      at(`mathematical_signature relation "${r}" still carries literal numerals — store the erased schematic only`);
  }

  // ── hygiene: no question text, anywhere ────────────────────────────────────
  for (const f of S.FORBIDDEN_TEXT_FIELDS)
    if (has(rec, f)) at(`field "${f}" is forbidden — question text does not enter this repository`);
  for (const [k, v] of Object.entries(rec)) {
    if (S.looksLikeSourceText(v)) at(`field "${k}" looks like source prose (${String(v).length} chars) — keep text in the corpus`);
    if (Array.isArray(v)) for (const item of v) {
      if (S.looksLikeSourceText(item)) at(`an entry of "${k}" looks like source prose`);
      if (item && typeof item === 'object') for (const [k2, v2] of Object.entries(item))
        if (S.looksLikeSourceText(v2)) at(`"${k}[].${k2}" looks like source prose`);
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k2, v2] of Object.entries(v))
      if (S.looksLikeSourceText(v2)) at(`"${k}.${k2}" looks like source prose`);
  }
  return bad;
}

export function validateArchetype(a, archFields = null) {
  const bad = [];
  const fields = archFields ?? [
    'given', 'find', 'transformation', 'hidden_relationship',
    'representation', 'wrong_route', 'distractor_basis', 'cognitive_demand',
  ];
  if (!S.ARCHETYPE_ID_RE.test(a.archetype_id ?? '')) bad.push(`archetype id "${a.archetype_id}" is malformed`);
  for (const f of fields)
    if (!(a[f] ?? '').toString().trim())
      bad.push(`${a.archetype_id}: missing "${f}" — an archetype is a construction, and all eight parts are the construction`);
  // The whole point of §7 of the brief: an archetype must not be a topic label.
  const surface = [...S.EXAM_TOPICS.DSAT, ...S.EXAM_TOPICS.ST1,
    ...Object.values(S.TAXONOMY_SUBTOPIC_NAME), ...Object.values(S.KDG_NODE_NAME)]
    .map(x => x.toLowerCase());
  if (surface.includes((a.label ?? '').trim().toLowerCase()))
    bad.push(`${a.archetype_id}: label "${a.label}" is a topic name, not a construction (brief §7)`);
  return bad;
}
