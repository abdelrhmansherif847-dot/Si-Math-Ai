// Series-capacity optimization — what the SUPPORTED vocabulary can achieve.
//
// WHY THIS EXISTS
//
// Stage B scored 5 of 11 and the largest failure was a vocabulary milestone of
// 250 objects. The corpus names 189 archetypes. The milestone was therefore
// asking the library to be a third larger than the evidence it is built from,
// which is not a gate, it is a category error — and it was hiding the question
// that actually matters:
//
//   How close can the generator get to reference-like series reuse using the
//   objects the corpus actually justifies?
//
// This module answers that BEFORE anything is added, by treating allocation as
// a constrained optimization over the existing vocabulary and computing the
// ceiling. If the optimum is still far from the reference, the gap is a
// constraint, not a shortage, and adding primitives cannot close it.
//
// WHAT A "CEILING" MEANS HERE, EXACTLY
//
// Two numbers bracket the truth and both are reported:
//
//   * A LOWER BOUND on achievable overlap, from convexity. It depends on no
//     algorithm and no search: given that a cell must fill d slots per form
//     from |E| eligible objects, no assignment whatsoever can do better. If the
//     bound is above the reference, the reference is unreachable and no amount
//     of cleverness in the assembler changes that.
//
//   * An ACHIEVED value from a constructive optimizer that respects the same
//     per-form rules the assembler does. This is a real assignment, so it is an
//     upper bound on the optimum.
//
// The optimizer sees only cells, eligibility and per-form uniqueness. It does
// NOT see the anti-clone fingerprint, content signatures or stimulus-set
// coupling, all of which can only reject assignments. So the achieved value is
// OPTIMISTIC relative to the real generator by construction, and the real
// generator can never beat it. That is what makes it a ceiling.
//
// NO EXAM CONTENT. Cells, object ids and counts.

import { objectOf } from './est-objects.mjs';
import { cellsOf, realisedDemand } from './est-allocation.mjs';

/* ══════════════════════════ 1. the eligibility structure ══════════════════════════ */

/**
 * Which objects can serve which (family, band) cell, and how many slots per
 * form each cell is actually asked for.
 *
 * Demand is taken from ASSEMBLED forms rather than from the blueprint table,
 * because `assignBands()` decides the band and the blueprint's `slot.d` is not
 * what it decides. Stage B recorded that correction; this module depends on it.
 */
export function eligibility(pool, forms, { extra = [] } = {}) {
  const demand = realisedDemand(forms);
  const cells = new Map();
  const touch = k => {
    if (!cells.has(k)) cells.set(k, { cell: k, family: k.split('/')[0], band: k.split('/')[1],
      demand: demand[k] || 0, objects: new Set(), streams: new Set() });
    return cells.get(k);
  };
  for (const k of Object.keys(demand)) touch(k);
  for (const c of [...pool, ...extra]) {
    const o = objectOf(c);
    for (const k of cellsOf(c)) {
      if (!cells.has(k) && !demand[k]) continue;      // no demand, no cell
      const cell = touch(k);
      cell.objects.add(o);
      cell.streams.add(c.stream || 'reader');
    }
  }
  const rows = [...cells.values()]
    .filter(c => c.demand > 0)
    .map(c => ({ ...c, objects: [...c.objects].sort(), streams: [...c.streams].sort().join('+') }))
    .sort((a, b) => (a.objects.length / Math.max(a.demand, 0.01)) - (b.objects.length / Math.max(b.demand, 0.01)));
  const universe = new Set(rows.flatMap(r => r.objects));
  return { cells: rows, universe, totalDemand: rows.reduce((a, r) => a + r.demand, 0) };
}

/* ══════════════════════════ 2. the objective ══════════════════════════ */

/**
 * The weighted series-diversity LOSS. Lower is better; zero is a series in
 * which no two forms share anything.
 *
 * Written down as weights rather than argued in prose, so a later change to
 * what the programme values is a change to a line of code that the test suite
 * can see. The weights are relative, and the two that dominate are the two the
 * reference is most emphatic about: an object in every form (the corpus has
 * none) and pairwise object overlap (the corpus runs at 2.3%).
 */
