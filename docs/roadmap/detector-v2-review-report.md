# Detector v2 Shadow Review — Report Template

Run the queries in `detector-v2-shadow-monitoring.sql` at each checkpoint and
fill in the sections below. One report per checkpoint (50 / 100 / 200 v2 records).

---

## Checkpoint: `<50 | 100 | 200>` v2 records

**Date:** `<YYYY-MM-DD>`
**Deployed v2 commit:** `164dad4`
**Window:** `<earliest_record>` → `<latest_record>` (from Q0)

---

### 1. Volume

| Metric | Value | Source |
|---|---|---|
| v2 records collected | | Q0 `v2_records` |
| v1 records (all) | | Q0 `v1_records` |
| v1 default_medium subset | | Q0 `v1_default_medium_records` |
| v2 coverage of default_medium | `v2_records / v1_default_medium_records` | derived |

### 2. v2 Tier Distribution (Q1)

| Tier | Count | % |
|---|---|---|
| easy   | | |
| medium | | |
| hard   | | |
| expert | | |

### 3. v1 vs v2 — Side-by-Side Over the Same Subset (Q2)

Note: v1 is 100% `medium` by construction over this subset (default_medium fallback).
v2 reveals the real spread of those previously-uncategorised questions.

| Tier | v1 % | v2 % | Δ (v2 − v1) |
|---|---|---|---|
| easy   | 0 | | |
| medium | 100 | | |
| hard   | 0 | | |
| expert | 0 | | |

### 4. Agreement Rates (Q3)

| Comparison | % |
|---|---|
| v2 agrees with GPT-stated difficulty | |
| v2 agrees with v1 (medium) | |

### 5. Examples — v1=medium, v2=hard (Q4)

Paste up to 10 rows. Look for: multi-step problems, image questions with several
sub-parts, geometry proofs that v1 missed because no `proof_keyword`.

```
id | topic/subtopic | gpt_difficulty | v2 tier | question preview
---+----------------+----------------+---------+---------------------------------
   |                |                |         |
```

**Qualitative read:** Are these genuinely hard? Yes / No / Mixed — comments:

### 6. Examples — v1=medium, v2=easy (Q5)

Paste up to 10 rows. Look for: short single-step arithmetic that v1 missed
because it was just over the character threshold or had two topic keywords.

```
id | topic/subtopic | gpt_difficulty | v2 tier | question preview
---+----------------+----------------+---------+---------------------------------
   |                |                |         |
```

**Qualitative read:** Are these genuinely easy? Yes / No / Mixed — comments:

### 7. Latency (Q6)

| Stat | ms |
|---|---|
| samples | |
| mean    | |
| p50     | |
| p95     | |
| max     | |
| min     | |

Budget: `<2 s p95` is safe (background `waitUntil`, no student impact).
Flag if mean > 1 s or p95 > 3 s.

### 8. Unexpected Classifications

- **v2='expert' on default_medium fallback (Q7a):** `<count>` records — list any that look wrong
- **v2_raw not in {easy,medium,hard,expert} (Q7b):** `<count>` — should always be 0. If non-zero, parser needs hardening
- **v2 latency > 2 s (Q7c):** `<count>` — list outliers and check whether they correlate with image-heavy questions

### 9. Decision

Pick one:

- [ ] **Continue collecting** — not enough signal yet to act
- [ ] **Promote v2 to primary** — escalation tier replaces v1's default_medium for the L3 pipeline routing decision
- [ ] **Revert v2** — quality too low, latency too high, or budget too costly. Set `DIFFICULTY_DETECTOR_V2_ENABLED=false`
- [ ] **Iterate v2 prompt** — specific issues to fix (list them)

**Rationale:** `<2-3 sentences>`

**Next checkpoint:** `<date / # records>`
