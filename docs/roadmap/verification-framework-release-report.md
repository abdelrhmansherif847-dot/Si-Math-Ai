# Verification Framework — Release Report

**Status: applied, gate PASSED.** Verification scripts only. No business,
economics or cost-engine logic touched; no migration; no deployment.

| | |
|---|---|
| Branch | `claude/verification-framework-audit` → merged to `main` |
| Database objects changed | **0** |
| Migrations applied | **0** |
| Checks with changed logic | 20 of 44 |
| Checks byte-identical | 24 |
| Checks added / removed | **0 / 0** |
| Modified-check gate | **20/20 behave as designed** |
| Economics suite | **17 PASS, 1 VACUOUS** |
| Cost Engine suite | **20 PASS, 5 VACUOUS, 1 WARN** |
| `admin.html` deployed | **no** |

---

## 1–2. Apply, and the applied state

**There is no database apply for this change set, and that is the point.** It
modifies two `.sql` verification *scripts* — read-only diagnostic queries run by
`psql`. It creates no function, view, table or migration. The "apply" is the
files landing on `main`.

Database state confirmed **identical to the M4.3 closeout baseline**:

| Measure | Value | vs M4.3 closeout |
|---|---|---|
| `aiecon` migrations applied | 16 | unchanged |
| Latest migration | `20260801135335 aiecon_p6_m4_3_service_quality` | unchanged |
| `econ` views / functions | 11 / 7 | unchanged |
| `owner_econ_*` / `owner_cost_*` RPCs | 12 / 6 | unchanged |
| Priced cost facts / total | 76 / **$0.22961425** | unchanged |

---

## 3. Every modified verification, reported individually

### Economics — 11 modified checks

| Check | Verdict | Evidence |
|---|---|---|
| `P5-01` | **PASS** | 0 price-book edges of **44** econ→cost_engine edges examined |
| `P5-02` | **PASS** | 0 forbidden identifier columns of **98** econ columns |
| `P5-02b` | **VACUOUS** | 0 of **0** service_code rows across 0 views — *correctly abstains* |
| `P5-05` | **PASS** | 0 of **12** `owner_econ_*` executable by anon |
| `P5-07` | **PASS** | 0 of **9** money-bearing views missing confidence |
| **`P5-09`** | **PASS** | 0 revenue→cost + 0 cost→revenue edges among **30** examined — *was a constant* |
| `P5-10` | **PASS** | 0 of **383** blocked carry profit; 0 of **0** computed carry a reason |
| `P5-11` | **PASS** | 0 of **383** rows lacking a stated reason |
| `P5-12` | **PASS** | 0 of **383** blocked rows mismarked |
| `P5-14` | **PASS** | 0 of **3** blocked coverage metrics without a reason |
| `P5-15` | **PASS** | 0 of **11** econ views hardcoding a confidence class |

### Cost Engine — 9 modified checks

| Check | Verdict | Evidence |
|---|---|---|
| `P4-07` | **PASS** | 76 telemetry rows, 76 current facts, 0 with no fact — *now emits a row even if the source is empty* |
| `P4-08` | **PASS** | coverage 100.00%, **76** rows examined — *NULL-with-data now FAILs, no longer WARN* |
| `P4-09` | **PASS** | binding resolution 100.00%, **76** rows examined |
| `P4-10` | **VACUOUS** | 0 of **0** unpriced facts — *correctly abstains* |
| `P4-11` | **VACUOUS** | 0 of **0** unpriced facts — *correctly abstains* |
| **`P4-17`** | **PASS** | **0 of 2** allocation runs failed conservation; latest conserved=true, variance 0 — *was 1 of 2* |
| `P4-20` | **VACUOUS** | 0 of **0** shared-cost requests — *correctly abstains* |
| `P4-22` | **VACUOUS** | 0 of **0** unknown work items — *correctly abstains* |
| `P4-30` | **VACUOUS** | 0 of **0** `invoice_verified` work items — *correctly abstains* |