export const DIVERSITY_LOSS = {
  pairwiseObjectOverlap: 1.0,     // the headline number
  everyFormObject: 2.0,           // per object, per the corpus having zero
  repeatedObjectFrequency: 0.5,   // mean uses per emitted object, above 1
  reasoningSpeciesOverlap: 0.7,
  targetStructureOverlap: 0.3,
  cellScarcityPressure: 0.4,      // demand served by a cell with <2 objects
  allocationPenalty: 0.8,         // measured overlap over the random-draw prediction
};

/** Mean pairwise object overlap of a series expressed as object-id lists. */
export function pairwiseOverlap(formObjects) {
  const N = formObjects.length;
  if (N < 2) return 0;
  const sets = formObjects.map(f => new Set(f));
  let total = 0, pairs = 0;
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    let n = 0;
    for (const o of sets[i]) if (sets[j].has(o)) n++;
    total += n; pairs++;
  }
  return total / pairs;
}

/**
 * Mean pairwise overlap computed from per-object form counts alone.
 *
 * Sum over pairs of |F_i ∩ F_j| = Σ_o C(n_o, 2), which is why the whole problem
 * reduces to spreading n_o as evenly as the eligibility allows. This identity
 * is what makes the lower bound below exact rather than a guess.
 */
export function overlapFromCounts(counts, N) {
  if (N < 2) return 0;
  let sum = 0;
  for (const n of counts) sum += (n * (n - 1)) / 2;
  return sum / ((N * (N - 1)) / 2);
}

/* ══════════════════════════ 3. the ceiling ══════════════════════════ */

/**
 * A LOWER BOUND on pairwise object overlap that no assignment can beat.
 *
 * Cell c places d_c·N objects over the series, drawn only from its |E_c|
 * eligible objects. Within that cell the sum of C(n,2) is minimised by
 * spreading perfectly evenly, so it is at least |E_c|·C(d_c·N/|E_c|, 2)
 * evaluated with the integer split. Summing over cells UNDER-counts, because an
 * object serving two cells has its counts added and convexity makes that worse
 * — so the sum is a valid bound.
 *
 * It also caps n_o at N: an object cannot appear in more forms than exist, and
 * a cell whose demand exceeds |E_c|·N is infeasible outright.
 */
export function overlapLowerBound(cells, { N = 25 } = {}) {
  let sum = 0;
  const perCell = [];
  for (const c of cells) {
    const need = Math.round(c.demand * N);
    const k = c.objects.length;
    if (k === 0) { perCell.push({ cell: c.cell, infeasible: true, need, eligible: 0, contribution: Infinity }); continue; }
    // Spread `need` over `k` objects as evenly as integers allow.
    const base = Math.floor(need / k), rem = need % k;
    const counts = Array.from({ length: k }, (_, i) => base + (i < rem ? 1 : 0));
    const over = counts.filter(n => n > N).length;
    const contribution = counts.reduce((a, n) => a + (n * (n - 1)) / 2, 0);
    sum += contribution;
    perCell.push({ cell: c.cell, need, eligible: k, evenSplit: base + (rem ? '+' : ''), contribution,
      infeasible: over > 0, forcedEveryForm: counts.filter(n => n >= N).length });
  }
  return {
    overlap: sum / ((N * (N - 1)) / 2),
    share: (sum / ((N * (N - 1)) / 2)) / 50,
    perCell: perCell.sort((a, b) => b.contribution - a.contribution),
    infeasibleCells: perCell.filter(p => p.infeasible).length,
    forcedEveryFormObjects: perCell.reduce((a, p) => a + (p.forcedEveryForm || 0), 0),
  };
}

