// EST series diversity ledger.
//
// A single form can be individually authentic and a series of 25 can still be
// obviously machine-made. What a student notices across 25 forms is not a
// domain weight — it is a question they have already answered, a scenario they
// have already read, and a form that moves through its topics in the order the
// last one did. This module is what makes that checkable.
//
// It is a PURE AUDITOR: it takes the forms and returns findings. It stores
// nothing, mutates nothing, and reaches no network. tests/est-series-ledger.test.mjs
// is what makes it fail out loud.
//
// The tracked dimensions, and why each one is here:
//
//   archetype          the question's shape. Repeats read as "I've done this".
//   context            the scenario. Two cinema-ticket items in a series is thin.
//   numericSignature   the actual numbers. A duplicate here is a duplicate item,
//                      whatever the wording, and it invalidates the score the
//                      platform reports back to the student.
//   stimulusShape      kind + sub-kind + series count. Four grouped bar charts
//                      in four consecutive forms is a tell.
//   distractorClasses  the error each wrong option encodes. A series that leans
//                      on one class teaches students to expect it.
//   familyMix          the per-form family counts. Identical mixes are shuffles.
//   domainSequence     the order domains appear in. Reused order is a template.
//   difficultyPattern  the demand band per position. Same pattern = same skeleton.
//   setPattern         shared-set sizes and start positions.
//   rareDevices        must appear in SOME forms and never in all.
//
// No dependencies, no build step, same bytes in Node and the browser.

import { DEVICE_BUDGETS, FAMILIES } from './est-blueprint.mjs';

/**
 * Series budgets. Every entry says what it counts and over what window, because
 * "no repeats" means different things over 2 forms and over 25.
 */
export const SERIES_RULES = {
  archetype: {
    maxUsesInSeries: 3,
    maxSharedBetweenAdjacent: 4,
    strength: 'hard',
    why: 'The corpus shares only 7 of 191 archetypes across four forms. 4 adjacent is already generous.',
  },
  context: {
    maxUsesInSeries: 2,
    maxSharedBetweenAdjacent: 0,
    strength: 'hard',
    why: 'A repeated scenario reads as thin long before anyone counts domain weights.',
  },
  numericSignature: {
    maxUsesInSeries: 1,
    maxSharedBetweenAdjacent: 0,
    strength: 'hard',
    why: 'A duplicate number set IS a duplicate question, and a recognised question invalidates its own score.',
  },
  stimulusShape: {
    // Deliberately NOT a shared-count cap. The renderable stimulus kinds are a
    // small closed set, so any two forms will share most of their shapes and a
    // shared-count rule would fire on every honest series. What actually shows
    // through is a series that leans on one shape, and adjacent forms whose
    // dominant shape is the same.
    // The cap scales with how many shapes are actually in play. Uniform use of
    // S shapes is 1/S each; two times uniform is the point at which one shape is
    // visibly carrying the series. The 0.25 floor stops the rule going slack
    // once the renderer supports many shapes.
    maxShareOfSeries: 0.25,
    capIsTwiceUniform: true,
    dominantMustDifferBetweenAdjacent: true,
    strength: 'range',
    why: 'Stimulus kinds are a small closed set, so shared shapes are unavoidable; leaning on one is not.',
  },
  distractorClassCoverage: {
    everyFormCoversAll: 9,
    maxShareOfForm: 0.30,
    strength: 'range',
    why: 'All nine classes appear in all four reference forms; monoculture is invisible item by item.',
  },
  familyMix: {
    minFamiliesDifferingBetweenAdjacent: 3,
    strength: 'soft',
    why: 'Per-form family counts swing widely in the corpus. Identical mixes mean the generator is not using its range.',
  },
  domainSequence: {
    identicalAdjacentForbidden: true,
    maxLongestCommonRun: 8,
    strength: 'soft',
    why: 'Two forms that walk their domains in the same order are one form twice.',
  },
  difficultyPattern: {
    identicalAdjacentForbidden: true,
    maxLongestCommonRun: 10,
    strength: 'soft',
    why: 'The demand-band sequence is the form\'s skeleton. Reusing it is reusing the form.',
  },
  setPattern: {
    identicalAdjacentForbidden: true,
    strength: 'soft',
    why: 'Set sizes and start positions vary across the corpus; a fixed pattern is a template showing through.',
  },
  rareDevices: {
    minFormsInSeries: 1,
    maxShareOfSeries: 0.6,
    strength: 'rare',
    why: 'A rare pattern that appears in every form is no longer rare; one that never appears is lost.',
  },
};

/** Devices the blueprint calls rare — they rotate rather than recur. */
export const ROTATING_DEVICES = ['fourWay', 'objectOptions', 'rareStimulus', 'nts'];

const norm = s => String(s == null ? '' : s).trim().toLowerCase();

