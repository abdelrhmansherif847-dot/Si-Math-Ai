# Clipboard image paste in the chat composer

**Shipped 2026-08-06.** Ctrl+V inside the Zero composer attaches any image on
the clipboard. Verified in Chromium against the real shipped source: a real PNG
on the real system clipboard, a real `Control+V`, a real thumbnail.

The student's path becomes **screenshot → Ctrl+V → Enter**, replacing
save-image → open dialog → browse → select. That is the entire point of the
change; everything below is about doing it without growing a second pipeline.

## The one design decision

`processImageFile(f, inputEl, onSettled)` in `chat.html` was already the whole
image pipeline — 20 MB cap, MIME allowlist, `FileReader`, canvas downscale to
1600 px, `toDataURL('image/jpeg', 0.85)`, push to `pendingAtts`. It takes a
`File`, and **the clipboard hands out `File` objects**. So paste is a feed into
the existing function, not a path beside it.

That is load-bearing rather than tidy: OCR, compression, the multi-image OCR
list, the `image_url` replay blocks on session rehydration and the AI call all
read `pendingAtts`. A pasted image that entered any other way would diverge from
an uploaded one at every one of those points. By the time `send()` runs, nothing
downstream can tell the two apart — `tests/clipboard-paste.test.mjs` asserts this
directly by comparing a pasted attachment against a picked one field-for-field.

## Text and images together

Copying a region of a PDF or a Word document puts **both** on the clipboard. Both
are preserved:

| Clipboard holds | Behaviour |
|---|---|
| Text only | Untouched. The handler returns before any logic; the browser pastes as always |
| Image only | Image attaches; `preventDefault()` (there is no text to insert) |
| Text **and** image | Image attaches **and** the default paste runs, so the text lands in the textarea |
| A non-image file (PDF, zip, text file) | Nothing. Handed straight back to the browser |

`preventDefault()` fires **only** when `getData('text/plain')` is empty. An
ordinary Ctrl+V of text never reaches a line of this handler's logic — that is
what keeps the change from being a regression risk for every student who has
never pasted an image.

Rejection of unsupported content is **silent**. An alert there would fire on
every ordinary text paste, which is why "clean rejection" here means handing the
event back, not reporting it.

## `pastePending`

The file picker has a dialog to acknowledge that something happened; Ctrl+V has
nothing. A large pasted screenshot spends a beat in `FileReader` + canvas, during
which the composer would look inert. `pastePending` counts images still decoding,
keeps the strip visible, and shows `Pasting image…` / `Pasting N images…`.

It also does real work beyond cosmetics:

- **It counts against `MAX_ATTACHMENTS`.** Two pastes in the same tick, before
  either decodes, cannot overshoot the cap.
- **It requires `onSettled` to fire on every exit path** — including the three
  rejections and the `FileReader` error. A rejected file that never settled
  would leave `Pasting image…` on screen permanently. Each rejection branch in
  `processImageFile` now calls `settle()`, and the suite covers each one.

Beyond the cap, the paste path raises **one** message for the whole paste rather
than `processImageFile`'s per-file alert — pasting a dozen images must not
produce a dozen dialogs.

## Verification

`tests/clipboard-paste.test.mjs` — 46 checks, extracting the real bytes from
`chat.html` per `tests/_source.mjs`. Per `verification-framework-audit.md`, the
suite was mutation-tested rather than assumed: four deliberate breaks were
introduced and each went red.

| Mutation | Checks that failed |
|---|---|
| Always `preventDefault()` | 1 — the text half of a mixed paste |
| Drop `settle()` from the oversize rejection | 2 — the hint hangs |
| Remove cap trimming | 4 — the cap is exceeded |
| Attach directly, bypassing `processImageFile` | **14** |

The last row is the requirement "reuse the pipeline, do not duplicate it" made
enforceable: a future edit that quietly re-implements attachment inside the paste
handler cannot pass CI.

The unit suite fakes `DataTransfer`, `FileReader`, `Image` and canvas — exactly
where browsers differ — so a real-browser smoke test was run alongside it:
Playwright/Chromium, 17 checks, real clipboard write, real `Control+V`, real
`DataTransfer`, and a decode of the resulting data URL proving the 2400×1200
source really came back as a 1600×800 JPEG.