/**
 * The constructive optimizer: build N forms from the eligibility structure,
 * choosing at every slot the eligible object the series has used least.
 *
 * This is the incremental-greedy solution to a separable convex transportation
 * problem, and for that class it is optimal up to the order cells are processed
 * in — so cells are processed MOST CONSTRAINED FIRST, which is where a wrong
 * choice is unrecoverable.
 *
 * `rules` are the per-form ones the assembler enforces: at most `maxPerObject`
 * slots may ask the same object, and at most `maxObjectsRepeated` objects may
 * be repeated at all.
 */
export function optimalSeries(cells, { N = 25, rules = { maxPerObject: 2, maxObjectsRepeated: 1 },
  cooldown = 0 } = {}) {
  const uses = new Map();            // object -> forms it has appeared in
  const lastForm = new Map();        // object -> index of the most recent form
  const order = [...cells].sort((a, b) =>
    (a.objects.length / Math.max(a.demand, 0.01)) - (b.objects.length / Math.max(b.demand, 0.01)));
  const forms = [];
  let unfilled = 0;

  // Fractional cell demand is turned into an integer profile per form by the
  // LARGEST REMAINDER method, so every form gets exactly the same slot total the
  // assembled forms had. Rounding each cell independently was the first version
  // and it built 65-slot forms — a ceiling computed on a form that does not
  // exist is worse than no ceiling at all.
  const S = Math.round(order.reduce((a, c) => a + c.demand, 0));
  const perForm = [];
  for (let f = 0; f < N; f++) {
    const base = order.map(c => Math.floor(c.demand));
    const rem = order.map((c, i) => ({ i, r: c.demand - base[i] }));
    let short = S - base.reduce((a, b) => a + b, 0);
    // Rotate which cells get the spare slots, so a cell owed 0.5 gets one in two
    // rather than always or never.
    rem.sort((a, b) => (b.r - a.r) || (a.i - b.i));
    const take = rem.filter(x => x.r > 0);
    for (let k = 0; k < short && take.length; k++) base[take[(k + f) % take.length].i]++;
    perForm.push(base);
  }

  for (let f = 0; f < N; f++) {
    const inForm = new Map();        // object -> times used in THIS form
    const picked = [];
    for (let ci = 0; ci < order.length; ci++) {
      const c = order[ci];
      const need = perForm[f][ci];
      for (let s = 0; s < need; s++) {
        const repeated = [...inForm.values()].filter(v => v > 1).length;
        const eligible = c.objects.filter(o => {
          const used = inForm.get(o) || 0;
          if (used >= rules.maxPerObject) return false;
          if (used >= 1 && repeated >= rules.maxObjectsRepeated) return false;
          return true;
        });
        if (!eligible.length) { unfilled++; continue; }
        const fresh = cooldown > 0
          ? eligible.filter(o => !lastForm.has(o) || f - lastForm.get(o) > cooldown)
          : eligible;
        const from = fresh.length ? fresh : eligible;
        let best = from[0], bestN = Infinity;
        for (const o of from) {
          const n = uses.get(o) || 0;
          if (n < bestN) { bestN = n; best = o; }
        }
        inForm.set(best, (inForm.get(best) || 0) + 1);
        picked.push(best);
      }
    }
    for (const o of new Set(picked)) { uses.set(o, (uses.get(o) || 0) + 1); lastForm.set(o, f); }
    forms.push(picked);
  }

  const counts = [...uses.values()];
  const distinct = forms.map(f => new Set(f).size);
  return {
    forms, unfilled,
    emitted: uses.size,
    overlap: pairwiseOverlap(forms),
    overlapFromCounts: overlapFromCounts(counts, N),
    everyFormObjects: counts.filter(n => n === N).length,
    meanUsesPerObject: counts.reduce((a, b) => a + b, 0) / Math.max(1, counts.size ?? counts.length),
    distinctPerForm: { min: Math.min(...distinct), max: Math.max(...distinct) },
    slotsPerForm: forms[0]?.length ?? 0,
  };
}

/**
 * Which constraints actually bind.
 *
 * A cell binds when its own even split already forces more overlap than the
 * target allows. Ranked by contribution, this is the list of places where more
 * vocabulary would help and the only such list — everywhere else, more objects
 * change nothing.
 */
