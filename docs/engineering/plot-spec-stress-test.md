# Plot spec — stress test against figures we do not have yet

**Gate before the migration.** 2026-08-26. The dictionary was written from the
figures that exist. This tests it against the ones that do not, on the rule that
every case must land in exactly one of three buckets:

| bucket | meaning |
|---|---|
| ✅ **representable** | expressible correctly today |
| ⏸ **deferred** | not expressible, deliberately, with the reason recorded — and **not fakeable** |
| ⛔ **refused** | the validator rejects the attempt |

A fourth outcome is the one to hunt for: **representable *ambiguously*** — where
an author can write something that stores fine and silently means the wrong
thing. Two cases land there, and both produce a new invariant.

---

## Results

| # | case | verdict |
|---|---|---|
| 1 | a single named point | ✅ |
| 2 | a line extending both ways | ⚠️ → ⏸ **with P10** |
| 3 | a ray | ⚠️ → ⏸ **with P10** |
| 4a | open/closed boundary on a number line | ✅ |
| 4b | open/closed boundary of a region on a plane | ⏸ |
| 5 | region / shading | ⛔ (cannot be expressed at all) |
| 6 | more than one curve in a figure | ✅ *(with a rendering limit, below)* |
| 7 | a circle with a labelled centre | ✅ |
| 8 | segment against line | ⚠️ → ⏸ **with P10** |
| 9 | a graph with an asymptote or discontinuity | ⚠️ **the one genuine hole** |

---

### 1 · A single named point — ✅

```jsonc
{ "frame": "plane", "xRange": [-1,6], "yRange": [-1,6],
  "curves": [{ "figure": "scatter", "points": [[3,4]], "pointLabels": ["P"] }] }
```
Works only because of the P8 change. Under the current validator this is
**impossible**, which is what made it worth finding.

### 2, 3, 8 · Line, ray, segment — ⚠️ ambiguous, and now refused

There is no `extends`, so a line is not expressible. That is fine as a
deferral — but it is **fakeable**, and that is not fine. An author writes a
two-point `polygon` spanning the whole window:

```jsonc
{ "figure": "polygon", "points": [[-10,-20],[10,20]] }   // xRange [-10,10]
```

It stores cleanly, and the renderer draws a segment from edge to edge that
**looks exactly like a line**. Two different mathematical objects, one
representation, no way to tell them apart.

> **New invariant P10 — a segment may not end on the visible boundary.**
> A two-point `polygon` whose endpoint lies on `xRange` or `yRange` is refused.

That scopes precisely to the ambiguous case: a `curve` may still run to the edge
(function graphs do), and a closed polygon is bounded anyway. A segment that
genuinely wants to reach the edge means the window is too tight, and the author
widens it. With P10 a line cannot be faked, so cases 2, 3 and 8 become honest
deferrals — and when `extends` arrives, an arrowhead at the boundary will mean
one thing only.

### 4 · Open and closed boundaries

**On a number line — ✅.** `fromClosed` / `toClosed` already exist and are
already semantic. This is the precedent the whole change was argued from.

**As the boundary of a region on a plane — ⏸.** Deferred with regions. The
fakeability question was checked: could an author encode strictness as
`display: {dashed: true}` and have it silently ignored? Yes in principle — but
when regions land, strictness will be a property of *the region's boundary*,
carrying its own key. `display.dashed` will never be the carrier. Recorded so
that stays true.

### 5 · Region and shading — ⛔

There is no fill concept anywhere in the spec, and no way to approximate one.
The strongest possible outcome: it cannot be got wrong because it cannot be
written at all.

### 6 · More than one curve — ✅, with a rendering limit worth stating

`curves` is an array with no upper bound, so any number is representable and the
common two-curve cases already work.

**The limit is in the renderer, not the schema:** it cycles three series
colours, so a fourth curve reuses the first. Identity is never colour-alone
(form and labels carry it), so nothing is *wrong* — but a four-curve figure
needs a rule before it is authored. Noted, not fixed.

### 7 · A circle with a labelled centre — ✅

```jsonc
{ "frame": "plane", "xRange": [-2,8], "yRange": [-3,7],
  "curves": [
    { "figure": "curve", "closed": true, "points": [ /* 12 samples */ ] },
    { "figure": "scatter", "points": [[3,2]], "pointLabels": ["O"] }
  ] }
```

This case is the argument for two of the changes at once: it needs the
single-point minimum **and** multiple curves in one figure. Neither was
motivated by any DSAT item.

### 9 · Asymptote or discontinuity — ⚠️ the one genuine hole

**Correct:** one `curve` entry per branch. Two entries for `y = 1/x`, and it
renders exactly right.

**Wrong, and storable:** all the points in a single `curve`. The renderer joins
across the gap and draws a spurious near-vertical line through the asymptote —
a figure that asserts the function is continuous where it is not.

**The validator cannot catch this.** Distinguishing "a steep segment" from "a
discontinuity" requires knowing the function, which the spec does not carry.
It is genuinely undecidable at the CHECK level, and inventing a threshold in
SQL would be a rule that fires on legitimate steep curves.

**Mitigation, honestly labelled as a mitigation:** a preflight check at
authoring time flagging any curve where one sample-to-sample jump is wildly out
of proportion to its neighbours, plus the authoring rule *one continuous branch
per curve entry*. That catches the realistic mistake without pretending the
schema prevents it.

**This is the one case that stays in the dangerous middle**, and it should be
approved knowingly rather than discovered later.

---

## What the stress test changes

1. **P10 added** — a two-point `polygon` may not end on the visible boundary.
   Without it, "line", "ray" and "segment" are one representation with three
   meanings.
2. **Discontinuity recorded as an accepted, mitigated hole** — not silently
   left as though the validator handles it.
3. **A rendering limit noted** — more than three curves reuses series colours.
4. **Two changes confirmed as load-bearing beyond DSAT:** the single-point
   minimum and multi-curve figures are both required by case 7, which no
   current item needed.

Nothing here enlarges the vocabulary. P10 is a refusal, not a new key.