/**
 * A canonical signature for an item's numbers. Two items with the same
 * signature are the same question with different words, whatever their stems
 * say. Order-insensitive, so a reordered system of equations does not slip past.
 *
 * An authored item SHOULD declare `numbers: [...]` — its actual mathematical
 * parameters. That is exact. Scraping digits out of the prompt is the fallback
 * for items that do not, and it is deliberately over-inclusive: an incidental
 * digit in the wording changes the signature, so the fallback can miss a
 * near-duplicate. It never invents one.
 */
export function numericSignature(item) {
  if (Array.isArray(item.numbers))
    return item.numbers.slice().sort((a, b) => a - b).join(',');
  const nums = [];
  const walk = v => {
    if (typeof v === 'number') nums.push(v);
    else if (typeof v === 'string') {
      const m = v.match(/-?\d+(?:\.\d+)?/g);
      if (m) for (const n of m) nums.push(Number(n));
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(item.prompt);
  walk(item.choices);
  if (item.stimulusSpec) walk(item.stimulusSpec);
  return nums.slice().sort((a, b) => a - b).join(',');
}

/** kind + sub-kind + series count, e.g. "chart:bar:2" or "plot:plane:1". */
export function stimulusShape(st) {
  if (!st) return null;
  const spec = st.spec || {};
  const sub = spec.chartType || spec.frame || '-';
  const n = Array.isArray(spec.series) ? spec.series.length
    : Array.isArray(spec.curves) ? spec.curves.length : 1;
  return `${st.kind}:${sub}:${n}`;
}

const longestCommonRun = (a, b) => {
  let best = 0, run = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    run = a[i] === b[i] ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
};

const counts = arr => arr.reduce((m, k) => (m[k] = (m[k] || 0) + 1, m), {});
const overlap = (a, b) => { const s = new Set(b); return [...new Set(a)].filter(x => s.has(x)); };

/**
 * Audit a series.
 *
 * @param {Array<{code:string, items:Array}>} forms  in the order they will ship
 * @returns {{findings:Array<{rule,severity,form,detail}>, summary:object}}
 *
 * Each item: { archetype, context, family, domain, demand, devices[],
 *              distractorClasses[], prompt, choices, stimulus?, setId? }
 */
export function auditSeries(forms) {
  const findings = [];
  const add = (rule, severity, form, detail) => findings.push({ rule, severity, form, detail });
  const sev = r => (SERIES_RULES[r].strength === 'hard' ? 'error'
    : SERIES_RULES[r].strength === 'range' ? 'error' : 'warning');

  const per = forms.map(f => {
    const items = f.items;
    return {
      code: f.code,
      archetypes: items.map(i => norm(i.archetype)),
      contexts: items.map(i => norm(i.context)).filter(Boolean),
      sigs: items.map(i => numericSignature(i)),
      shapes: items.map(i => stimulusShape(i.stimulus)).filter(Boolean),
      dClasses: items.flatMap(i => i.distractorClasses || []),
      familyMix: counts(items.map(i => i.family)),
      domainSeq: items.map(i => i.domain),
      demandSeq: items.map(i => i.demand),
      setPattern: (() => {
        const g = {};
        items.forEach((i, idx) => { if (i.setId) (g[i.setId] ||= []).push(idx + 1); });
        return Object.values(g).map(qs => `${qs[0]}:${qs.length}`).sort().join(',');
      })(),
      devices: new Set(items.flatMap(i => i.devices || [])),
    };
  });

  // ── series-wide reuse ───────────────────────────────────────────────────────
  for (const [key, field] of [['archetype', 'archetypes'], ['context', 'contexts'], ['numericSignature', 'sigs']]) {
    const all = per.flatMap(p => p[field].map(v => ({ v, code: p.code })));
    const c = counts(all.map(x => x.v));
    const cap = SERIES_RULES[key].maxUsesInSeries;
    for (const [v, n] of Object.entries(c)) {
      if (n > cap) {
        const where = [...new Set(all.filter(x => x.v === v).map(x => x.code))];
        add(key, sev(key), where.join(','),
          `"${v.slice(0, 60)}" used ${n} times across the series (cap ${cap})`);
      }
    }
  }
  const shapeCounts = counts(per.flatMap(p => p.shapes));
  const shapeTotal = Object.values(shapeCounts).reduce((a, b) => a + b, 0);
  const distinctShapes = Object.keys(shapeCounts).length;
  const shapeCap = distinctShapes
    ? Math.max(SERIES_RULES.stimulusShape.maxShareOfSeries, 2 / distinctShapes)
    : 1;
  for (const [v, n] of Object.entries(shapeCounts))
    if (shapeTotal && n / shapeTotal > shapeCap)
      add('stimulusShape', 'error', '-',
        `stimulus shape ${v} is ${(100 * n / shapeTotal).toFixed(0)}% of the series' stimuli ` +
        `(cap ${(100 * shapeCap).toFixed(0)}% at ${distinctShapes} shapes in play)`);

  // ── adjacent-form comparisons ───────────────────────────────────────────────
  for (let i = 1; i < per.length; i++) {
    const a = per[i - 1], b = per[i], tag = `${a.code}->${b.code}`;

    for (const [key, field] of [['archetype', 'archetypes'], ['context', 'contexts'],
                                ['numericSignature', 'sigs']]) {
      const shared = overlap(a[field], b[field]);
      const cap = SERIES_RULES[key].maxSharedBetweenAdjacent;
      if (shared.length > cap)
        add(key, sev(key), tag,
          `${shared.length} shared between adjacent forms (cap ${cap}): ${shared.slice(0, 5).map(s => s.slice(0, 40)).join(' | ')}`);
    }

    const differing = new Set([...Object.keys(a.familyMix), ...Object.keys(b.familyMix)])
      .size && [...new Set([...Object.keys(a.familyMix), ...Object.keys(b.familyMix)])]
        .filter(k => (a.familyMix[k] || 0) !== (b.familyMix[k] || 0)).length;
    if (differing < SERIES_RULES.familyMix.minFamiliesDifferingBetweenAdjacent)
      add('familyMix', 'warning', tag,
        `only ${differing} families differ in count (need ${SERIES_RULES.familyMix.minFamiliesDifferingBetweenAdjacent})`);

    if (a.domainSeq.join() === b.domainSeq.join())
      add('domainSequence', 'warning', tag, 'identical domain sequence');
    else {
      const r = longestCommonRun(a.domainSeq, b.domainSeq);
      if (r > SERIES_RULES.domainSequence.maxLongestCommonRun)
        add('domainSequence', 'warning', tag, `${r} consecutive positions share a domain (cap ${SERIES_RULES.domainSequence.maxLongestCommonRun})`);
    }

    if (a.demandSeq.join() === b.demandSeq.join())
      add('difficultyPattern', 'warning', tag, 'identical demand-band sequence');
    else {
      const r = longestCommonRun(a.demandSeq, b.demandSeq);
      if (r > SERIES_RULES.difficultyPattern.maxLongestCommonRun)
        add('difficultyPattern', 'warning', tag, `${r} consecutive positions share a demand band (cap ${SERIES_RULES.difficultyPattern.maxLongestCommonRun})`);
    }

    const dom = p => { const c = counts(p.shapes); return Object.entries(c).sort((x, y) => y[1] - x[1])[0]; };
    const da = dom(a), db = dom(b);
    if (SERIES_RULES.stimulusShape.dominantMustDifferBetweenAdjacent && da && db && da[0] === db[0])
      add('stimulusShape', 'error', tag, `both forms lean on the same stimulus shape (${da[0]})`);

    if (a.setPattern && a.setPattern === b.setPattern)
      add('setPattern', 'warning', tag, `identical shared-set pattern (${a.setPattern})`);
  }

  // ── per-form distractor coverage ────────────────────────────────────────────
  for (const p of per) {
    const c = counts(p.dClasses), total = p.dClasses.length;
    const present = Object.keys(c).length;
    if (present < SERIES_RULES.distractorClassCoverage.everyFormCoversAll)
      add('distractorClassCoverage', 'error', p.code,
        `only ${present} of ${SERIES_RULES.distractorClassCoverage.everyFormCoversAll} distractor classes used`);
    for (const [k, n] of Object.entries(c))
      if (total && n / total > SERIES_RULES.distractorClassCoverage.maxShareOfForm)
        add('distractorClassCoverage', 'error', p.code,
          `distractor class ${k} is ${(100 * n / total).toFixed(0)}% of the form (cap ${100 * SERIES_RULES.distractorClassCoverage.maxShareOfForm}%)`);
  }

  // ── rotating devices: some forms, never all ─────────────────────────────────
  for (const d of ROTATING_DEVICES) {
    if (!DEVICE_BUDGETS[d]) continue;
    const n = per.filter(p => p.devices.has(d)).length;
    if (n < SERIES_RULES.rareDevices.minFormsInSeries)
      add('rareDevices', 'warning', '-', `device "${d}" appears in no form of the series`);
    if (per.length > 2 && n / per.length > SERIES_RULES.rareDevices.maxShareOfSeries)
      add('rareDevices', 'warning', '-',
        `device "${d}" appears in ${n}/${per.length} forms — a rotating device should not be in nearly all of them`);
  }

  return {
    findings,
    summary: {
      forms: forms.length,
      items: forms.reduce((n, f) => n + f.items.length, 0),
      distinctArchetypes: new Set(per.flatMap(p => p.archetypes)).size,
      distinctContexts: new Set(per.flatMap(p => p.contexts)).size,
      distinctSignatures: new Set(per.flatMap(p => p.sigs)).size,
      errors: findings.filter(f => f.severity === 'error').length,
      warnings: findings.filter(f => f.severity === 'warning').length,
      knownFamilies: Object.keys(FAMILIES).length,
    },
  };
}
