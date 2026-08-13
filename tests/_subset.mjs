// The parity guard's comparison rule.
//
// tests/fixtures/v1-t16-golden.json is frozen, unregenerable evidence that the
// V1-T16 extraction of the L3 pipeline was behaviour-preserving. It cannot be
// re-captured: --source=pre rebuilds the pipeline from ai-tutor/index.ts, and
// V1-T16 moved the definition out, so that capture crashes; --source=post would
// compare the code against itself, which the parity suite refuses by asserting
// golden.source === 'pre'.
//
// Comparing it by whole-object deep equality made the evidence brittle rather
// than strong: ANY deliberate additive change to pipeline output — a new
// telemetry key, a new recorded field — breaks it, and the only way back to
// green is to regenerate the golden, which destroys the very proof it exists to
// carry.
//
// So the golden is treated as a LOWER BOUND, not a photograph:
//
//   every value it captured must still be exactly that value
//   every key it captured must still be present
//   every array it captured must have the same length and order
//   anything it never captured is outside its jurisdiction
//
// This is strictly weaker than deep equality in one direction only — new keys —
// and exactly as strong in every other. A changed value, a deleted key, a
// resized array, a retyped field and a collapsed object all still fail, which
// is what the guard was protecting.
//
// tests/parity-guard.test.mjs proves each of those cases.

const kindOf = (v) =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;

/** Does `replay` satisfy everything `golden` witnessed?
 *
 *  Returns null when it does, or the FIRST divergence as
 *  { path, reason, expected, actual } — first rather than all, so a failure
 *  names one concrete thing instead of dumping a diff of the whole fixture.
 *
 *  `path` is a JSON-pointer-ish trail ($.writes[0].payload.judge_verdict) so a
 *  failure says where to look without reading the fixture by hand. */
export function goldenSubsetDiff(golden, replay, path = '$') {
  const gk = kindOf(golden), rk = kindOf(replay);

  // A captured null is a captured value: it must still be null. This also
  // means nulling a key is caught, not treated as "absent and therefore new".
  if (gk !== rk) {
    return { path, reason: `type changed: ${gk} -> ${rk}`, expected: golden, actual: replay };
  }

  if (gk === 'array') {
    // Length and order are part of what the golden witnessed. A grown array is
    // not an "additive key" — it is a different sequence of provider calls or
    // database writes.
    if (golden.length !== replay.length) {
      return {
        path, reason: `array length changed: ${golden.length} -> ${replay.length}`,
        expected: golden.length, actual: replay.length,
      };
    }
    for (let i = 0; i < golden.length; i++) {
      const d = goldenSubsetDiff(golden[i], replay[i], `${path}[${i}]`);
      if (d) return d;
    }
    return null;
  }

  if (gk === 'object') {
    for (const key of Object.keys(golden)) {
      if (!Object.prototype.hasOwnProperty.call(replay, key)) {
        return {
          path: `${path}.${key}`, reason: 'missing: the golden captured this key and the replay dropped it',
          expected: golden[key], actual: undefined,
        };
      }
      const d = goldenSubsetDiff(golden[key], replay[key], `${path}.${key}`);
      if (d) return d;
    }
    // Keys present in `replay` but absent from `golden` are deliberately NOT
    // inspected. That is the entire narrowing, and the reason it is safe: the
    // golden never observed them, so it can say nothing about them.
    return null;
  }

  // Scalars. JSON.stringify rather than === so NaN/-0 and the fixture's own
  // serialisation round-trip compare the way the fixture stores them.
  if (JSON.stringify(golden) !== JSON.stringify(replay)) {
    return { path, reason: 'value changed', expected: golden, actual: replay };
  }
  return null;
}

/** A one-line, human-readable rendering of a diff, for assertion messages. */
export function describeDiff(d) {
  if (!d) return 'no divergence';
  const short = (v) => {
    const s = JSON.stringify(v);
    return s === undefined ? 'undefined' : s.length > 120 ? s.slice(0, 117) + '...' : s;
  };
  return `${d.path}: ${d.reason} (expected ${short(d.expected)}, actual ${short(d.actual)})`;
}