**20/20 modified checks behave exactly as designed.** No check failed; no
investigation was triggered.

---

## 4. Economics suite — **17 PASS, 1 VACUOUS**

`P5-01` `P5-02` `P5-03` `P5-04` `P5-05` `P5-06` `P5-07` `P5-08` `P5-09` `P5-10`
`P5-11` `P5-12` `P5-13` `P5-14` `P5-15` `P5-16` `P5-17` — **PASS**
`P5-02b` — **VACUOUS**

`P5-17`: 12 `owner_econ_*` RPCs invoked, **0 raised**.
`P5-04`: 12 functions, 12 STABLE+SECDEF, 12 owner-gated.

## 5. Cost Engine suite — **20 PASS, 5 VACUOUS, 1 WARN**

`P4-01`…`P4-09`, `P4-12`…`P4-19`, `P4-21`, `P4-23`, `P4-29` — **PASS**
`P4-10` `P4-11` `P4-20` `P4-22` `P4-30` — **VACUOUS**
`P4-31` — **WARN** (unchanged, pre-existing: 76 of 76 facts list-priced)

`P4-24`…`P4-28` not run — write-path, as in every prior milestone.

Conservation identities unchanged: `P4-15` and `P4-16` both reconcile to
`0.22961425` with variance `0.00000000`.

---

## The number that changed, and why it is not a regression

| Suite | Before | After |
|---|---|---|
| Economics | 18 PASS | 17 PASS + 1 VACUOUS |
| Cost Engine | 25 PASS + 1 WARN | 20 PASS + 5 VACUOUS + 1 WARN |

**Six checks moved PASS → VACUOUS. Nothing regressed.** Each was already
examining zero rows and printing PASS indistinguishably from a check that
examined 383. The verdict changed; the underlying facts did not.

Anyone comparing against the historical "18/18" and "25 PASS + 1 WARN" lines
should expect this. Each returns to PASS automatically, with no code change, the
moment its population becomes non-empty — an unpriced fact, a shared-cost
request, an `unknown` work item, an `invoice_verified` item, or external traffic.

---

## Correction made during this gate

The engineering review's cost-engine summary table said **"21 PASS, 4 VACUOUS"**
and omitted `P4-30` from the VACUOUS list. The measured result is **20 PASS,
5 VACUOUS, 1 WARN = 26**. The review has been corrected in place with a dated
note; no script changed, since the scripts were already right — only my summary
of them was wrong.

---

## Falsifiability evidence

The whole point of this change set is that a green check must be able to go red.
Twelve negative controls drove every new verdict path to the outcome it claims to
detect, on synthetic read-only fixtures. **12/12 as expected.** The two that
matter:

| Control | Old form | New form |
|---|---|---|
| An **older** allocation run broke conservation, latest is fine | **`PASS`** — never looked at it | **`FAIL`** |
| Source relation returns **zero rows** | **no row emitted** — check vanished | **1 row, `FAIL`** |

---

## Scope discipline

| | |
|---|---|
| Economics logic changed | `P5-01 02 02b 05 07 09 10 11 12 14 15` (11) |
| Economics byte-identical | `P5-03 04 06 08 13 16 17` (7) |
| Cost engine logic changed | `P4-07 08 09 10 11 17 20 22 30` (9) |
| Cost engine byte-identical | `P4-01…06 12…16 18 19 21 23 29 31` (17) |
| New assertions introduced | **0** — none beyond the approved scope |

Compared on comment-stripped, whitespace-normalised statement bodies, so
documentation-only edits are not counted as logic changes.

**Deliberately not done:** population-conservation checks and the `jsonb`-scan
form of `P5-02b`. Both are new assertions rather than repairs of existing ones,
and both were held for separate approval.

---

## Stop point

Gate complete and green. Proceeding to housekeeping, closeout and merge, per the
approved workflow. No Phase 7 work; `admin.html` not deployed.
