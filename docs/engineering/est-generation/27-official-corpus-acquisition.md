# 27 — Official Corpus Acquisition

**STATUS: OFFICIAL CORPUS ACQUISITION — GENERATOR FROZEN**

**Sample Test #4 was not obtained.** Not because it does not exist — its
existence is now confirmed twice over, and this stage pinned its exact location
in the guide — but because **this session has no outbound file-retrieval
capability of any kind.**

The corpus inventory is unchanged: **four distinct official EST I Mathematics
forms.** No unofficial material was used, and one third-party "past papers"
source was found and rejected.

---

## 1. Sources searched, and the boundary that stopped them

### 1.1 Internal — the material already in hand

Re-examined first, because the cheapest place to find Test #4 was the guide
extracts we already hold. **This produced the only new evidence in this stage**
(§3).

### 1.2 External — web search

| query | outcome |
|---|---|
| EST I Practice Guide Math, official, 2026 specifications | publisher and official sites identified |
| "Academic Assessment" EST Egypt official practice guide, five sample tests | publisher confirmed; guides confirmed to exist |
| EST official practice guide, 2024/2025 editions, York Press | **no catalogue found** |
| estests.com official free sample test download / purchase | **no official download path established** |

### 1.3 The boundary: outbound fetching is blocked at the network layer

Every attempt to fetch a page failed with the same error, and the failure is
**not specific to the publisher**:

```
example.com:443             gateway answered 403 to CONNECT (policy denial)
www.google.com:443          gateway answered 403 to CONNECT (policy denial)
en.wikipedia.org:443        gateway answered 403 to CONNECT (policy denial)
egypt.estests.com:443       gateway answered 403 to CONNECT (policy denial)
```

**Search works; fetching and downloading do not.** Search runs through a
different path from the egress proxy. The consequence is precise and worth
stating plainly:

> **No file — official or otherwise — can be acquired, hashed or verified in
> this session.** Steps 1–5 of Priority 1 are not merely unfinished; they are
> not performable here.

The agent-proxy documentation is explicit that a 403 policy denial is to be
reported rather than retried, and it was not retried.

---

## 2. Forms discovered

### 2.1 Sample Test #4 — confirmed to exist, not obtainable here

| | |
|---|---|
| identifier | **EST I Math, Sample Test #4** |
| source | EST I Practice Guide — Math, 2026 Specifications |
| publisher | Academic Assessment Ltd. / York Press Limited (London) |
| existence | **confirmed twice** — the guide's own cover states it holds five sample tests, and the page-range analysis in §3 locates the gap |
| distinct from what we hold | **yes, necessarily** — it is a different test in the same book |
| publicly obtainable | unknown from here; the official site could not be reached |
| downloadable | **not from this session** |
| hash | **none — not obtained** |
| suitable for the coding pipeline | **yes, without caveat.** Same publisher, same 2026 specification, same 50-item/75-minute format. It is the ideal next form |

### 2.2 Additional official forms — the publisher exists, the catalogue does not resolve

| | |
|---|---|
| publisher | **Academic Assessment Ltd.** and **York Press Limited (London)** |
| official sites | `estests.com`, `egypt.estests.com` |
| official practice guides | confirmed to exist; search results indicate Academic Assessment published new practice guides in 2026, "featuring sample tests and detailed explanations" |
| how many official forms exist in total | **not established** |
| earlier-edition guides (2024/2025 specifications) | **not established** — no catalogue was reachable |
| free official download | **not established** |

**One lead, explicitly recorded as unverified.** A third-party preparation site
lists among its resources "9 official EST tests from estests.com". That number is
**not evidence**: it is a marketing claim from a site with an interest in the
count, it does not say whether it counts EST I and EST II, Literacy and Math
separately, or across editions, and it could not be checked against the official
source. It is recorded because it is the only signal found that more than five
official forms might exist, and it is a question for a human with web access, not
a fact.

### 2.3 Found and rejected

| source | why rejected |
|---|---|
| `sat-act-est.com` — "EST Tests PDF (past papers EST Exams) Download" | A third-party site offering "past papers" for download. This is precisely the category the brief excludes: *"third-party 'real test' uploads presented as official."* **Not fetched, not examined, not counted.** |

The brief's exclusions were applied as a filter on what to pursue, not as a
judgement made after looking.

---

## 3. Provenance verification — where Test #4 sits in the guide

The one genuinely new result of this stage, and it came from the material
already held rather than from the web.

The four extracts carry **the guide's own printed folios**, and they are
contiguous:

| extract | PDF pages | first printed folio | guide page range |
|---|---|---|---|
| Sample Test #1 | 32 | (cover, unnumbered) | 1 – 32 |
| Sample Test #2 | 24 | **35** | 35 – 58 |
| Sample Test #3 | 26 | **59** | 59 – 84 |
| **— missing —** | — | — | **85 – 108** |
| Sample Test #5 | 23 | **109** | 109 – 131 |

**Exactly one hole, 24 pages wide** — the same length as the Test #2 extract and
one page longer than Test #5's. Two pages (33–34) sit between the Test #1 and
Test #2 extracts and are presumably a divider or blank.

This is independent of the cover's claim and agrees with it: the guide runs
1–131 with five tests, we hold four contiguous extracts, and **the single gap is
Test #4 at guide pages 85–108.**

It also settles a question worth settling: **Test #4 is not hiding inside
material we already have.** Every page we hold is accounted for.

---

## 4. Hashes

Unchanged from artifact 26, because nothing was acquired.