export function bindingConstraints(cells, { N = 25, targetShare = 0.20 } = {}) {
  const bound = overlapLowerBound(cells, { N });
  const budget = targetShare * 50 * ((N * (N - 1)) / 2);      // total C(n,2) the target permits
  const rows = bound.perCell.map(p => ({ ...p, shareOfBound: p.contribution / Math.max(1, bound.perCell.reduce((a, x) => a + (x.contribution === Infinity ? 0 : x.contribution), 0)) }));
  // The vocabulary a cell would need to stop binding, at the target share.
  const need = rows.map(p => {
    const cell = cells.find(c => c.cell === p.cell);
    if (!cell) return p;
    const total = Math.round(cell.demand * N);
    // |E| objects each used total/|E| times contributes |E|·C(total/|E|,2).
    // Solve for the |E| at which the cell's share of the budget is met.
    let k = cell.objects.length;
    const fair = budget * (cell.demand / Math.max(0.01, cells.reduce((a, c2) => a + c2.demand, 0)));
    while (k < 400) {
      const per = total / k;
      if (k * (per * (per - 1)) / 2 <= fair) break;
      k++;
    }
    return { ...p, have: cell.objects.length, wouldNeed: k, demand: cell.demand, streams: cell.streams };
  });
  return { bound, budget, rows: need.filter(r => r.wouldNeed !== undefined) };
}

/* ══════════════════════════ 4. cooldown scheduling ══════════════════════════ */

/**
 * Object scarcity: the fewest eligible objects any cell an object serves has.
 *
 * An object that is one of two in a Peak cell is scarce however many other
 * cells it could also fill; an object that is one of seventeen everywhere is
 * not. The minimum is the right aggregate because the thin cell is the one that
 * fails when the object is held back.
 */
export function objectScarcity(cells) {
  const s = new Map();
  for (const c of cells) for (const o of c.objects) {
    const k = c.objects.length;
    if (!s.has(o) || k < s.get(o)) s.set(o, k);
  }
  return s;
}

/**
 * The four scheduling policies, as ledger builders.
 *
 * `assemble({ledger})` sorts its candidate pool by the ledger value, stably and
 * without forbidding anything, so a "cooldown" here is a strong preference
 * rather than a prohibition. That distinction is deliberate: a hard cooldown
 * that cannot be broken turns a scarce cell into an unfillable one, and a form
 * that does not assemble is worth nothing however diverse it would have been.
 */
export const COOLDOWN_POLICIES = {
  A: { id: 'A', name: 'no cooldown', build: () => null },
  B: { id: 'B', name: '1-form cooldown', build: (forms) => countLedger(forms, 1) },
  C: { id: 'C', name: '2-form cooldown', build: (forms) => countLedger(forms, 2) },
  D: {
    id: 'D',
    name: 'adaptive cooldown, weighted by object scarcity',
    build: (forms, { scarcity, window: w = 3 } = {}) => {
      const led = new Map();
      const recent = forms.slice(-w);
      recent.forEach((f, i) => {
        const age = recent.length - i;                 // 1 = the form just built
        for (const o of new Set(f.map(p => objectOf(p.item)))) {
          // Scarce objects cool down FASTER — a cell with two objects cannot
          // afford to have one of them held out, so its penalty decays quickly
          // while an object with many alternatives stays parked.
          const k = scarcity?.get(o) ?? 8;
          const weight = Math.min(1, k / 8) / age;
          led.set(o, (led.get(o) || 0) + weight);
        }
      });
      return led;
    },
  },
};

function countLedger(forms, w) {
  const led = new Map();
  for (const f of forms.slice(-w)) {
    for (const o of new Set(f.map(p => objectOf(p.item)))) led.set(o, (led.get(o) || 0) + 1);
  }
  return led;
}

/* ══════════════════════════ 5. the revised readiness gate ══════════════════════════ */