That smoke test is **not committed**, on purpose. It needs Playwright and a
browser binary, and this repo has no `package.json` and no install step by
design — adding a suite CI cannot run would either break `run-all.mjs` or be
skipped silently, and a skipped check is not evidence. The committed suite
covers the same logic against the same bytes; the browser run covers the
platform APIs the suite has to fake, and is re-runnable on demand.

## Scenario verification (2026-08-06)

Two real-world capture routes were verified before merge. The native menus
cannot be driven from Linux/headless, so what was driven is the thing that
decides the outcome: the **clipboard payload each tool produces**, replayed
through a real Chromium clipboard, a real `Control+V`, and the real handler.
24/24 checks passed. The payload shapes were **measured, not assumed**.

| Route | Measured `clipboardData.types` | Result |
|---|---|---|
| Snipping Tool / Win+Shift+S | `["Files"]` — one synthesized `image.png`, no text | Attaches; `preventDefault()`; nothing typed |
| Chrome → Copy Image | `["text/html","Files"]` — bitmap **plus** the original `<img src>` | Attaches; `preventDefault()`; **URL not typed** |
| Selecting an image → Ctrl+C | `["text/plain","text/html"]` — **no file at all** | Handler stands down; alt text pastes normally |

All three downscale branches were exercised on real captures: 2560×1440 →
1600×900 (width branch), 900×2400 → 600×1600 (height branch, which the wide
case never reaches), and 420×300 unchanged. A 4K snip is nowhere near the 20 MB
refusal and compresses on the way in.

**The convergence check is the one that answers "same pipeline, no special
cases".** The same source bytes were pushed through all three routes — a
Snipping-Tool-shaped clipboard, a Copy-Image-shaped clipboard, and the file
picker — and produced **byte-identical** attachments. A static check backs it
up: the handler branches on nothing but the `image/` MIME prefix (no filename
sniffing, no `userAgent`, no platform test).

Two findings worth carrying forward:

1. **Selection-copy is not an image-paste route.** Selecting a picture on a page
   and pressing Ctrl+C gives Chromium no file — only the alt text and an HTML
   fragment. The student must use right-click → **Copy Image**. Nothing is
   broken by this (the alt text pastes as it always did), but it is the one
   place where a student may expect an attachment and not get one.
2. **The source URL stays out of the message because Chromium leaves
   `text/plain` empty on Copy Image** — measured, not assumed. Should a browser
   ever mirror the URL into `text/plain`, "preserve both" would type that URL
   into the composer alongside the image. That was tested explicitly; the
   outcome is visible and deletable rather than silent, and no measured browser
   does it. Left unhardened on purpose: special-casing it would mean guessing
   which text a student meant to keep, and the case that genuinely happens —
   copying text *and* a figure out of a PDF — needs the text kept.

Canvas taint was checked too: the clipboard hands over a `File` with no origin
and the pipeline routes it `File → FileReader → data: URL → img`, so
`toDataURL()` cannot throw. This matters because a throw there would skip both
the push and `settle()`, hanging the decoding hint.

## Two things this did NOT do

1. **Drag & drop was requested as "must not regress" — it does not exist.**
   There is no `drop`, `dragover` or `dataTransfer` handler anywhere in
   `chat.html`, before or after this change. It would be a small addition
   reusing `processImageFile` the same way paste does, but it is a separate
   feature and was not built here.
2. **"Upload progress" has no counterpart to be consistent with.** Attaching is
   entirely local; nothing reaches the network until Send, and the image travels
   inside the message payload. `pastePending` is a decoding indicator, not an
   upload meter, and is deliberately named as such.

## Known, pre-existing, unchanged

Attaching an image while a PDF is pending appends it next to the PDF rather than
replacing it (`qPdf`'s handler replaces attachments; the image path does not).
Paste inherits this exactly — it behaves identically to the file picker. Not
introduced here and not fixed here; noted so it is not mistaken for paste-only
behaviour.

A pasted **PDF file** is ignored rather than routed into the PDF attachment path.
Paste covers images only.