| publisher's test | md5 | pages |
|---|---|---|
| Sample Test #1 | `3f3328e2d038e1a6a7ba9ccfeb707a36` | 32 |
| Sample Test #2 | `ef52969f9b1542594c64035c9befdf7c` | 24 |
| Sample Test #3 | `0b06707d4d833cb97ee7f8eda648af43` | 26 |
| Sample Test #5 | `5cc42833c8ef77bf89dbaa735f173153` | 23 |
| **Sample Test #4** | **— not obtained —** | — |

---

## 5. Duplicate analysis

Unchanged and re-confirmed. Five EST filenames, **four distinct documents**:
`est1_Guide_test5_1` and `est1_Guide_test5_2` share md5
`5cc42833c8ef77bf89dbaa735f173153` — the same file uploaded twice. The
duplicate is identified by hash, never by filename.

No new files entered the session, so no new duplicate analysis was possible.

---

## 6. Availability status

| item | exists | reachable from this session | obtainable by a human |
|---|---|---|---|
| Sample Test #4 | **yes, confirmed** | **no** — egress blocked | very likely: it is a page range in a book we already partly hold |
| Official EST practice guides generally | yes | no | yes, via the publisher |
| Full official form catalogue | unknown | no | yes, by asking the publisher |
| Earlier-edition official guides | unknown | no | unknown |
| Third-party "past papers" | yes | not attempted | **excluded by rule** |

---

## 7. Final official-form inventory

**Unchanged.**

| | |
|---|---|
| distinct official EST I Math forms held | **4** |
| coded | **4** |
| acquired this stage | **0** |
| known to exist and not held | **1** (Sample Test #4, guide pp. 85–108) |
| official forms established to exist beyond the guide's five | **0** |
| unofficial material admitted | **0** |

---

## 8. Was Test #4 obtained?

**No.**

- It exists — confirmed by the guide's cover and by the 24-page gap at pp. 85–108.
- It was not acquired, because **no file can be retrieved into this session at
  all.** Every host tested returns a 403 CONNECT policy denial.
- It was not substituted. No third-party copy was fetched, and the one
  "past papers" site found was rejected on sight of what it is.

---

## 9. Do additional official forms exist?

**Undetermined, and honestly so.**

What is established: the publisher is Academic Assessment Ltd. with York Press
Limited, the official sites are `estests.com` and `egypt.estests.com`, official
practice guides exist and were refreshed for the 2026 specification.

What is not: how many official EST I Mathematics forms exist in total, whether
earlier-edition guides contain further distinct forms, and whether any are
freely downloadable. **Each of those questions needs one page-load from the
official site, and this session cannot load a page.**

The unverified third-party claim of "9 official EST tests" is recorded in §2.2 as
a lead, not as a finding.

---

## 10. Explicit next step

**This is a human acquisition task, not an agent task.** The blocker is network
policy, and no amount of further searching from here changes it.

**Step 1 — obtain Sample Test #4.** The likeliest route is the source the other
four came from: the same EST I Practice Guide — Math (2026 Specifications), pages
85–108. Whoever produced the four extracts we hold can almost certainly produce
the fifth from the same book. **That is one page range from a book already in the
project's possession, and it is by far the cheapest form the corpus will ever
acquire.**

**Step 2 — ask the publisher the catalogue question.** Via `estests.com` or
`egypt.estests.com`: how many official EST I Mathematics practice forms exist
across all editions, and are earlier-specification guides still available? This
is the question artifact 26 §16 identified as deciding the programme's shape, and
it has still never been answered.

**Step 3 — then, and only then, resume.** If Test #4 arrives, the next phase is
to code it under the frozen taxonomy and update the corpus statistics — five
forms, ten pairwise comparisons instead of six. **That does not reach any
threshold in artifact 25** and must not be presented as if it did; its value is
that it is certain, immediate, and exercises the coding pipeline before a larger
batch.

**What must not happen:** unofficial material substituted; the SAT forms merged;
the 2.3% overlap figure reinterpreted before the corpus grows; or the generator
unfrozen because acquisition stalled.

---

## What was verified, and what was not

**Verified by running it.** The egress boundary — four hosts tested, four 403
CONNECT denials, including two that have nothing to do with this project, which
is what establishes the block as general rather than publisher-specific. The
guide's page structure, read from the printed folios in the PDFs we hold: 1–32,
35–58, 59–84, **gap 85–108**, 109–131. The duplicate, re-confirmed by hash. The
publisher's identity, from web search. CI **79 of 79 green**; the baseline
validator passes and now records where Test #4 sits and why it was not acquired.

**Not verified, and not claimed.** Nothing on the official site was read — it
could not be reached. The "9 official EST tests" figure is an unverified
third-party marketing claim and is not used anywhere. Whether Test #4 is freely
downloadable, purchasable separately, or only inside the full guide is unknown.
No file was acquired, so no hash, no provenance chain and no distinctness check
was possible for anything new. The rejected "past papers" site was **not
fetched** — its rejection rests on what it advertises itself as.

**Standing constraints, all held.** Generator frozen — no primitive, blueprint,
allocation policy, difficulty model or QA rule touched. ESTM1-2026-A, P1, P2, P3
untouched. P4 not generated. Forms 2–25 not generated. No exam content in this
repository. The 2.3% reference overlap is not reinterpreted anywhere in this
document.

---

**Sources consulted (search only; none could be fetched):**
[EST — official site](https://www.estests.com/) ·
[EST Egypt](https://egypt.estests.com/faqs) ·
[The Test Advantage — EST in Egypt 2026](https://thetestadvantage.com/blog-details/86) ·
[The Test Advantage — EST resources](https://thetestadvantage.com/blog-details/88) ·
[sat-act-est.com — EST overview](https://sat-act-est.com/overview-of-the-egyptian-scholastic-test-est/)