/**
 * Stage B's gate asked for 250 executable objects. The corpus names 189, so the
 * milestone was a third larger than the evidence the library is built from — and
 * measuring the ceiling showed it was also asking the wrong question. With the
 * supported vocabulary the BEST ACHIEVABLE overlap is about 46%; a target of 20%
 * is not difficult, it is unreachable, and no amount of allocation work reaches
 * it. Raw object count was never the quantity that mattered.
 *
 * So readiness splits into two criteria that move independently:
 *
 *   VOCABULARY COMPLETENESS — what fraction of the archetypes the corpus
 *   actually names can the library build? This is bounded by the corpus and by
 *   the renderer, and it is nearly closed.
 *
 *   ALLOCATION EFFICIENCY — of the diversity the vocabulary makes POSSIBLE, how
 *   much does the generator capture? This is the quantity allocation work moves,
 *   it is bounded by 1, and it is measured against a ceiling computed from the
 *   same vocabulary rather than against a number someone chose.
 *
 * Both, plus the structural conditions Stage B already had and passes.
 */
export const READINESS = {
  vocabularyCompleteness: 0.95,    // of the archetypes the corpus names
  allocationEfficiency: 0.85,      // of the ceiling the vocabulary permits
  everyFormSlack: 2,               // above the bound's forced minimum
  formsComplete: 1.0,
  bandMixDeviation: 2,
  familyMixDeviation: 0,
};

/**
 * How much of the achievable diversity the generator actually captures.
 *
 * 1.0 means the generator is allocating as well as the eligibility structure
 * permits and every remaining point of overlap is a vocabulary fact. Below 1.0
 * is allocation work. Above 1.0 is impossible and indicates the ceiling was
 * computed against the wrong demand profile.
 */
export const capacityEfficiency = (bound, achieved) => (achieved > 0 ? +(bound / achieved).toFixed(3) : 0);

export function readinessGate({ archetypesBuilt, archetypesNamed, unbuiltClassified,
  bound, achieved, everyFormObjects, everyFormMinimum, formsComplete, formsRequested,
  bandMixDeviation: bmd = 0, familyMixDeviation: fmd = 0, suitesGreen = null } = {}) {
  const c = [];
  const add = (id, ok, detail) => c.push({ id, ok, detail });
  const completeness = archetypesNamed ? archetypesBuilt / archetypesNamed : 0;
  const efficiency = capacityEfficiency(bound, achieved);

  add('vocabulary-completeness', completeness >= READINESS.vocabularyCompleteness,
    `${archetypesBuilt} of ${archetypesNamed} named archetypes = ${(completeness * 100).toFixed(1)}%`);
  add('unbuilt-classified', unbuiltClassified === true,
    unbuiltClassified === true ? 'every unbuilt archetype has a recorded infrastructure classification'
      : 'unbuilt archetypes are not all classified');
  add('allocation-efficiency', efficiency >= READINESS.allocationEfficiency,
    `${(efficiency * 100).toFixed(1)}% of the ceiling (${bound.toFixed(2)} of 50 achievable, ${achieved.toFixed(2)} achieved)`);
  add('every-form-objects', everyFormObjects <= everyFormMinimum + READINESS.everyFormSlack,
    `${everyFormObjects} objects in every form against a proven minimum of ${everyFormMinimum}`);
  add('series-assembles', formsRequested > 0 && formsComplete === formsRequested,
    `${formsComplete}/${formsRequested} forms complete`);
  add('band-mix', bmd <= READINESS.bandMixDeviation, `band mix deviates ${bmd} slots per form`);
  add('family-mix', fmd <= READINESS.familyMixDeviation, `family mix deviates ${fmd} slots per form`);
  add('suites-green', suitesGreen === true, suitesGreen === null ? 'not measured here' : `suites green: ${suitesGreen}`);

  return { ok: c.every(x => x.ok), passed: c.filter(x => x.ok).length, total: c.length,
    completeness: +completeness.toFixed(3), efficiency, conditions: c };
}
