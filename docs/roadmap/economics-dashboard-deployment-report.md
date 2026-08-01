# Economics Dashboard — Deployment Report

**Date:** 2026-08-01
**Scope:** frontend only — `admin.html`. No business logic, database object, RPC,
migration or verification script was modified.

| | |
|---|---|
| Production URL | `https://www.si-math-ai.com/admin.html` |
| Production deployment | `dpl_…` at commit **`f44240ad`** = current `main`, state **READY** |
| Served file vs repo `main` | **byte-identical** |
| RPC contract validation | **19/19 PASS** |
| Section load validation | **9/9 sections return** |
| Confidence badges | **4/4 surfaces render a known class** |
| Blocked states | **3/3 blocked metrics carry a stated reason** |
| Admin regression | **0 functions, tabs, RPCs or element IDs removed** |
| Database changes | **0** |

---

## 1. The headline finding — it was already deployed

**`admin.html` has been live in production since the M4.3 merge, and I did not
put it there.**

Vercel's GitHub integration auto-deploys **every push to `main`** as a production
deployment. Throughout Phase 6 I reported "`admin.html` not deployed" after each
milestone. That was true of *my actions* — I never invoked a deploy — but it was
**misleading about the state of production**, because each merge to `main`
shipped the file automatically.

Reconstructed from the Vercel deployment history:

| Merge to `main` | Production deployment | What went live |
|---|---|---|
| `067d3c8f` | `si-math-d3ui3rdbr` | Sections 1–6 |
| `e6abc2b2` | `si-math-qmjtmxao7` | + Section 7 (M4.1) |
| `a1e26104` | `si-math-pdumknc47` | **+ Sections 8 and 9** (M4.2, M4.3) |
| `8b1d8382` → `f44240ad` | `si-math-krp2nucgo` | verification framework docs (no UI change) |

**Consequence: step 1 of this deployment required no action.** Production already
serves the approved file. I did not trigger a redundant deployment, because
promoting an identical build would add risk and change nothing.

**Why this was safe in practice, and why it is still worth flagging.** Every
Economics RPC is owner-gated *at the database* — verified below, `anon` cannot
execute a single one — so a non-owner loading the page gets no financial data.
The gate never depended on the page being withheld. But the owner's instruction
was "do not deploy yet", and the infrastructure did not honour it. **If a future
milestone must genuinely stay out of production, merging to `main` is not
sufficient to hold it back** — the work has to stay on a branch, or Vercel's
production branch setting has to change.

---

## 2. What production actually serves

Fetched `https://www.si-math-ai.com/admin.html` and compared to repo `main`:

| Check | Result |
|---|---|
| HTTP | 308 → `www`, then **200** |
| Size | 157,960 chars |
| vs `admin.html` at `f44240a` | **byte-identical** (`.strip()`-equal, md5 confirmed after lossless JSON unescape) |
| Deployment commit SHA | `f44240ad` — matches `main` exactly |

An earlier comparison showed a mismatch; that was **my own lossy unescaping** of a
regex literal, not a production difference. Re-decoding the payload properly as a
JSON string literal resolved it to byte-identical.

---

## 3. RPC contract — 19/19 PASS

Every RPC name was extracted **from the deployed file**, not from the repo, and
validated against production.

| Layer | RPCs | Gate | `anon` executable | Verdict |
|---|---|---|---|---|
| Economics | 14 | `has_role_at_least('owner')` | **no** | **PASS** |
| Pre-existing Admin | 5 | `profiles.is_admin` / `profiles.role` | **no** | **PASS** |

**Live invocation as owner — 14/14 callable, 0 raised**, using the exact
arguments the deployed code sends:

| Section | RPC (deployed args) | Rows |
|---|---|---|
| 1–3 | `owner_econ_pnl_summary()` | 1 |
| 2 | `owner_cost_metrics('operation')` / `('stage')` | 0 / 0 |
| 2 | `owner_econ_service_economics()` | 0 |
| 3 | `owner_econ_revenue()` | 444 |
| 4 | `owner_econ_credit_summary()` / `owner_econ_credit_flow()` | 1 / 26 |
| 5 | `owner_econ_package_economics()` | 2 |
| 6 | `owner_econ_operation_mix()` | 0 |
| 7 | `owner_econ_lesson_economics()` | 0 |
| 8 | `owner_econ_student_economics()` / `..._service_mix()` | 9 / 0 |
| **9** | `owner_cost_service_breakdown(NULL,…,true)` | **22** |
| 9 | `owner_cost_health()` | 13 |
| Coverage | `owner_econ_coverage()` | 6 |

Section 9's 22 rows = 7 service + 7 provider + 8 model, exactly the grain
cardinality in `cost_facts`.

### A failed check that was my fault, not the system's

The first run of this validation reported **4 FAILs** — `admin_credits_overview`,
`admin_set_credit_cost`, `approve_payment_request`, `change_user_role` flagged as
"no role gate". I stopped and investigated before changing anything.

**The RPCs were fine; my assertion was wrong.** It searched only for
`has_role_at_least`, the Phase 5+ convention. These four predate it and gate via
`profiles.is_admin` / `profiles.role` read through `auth.uid()` —
`change_user_role` uses the *stricter* owner-only check and raises. Re-run with a
predicate covering both conventions: **19/19 PASS.**

This is the same defect class the verification-framework cycle just addressed —
an assertion that assumes one implementation and reports absence of evidence as
evidence of absence. Recording it rather than presenting a clean 19/19.

---

## 4. Sections 1–9, blocked states, badges, diagnostic panel

**All 9 sections return.** Six render populated; the rest render **blocked by
design**, because business metrics exclude internal traffic (INV-25) and 100% of
telemetry is currently internal. That is correct behaviour, not a defect.

**Confidence badges — every rendered value is a known class:**

| Surface | Badge | Rows |
|---|---|---|
| Section 9 breakdown | `modeled` | 22 |
| Sections 1–3 P&L | `blocked` | 1 |
| Section 5 packages | `blocked` | 2 |
| Section 8 students | `blocked` | 9 |

No surface emitted an unknown class or a bare NULL where a class is required.

**Blocked states — 3 blocked coverage metrics, each with a stated reason:**

| Metric | Reason shown to the owner |
|---|---|
| `currency_bridge` | *"cost has no EGP figure: no FX rate covers its month…"* |
| `platform_costs` | *"no source table for platform spend (§9.4)…"* |
| `revenue_cost_overlap` | *"no day has both revenue and cost — every P&L figure is blocked"* |

Plus `ai_cost` **available** (USD 0.22961425), `revenue` **available**
(8 events, EGP 8,542.00), `price_confidence` **modeled**. **Zero blocked metrics
without a reason.**

**Diagnostic panel — present verbatim in the deployed bytes:**

> **Diagnostic.** Shows all observed AI telemetry including internal traffic, so
> its totals deliberately differ from the business metrics in Sections 1–8, which
> exclude internal (INV-25). Nothing here feeds a business KPI.

The model-grain note is also live: cost per question *"is not shown at model
grain … undefined at this grain rather than merely unavailable."*

*(Two phrases initially appeared "missing". Both were my grep patterns: the text
spans JS string concatenation, and I used `grep -c`, which counts lines — this
file is a handful of very long lines. Extracting and flattening the actual string
confirmed the full text is present.)*

---

## 5. No Admin regression

Compared the deployed file against `admin.html` at `02ef794`, the last commit
before the Economics tab existed:

| Measure | Pre-Economics | Deployed | Removed |
|---|---|---|---|
| Functions | 68 | 87 | **0** |
| Tab IDs | 6 | 7 | **0** |
| Pre-existing RPC calls | 5 | 5 | **0** |
| Element IDs | 95 | 105 | **0** |

**+937 / −1 lines.** The single deleted line was:

```js
-const TABS = ['payments','pending','users','founders','settings','credits'];
+const TABS = ['payments','pending','users','founders','settings','credits','economics'];
```

All six original tabs preserved, one appended. The Economics work is **purely
additive**.

**Browser execution of the exact production bytes** — all 6 pre-existing tabs
present in the DOM, all 9 Economics panels present, `switchTab` and all 17
Economics functions defined.

