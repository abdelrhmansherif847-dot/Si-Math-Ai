// The frozen generator baseline — Stage 25.
//
// Stage 24 ended with a decision that the generator stops changing while the
// reference corpus is investigated. A freeze that is only written down is a
// freeze that drifts, and this programme has already recorded two cases of a
// documented number quietly ceasing to be true. So the baseline is data, and
// this validator re-derives the parts of it that can be re-derived.
//
// It checks what is CHEAP and STRUCTURAL: the vocabulary count, the six
// classified gaps, and that nothing was invented. It deliberately does not
// re-run the 25-form simulation — that takes minutes and belongs in the
// capacity suite, which asserts the same quantities against live measurement.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CONSTRUCT_OBJECT, REFERENCE_OBJECTS } from './est-objects.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(readFileSync(join(here, 'est-baseline.json'), 'utf8'));

const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };

const named = new Set(Object.values(CONSTRUCT_OBJECT).filter(Boolean));
const referenced = new Set(Object.values(REFERENCE_OBJECTS).flatMap(f => f.objects));
const executable = [...referenced].filter(o => named.has(o));
const unbuilt = [...referenced].filter(o => !named.has(o)).sort();

const v = baseline.vocabulary;
check(referenced.size === v.referenceArchetypesNamed,
  `the corpus names ${referenced.size} archetypes, baseline says ${v.referenceArchetypesNamed}`);
check(executable.length === v.referenceArchetypesExecutable,
  `${executable.length} archetypes are executable, baseline says ${v.referenceArchetypesExecutable}`);
check(Math.abs(executable.length / referenced.size - v.completeness) < 0.001,
  `completeness is ${(executable.length / referenced.size).toFixed(3)}, baseline says ${v.completeness}`);

// The six gaps are classified, and the classification is exhaustive: a gap that
// appears in neither list is a gap nobody decided about.
const classified = [...v.unbuilt.coordinatePlaneStimulus, ...v.unbuilt.richerLineGraph].sort();
check(unbuilt.length === classified.length && unbuilt.every((o, i) => o === classified[i]),
  `the unbuilt set is [${unbuilt.join(', ')}], the classified set is [${classified.join(', ')}]`);
check(v.unbuilt.coordinatePlaneStimulus.length === 4, 'four gaps need a coordinate-plane stimulus');
check(v.unbuilt.richerLineGraph.length === 2, 'two gaps need a richer line graph');

// Nothing invented: every object the registry names is a corpus archetype.
const invented = [...named].filter(o => !referenced.has(o));
check(invented.length === 0, `objects named that the corpus does not: ${invented.join(', ')}`);

// The registry cannot have lost an entry to a duplicate key.
const keys = Object.keys(CONSTRUCT_OBJECT);
check(keys.length === new Set(keys).size, 'CONSTRUCT_OBJECT has a duplicate key');

// The capacity figures are recorded rather than re-derived here, but they must
// at least be internally consistent, or the record is not usable as a baseline.
const c = baseline.capacity;
check(c.theoreticalBestOverlapShare < c.constructiveOptimumShare,
  'the lower bound must sit below the constructive optimum');
const [lo, hi] = c.theoreticalBestOverlapShareRange;
check(lo <= c.theoreticalBestOverlapShare && c.theoreticalBestOverlapShare <= hi,
  `the graded bound ${c.theoreticalBestOverlapShare} is outside its own recorded range ${lo}-${hi}`);
check(c.everyFormObjectMinimum <= c.everyFormObjectMinimumGradedProfile,
  'the proven minimum cannot exceed the minimum under the graded profile');
check(c.everyFormObjectsAchieved > c.everyFormObjectMinimumGradedProfile,
  'the achieved every-form count is above the minimum — that is the open gap');
check(c.constructiveOptimumShare < c.achievedOverlapShare,
  'the constructive optimum must sit below what the generator achieves');
check(Math.abs(c.theoreticalBestOverlapShare / c.achievedOverlapShare - c.allocationEfficiency) < 0.01,
  `efficiency ${c.allocationEfficiency} does not equal ${c.theoreticalBestOverlapShare} / ${c.achievedOverlapShare}`);
check(c.allocationPenaltyFloor > 1, 'the penalty floor is above 1 — that is the Stage 24 finding');
check(c.recommendedCooldownPolicy === 'D', 'policy D is the recommended cooldown policy');

if (failures.length) {
  console.error('FAIL validate-est-baseline: the frozen baseline no longer describes the repository.\n');
  for (const f of failures) console.error(`  - ${f}`);
  console.error('\nIf a change was intended, update scripts/est-baseline.json and say so in the artifact.');
  process.exit(1);
}
console.log(`ok  est-baseline: ${executable.length}/${referenced.size} archetypes executable, ` +
  `${unbuilt.length} classified gaps, nothing invented`);
