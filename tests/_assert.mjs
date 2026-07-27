// Minimal assertion helper shared by every suite in tests/.
//
// Deliberately dependency-free: this repo has no package.json and no installed
// test runner, and adding one would be a larger change than the tests warrant.
// Each suite is a plain Node script that exits 0 (pass) or 1 (fail), so the
// runner and CI only need `node`.
export function suite(name) {
  const results = [];
  let currentSection = null;

  const record = (ok, label) => {
    results.push({ ok, label, section: currentSection });
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
    return ok;
  };

  return {
    name,

    /** Print a section heading. Grouping only — does not affect pass/fail. */
    section(title) {
      currentSection = title;
      console.log(`\n── ${title} ──`);
    },

    /** Deep-equality assertion (JSON-compared, so arrays/objects work). */
    is(label, actual, expected) {
      const ok = JSON.stringify(actual) === JSON.stringify(expected);
      record(ok, label);
      if (!ok) {
        console.log(`        expected ${JSON.stringify(expected)}`);
        console.log(`        actual   ${JSON.stringify(actual)}`);
      }
      return ok;
    },

    /** Truthiness assertion. */
    ok(label, cond) {
      return record(!!cond, label);
    },

    /** Informational line — never affects pass/fail. */
    note(msg) {
      console.log(`  ..    ${msg}`);
    },

    /** Print the tally and exit with the right code. */
    done() {
      const passed = results.filter(r => r.ok).length;
      const failed = results.length - passed;
      console.log(`\n${passed}/${results.length} passed${failed ? ` — ${failed} FAILED` : ''}`);
      process.exit(failed ? 1 : 0);
    },
  };
}