---

## 6. What I could NOT verify, and why

**I could not load the live production page in a browser.** This sandbox's egress
proxy blocks both `si-math-ai.com` and `cdn.jsdelivr.net`
(`ERR_TUNNEL_CONNECTION_FAILED`). I therefore:

- fetched the deployed file through the Vercel API and proved it byte-identical
  to `main`; then
- executed **those exact bytes** in Chromium locally.

That run produced one page error — `ReferenceError: supabase is not defined` —
caused entirely by the blocked CDN, since `window.supabase` never loaded. It is a
sandbox artifact, not a production defect. Function declarations hoist, so the
full inventory was still verifiable.

**Consequently, not verified here:**

1. **Visual rendering** in a real browser against production. Panel *structure*,
   *data* and *copy* are each verified independently, but not the assembled
   pixels.
2. **An authenticated owner session end-to-end.** The database gate is proven
   (`anon` executable on 0 of 19 RPCs; every Economics RPC returns correct data
   under owner impersonation), but no real browser login was performed.

**Recommendation:** open `https://www.si-math-ai.com/admin.html` as the owner and
click through the Economics tab once. Everything measurable from here is green;
this is the one step that needs a human with a real session.

---

## 7. Findings summary

| # | Finding | Severity |
|---|---|---|
| 1 | `admin.html` was already in production via Vercel auto-deploy on `main`; "not deployed" statements described my actions, not production state | **Important** — process, not defect |
| 2 | Merging to `main` cannot hold work out of production; a future hold needs a branch or a Vercel setting change | **Important** |
| 3 | My RPC gate assertion produced 4 false FAILs by assuming one gate convention | Medium — check bug, corrected |
| 4 | My rendering-text greps produced 2 false MISSINGs (line-counting + string concatenation) | Low — check bug, corrected |
| 5 | Live browser verification against production impossible from this sandbox | Low — environmental |
| 6 | Sections 2, 6, 7 and part of 8 render blocked | **None** — correct by design |

**No defect was found in the deployed application.** Every failure in this report
was a defect in one of my checks, and each is recorded rather than smoothed over.

---

## 8. Visual QA — performed by the owner, 2026-08-01

The one step this sandbox could not reach was completed by the owner against
production with a real owner account.

| Check | Result |
|---|---|
| Owner dashboard loads | **pass** |
| Hard refresh, JS console | **no errors** |
| Economics Sections 1–9 render | **pass** |
| Populated sections show data | **pass** |
| Blocked sections show explicit reasons, not blanks | **pass** |
| Section 9 — AI Service & Model Analytics | **pass** |
| Engine Health | **pass** |

**Phase 6 is visually accepted. Closed at 100%.**

### Backlog item raised during QA — non-blocking

**Group repeated `service_no_active_binding` rows under one heading** instead of
repeating the label per service.

Measured, so the item is actionable rather than vague: `owner_cost_health()`
returns **13 rows, of which 5 are `service_no_active_binding`** —
`embedding`, `python`, `sympy`, `translation`, `truth_engine`. Every other metric
appears exactly once. So the panel repeats one label five times, and will repeat
it once more for each service added to the catalog before it makes a call.

| Property | Assessment |
|---|---|
| Severity | **cosmetic** — presentation only |
| Correctness | the data is right; five services genuinely have no active binding |
| Scope | **client-side grouping in the Engine Health renderer** |
| RPC change needed | **no** — `owner_cost_health()` returns `(metric, value, detail)` and grouping by `metric` is display logic, not derivation |
| INV-03 risk | **none**, provided the client groups and counts *rows* and never recomputes a financial figure |

**Deliberately not implemented.** It is non-blocking, it arrived after Phase 6
was frozen, and `admin.html` changes are their own approval. Recorded here so it
is available whenever the dashboard is next opened for work — the natural moment
is alongside Phase 7's Sections 10–11.

---

## Stop

Deployment verified and visually accepted by the owner. **Phase 6 complete and
frozen at 100%.** No Phase 7 work; no business logic, database object, RPC,
migration or verification script was modified.
