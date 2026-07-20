# Image Preview Viewer — Performance Notes

Performance baseline for the full-screen image preview viewer in the AI Tutor
chat (`chat.html`, Feature #1). Recorded as a follow-up to the pre-merge
engineering review so future changes have a reference point.

- **Component:** `chat.html` — the `IMAGE PREVIEW VIEWER (Feature #1)` script +
  its `.img-viewer` CSS block. Dependency-free (vanilla JS + CSS transforms).
- **Date:** 2026-07-20
- **Measured on:** headless Chromium 1194 (Playwright), Linux, viewport
  1000×800. Numbers are indicative of this environment, not absolute hardware
  guarantees; treat them as a relative baseline to catch regressions.

## 1. Startup JS execution timing

One-time cost of the viewer initialising on page load: building the single
overlay element (`createElement` + `innerHTML` + append to `body`) and wiring
its event listeners. Measured execution-only via `performance.measure()`
around the init call, across 20 fresh page loads.

| metric | value |
|--------|-------|
| min | 0.40 ms |
| **median** | **0.50 ms** |
| mean | 0.76 ms |
| max | 5.70 ms (first-load / JIT warm-up outlier) |

**Takeaway:** sub-millisecond startup. No libraries and **zero added network
requests** (verified) — the viewer adds ~13 KB of inline JS/CSS to a file that
is already ~226 KB, so parse cost is negligible. It builds exactly one DOM node
and attaches a fixed set of delegated listeners; nothing scales with the number
of chat messages or images.

## 2. Heap before / peak / after a large preview session

Worst-case-ish session: a single message group of **10 images at 1600×1200**,
generated through the *same* pipeline the app uses for real uploads
(`canvas.toDataURL('image/jpeg', 0.85)`), so both the decoded pixel dimensions
and the base64 string sizes match production. The 10 data-URL strings total
**17.4 MB**. The session runs 5× (open → page through all 10 with zoom+pan →
close). JS heap read via `performance.memory.usedJSHeapSize` with
`--enable-precise-memory-info` and forced GC (`--expose-gc`).

| point | JS heap | vs baseline |
|-------|---------|-------------|
| BEFORE (gc, images in DOM) | 3.0 MB | — |
| PEAK (viewer open) | 29.8 MB | +26.8 MB (transient) |
| AFTER (gc, closed) | 3.7 MB | +0.7 MB (within noise) |

**Takeaway:** the peak is **transient and bounded**, and heap returns to
baseline after close → **no JS-heap leak** across repeated sessions. The
~27 MB transient peak is dominated by `srcs` holding a copy of all 10 data-URL
strings (~17 MB) while the viewer is open, plus per-image decode/GC churn from
rapid paging. On close, `srcs` is emptied and `img.src` is removed, releasing
both the strings and the decoded bitmap.

### Caveats on the heap numbers
- `usedJSHeapSize` measures the **JS heap**, which is the leak-relevant part
  (string/reference retention). **Decoded image bitmaps** (each 1600×1200 ≈
  7.7 MB) largely live in the browser's image cache *outside* the JS heap, so
  they are only partially reflected above. They are released when `img.src` is
  cleared on close (verified structurally: `src` is `null` after close, and DOM
  node count is stable across 100 open/close cycles).
- `performance.memory` is Chromium-only and coarse; Firefox/Safari have no
  equivalent. The figures are a Chromium baseline, not cross-engine.
- Real uploads are typically **smaller** than this test (a 1600 px photo at JPEG
  0.85 is usually ~0.3–0.8 MB), so day-to-day sessions sit well under the peak
  here. Ten large images in one message is the practical ceiling
  (`MAX_ATTACHMENTS = 10`).

### Optional future optimisation
`srcs` currently copies the group's data-URL strings on open. Holding element
references and reading `.src` lazily per navigation would drop the transient
string retention (~17 MB above) to a single image's worth. Not needed at
current scale — noted only if very large multi-image groups become common.

## How to reproduce
Both measurements were produced by extracting the viewer's real CSS/JS from
`chat.html` into standalone Playwright harnesses:
- **Startup:** wrap the viewer IIFE so it is callable, then
  `performance.measure()` around a single invocation, averaged over 20 loads.
- **Heap:** render 10 `canvas.toDataURL('image/jpeg',0.85)` images into one
  `.q-imgs` group; launch Chromium with `--enable-precise-memory-info
  --js-flags=--expose-gc`; sample `usedJSHeapSize` after GC at
  before/peak/after points while driving open→navigate→zoom→close.
