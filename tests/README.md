# Tests

Dependency-free regression suites for Si Math AI. There is no `package.json`
and no test framework: every suite is a plain Node script that exits `0` on
success and `1` on failure, so CI needs nothing but `node`.

```bash
node tests/run-all.mjs           # every suite + the scripts/validate-* gates
node tests/run-all.mjs streak    # only suites whose filename matches "streak"
node tests/streak.test.mjs       # one suite directly
```

Two suites read the Edge Function's TypeScript and need Node's type stripping
(v22.6+). `run-all.mjs` adds the flag automatically; to run them directly:

```bash
node --experimental-strip-types tests/scope-guardrail.test.mjs
```

## Why the suites extract real source

Most suites pull the code under test **out of the shipped file** — the inline
`<script>` of an HTML page, or a slice of `supabase/functions/ai-tutor/index.ts`
— rather than re-implementing it. A test that paraphrases the code can pass
while production is broken. That happened during this audit: a hand-rolled
stand-in for `chat.html`'s XP retry loop produced a false failure and briefly
suggested a bug that did not exist. `_source.mjs` exists so a suite can reach
the actual bytes that ship, and it throws loudly if a marker moves rather than
silently extracting nothing.

## Suites

| Suite | Covers | Regression it prevents |
|---|---|---|
| `streak` | `assets/streak.js` | Page views counting as practice (streak climbed without practice, then collapsed); a transient query failure overwriting a real streak; a live streak reading 0 every morning; Cairo day-boundary pinning; the opt-in `activityToday` hint never defaulting on. |
| `exam-days` | `assets/exam-days.js` | The countdown reading +1 every day (a DATE column parsed as UTC midnight, differenced against local midnight, `ceil`'d); the Progress variant drifting with the time of day; device-timezone dependence. |
| `week-strip` | `dashboard.html` Mon–Sun strip | The strip built in one timezone frame and labelled in another, shifting a day and mis-marking "today" on a device far from Cairo. |
| `relative-date` | `history.html` `relDate()` | The nonsensical "0 days ago"; two-days-ago labelled "Yesterday"; everything older undercounted; `NaN days ago` on invalid input. |
| `xp-concurrency` | `chat.html` + `mock-exam.html` XP | Every drill completion silently losing either the +5 or the +30 (two unawaited read-modify-writes in one tick); a second tab losing an exam award; a failed read clobbering `xp`. Races the two real CAS blocks against each other. |
| `scope-guardrail` | `ai-tutor` v87 scope logic | Zero answering politics/programming/medical/legal (there was no domain restriction at all before v87); coaching wrongly refused; the guard failing closed on a malformed label; `hint_mode` being usable as a bypass. |
| `zero-personality` | v87 redirect voice | The guardrail flattening Zero into a filter — the redirect losing the 🐉 anchor, the student's name, emoji, Egyptian dialect, or repeating verbatim; the personality layer being unwired from Priority 1. |
| `constants-drift` | Cross-file constants | Rank thresholds diverging across the four JS copies and the SQL `rank_for_xp`; generated taxonomy/study-planner copies drifting from their source; the study-planner drift gate regaining its ability to self-repair. |
| `repo-integrity` | Whole repo | Any shipped script failing to parse, plus a pinned assertion for **every** defect fixed in the 2026-07 audit so a future refactor cannot quietly reintroduce one. |

## Conventions

- `_assert.mjs` — `suite()` returns `is` / `ok` / `section` / `note` / `done`.
  `done()` prints the tally and sets the exit code.
- `_source.mjs` — `read`, `slice`, `inlineScripts`, `syntaxError`,
  `evalSnippet`, `importTS`. Prefer these over ad-hoc file reads so extraction
  failures are loud.
- Time-dependent suites pin an explicit "now" instead of using the wall clock.
  Suites that mutate `process.env.TZ` **must restore it** — a leaked `TZ` once
  inverted the meaning of a later assertion in `exam-days`.
