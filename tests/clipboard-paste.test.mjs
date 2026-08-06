// Clipboard image paste in the chat composer (Ctrl+V).
//
// The feature's whole value is that it is NOT a second upload path: a pasted
// screenshot is handed to the same processImageFile() a picked file goes
// through, so it gets the same size cap, MIME allowlist, canvas downscale and
// pendingAtts entry, and nothing downstream — the send payload, OCR, the AI
// call — can tell the two apart. The load-bearing assertion in this suite is
// therefore the equivalence one: paste and file-picker produce byte-identical
// attachments. Everything else guards a specific way that could break.
//
// Both blocks are extracted from the shipped chat.html and executed for real,
// per tests/_source.mjs — a paraphrase of the handler could pass while the page
// is broken.
import { suite } from './_assert.mjs';
import { read, slice } from './_source.mjs';

const t = suite('clipboard-paste');

const SRC = read('chat.html');
const MODEL = slice(SRC, 'const MAX_ATTACHMENTS=10;',
  '/* ============================================================\n     MATH INTENT GATE',
  'attachment model');
const PIPE = slice(SRC, '// Shared image processing', '// Confidence selector', 'image pipeline');

// ── Fake DOM ───────────────────────────────────────────────────────────────
// Only what the two extracted blocks actually touch. The elements they close
// over (imgPreview, ipStrip, ipHint, the file inputs, the textarea) are
// declared ABOVE the slices in chat.html, so they arrive as parameters.
function makeEl() {
  const listeners = {};
  return {
    style: {}, value: '', files: [], innerHTML: '', textContent: '',
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    fire(type, ev) { (listeners[type] || []).forEach(fn => fn(ev)); },
    count(type) { return (listeners[type] || []).length; },
  };
}

function harness() {
  const alerts = [];
  const imgPreview = makeEl(), ipStrip = makeEl(), ipHint = makeEl();
  const removeImg = makeEl(), qImage = makeEl(), qGallery = makeEl(), input = makeEl();

  class FakeFileReader {
    readAsDataURL(f) {
      queueMicrotask(() => {
        if (f.unreadable) { if (this.onerror) this.onerror(); return; }
        if (this.onload) this.onload({ target: { result: f.dataUrl } });
      });
    }
  }
  class FakeImage {
    set src(v) {
      this._src = v;
      queueMicrotask(() => {
        if (/undecodable/.test(v)) { if (this.onerror) this.onerror(); return; }
        this.width = 2400; this.height = 1200;   // oversized on purpose: must be downscaled
        if (this.onload) this.onload();
      });
    }
    get src() { return this._src; }
  }
  const document = {
    createElement() {
      const c = {
        width: 0, height: 0,
        getContext: () => ({ drawImage() {} }),
        // Encodes the real canvas geometry and quality so a test can prove the
        // downscale ran rather than trusting a constant string.
        toDataURL: (type, q) => `data:image/jpeg;base64,${c.width}x${c.height}@${q}`,
      };
      return c;
    },
  };

  const api = new Function(
    'document', 'alert', 'FileReader', 'Image',
    'imgPreview', 'ipStrip', 'ipHint', 'removeImg', 'qImage', 'qGallery', 'input',
    `${MODEL}\n${PIPE}\n return {
       atts:    () => pendingAtts.map(a => ({ ...a })),
       pending: () => pastePending,
       hint:    () => ipHint.textContent,
       shown:   () => imgPreview.style.display,
       max:     () => MAX_ATTACHMENTS,
     };`
  )(document, m => alerts.push(m), FakeFileReader, FakeImage,
    imgPreview, ipStrip, ipHint, removeImg, qImage, qGallery, input);

  return { ...api, alerts, input, qImage, qGallery, removeImg };
}

let seq = 0;
const file = (type, over = {}) => ({
  type, name: `clip-${++seq}`, size: 120000, dataUrl: `data:${type};base64,AAAA`, ...over,
});

// A paste event carrying `files`, `items`, or both, plus optional text and HTML
// flavours — the shapes a real clipboard produces.
function paste({ files = [], text = '', html = '', itemsOnly = false } = {}) {
  return {
    prevented: false,
    preventDefault() { this.prevented = true; },
    clipboardData: {
      files: itemsOnly ? [] : files,
      items: files.map(f => ({ kind: 'file', type: f.type, getAsFile: () => f }))
        .concat(text ? [{ kind: 'string', type: 'text/plain' }] : [])
        .concat(html ? [{ kind: 'string', type: 'text/html' }] : []),
      getData: (type) => (type === 'text/plain' ? text : type === 'text/html' ? html : ''),
    },
  };
}

// Flushes the FileReader -> Image microtask chain.
const settle = () => new Promise(r => setTimeout(r, 0));

// ───────────────────────────────────────────────────────────────────────────
t.section('The pasted image goes through the existing pipeline');
{
  const h = harness();
  const ev = paste({ files: [file('image/png')] });
  h.input.fire('paste', ev);
  await settle();
  t.is('one attachment lands', h.atts().length, 1);
  t.is('it is a compressed JPEG, downscaled to the 1600px cap and 0.85 quality',
    h.atts()[0].url, 'data:image/jpeg;base64,1600x800@0.85');
  t.is('it is an image entry, not a PDF one', h.atts()[0].pdf, false);
}
{
  // The equivalence that makes this one pipeline rather than two.
  const pasted = harness();
  pasted.input.fire('paste', paste({ files: [file('image/png', { name: 'shot.png' })] }));
  const picked = harness();
  picked.qGallery.files = [file('image/png', { name: 'shot.png' })];
  picked.qGallery.fire('change');
  await settle();
  t.is('a pasted attachment is identical to a picked one', pasted.atts(), picked.atts());
}

t.section('Text and images both survive a paste');
{
  const h = harness();
  const ev = paste({ files: [file('image/png')], text: 'solve question 3' });
  h.input.fire('paste', ev);
  await settle();
  t.is('the image attaches', h.atts().length, 1);
  t.ok('the default paste is left alone so the text still lands in the textarea', !ev.prevented);
}
{
  const h = harness();
  const ev = paste({ files: [file('image/png')] });
  h.input.fire('paste', ev);
  await settle();
  t.ok('an image with no text flavour suppresses the default paste', ev.prevented);
}
{
  const h = harness();
  const ev = paste({ text: 'just some text' });
  h.input.fire('paste', ev);
  await settle();
  t.is('a text-only paste attaches nothing', h.atts().length, 0);
  t.ok('a text-only paste is never intercepted', !ev.prevented);
  t.is('a text-only paste raises no dialog', h.alerts, []);
}

t.section('Formats');
for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) {
  const h = harness();
  h.input.fire('paste', paste({ files: [file(type)] }));
  await settle();
  t.is(`${type} attaches`, h.atts().length, 1);
}
{
  const h = harness();
  h.input.fire('paste', paste({ files: [file('image/png')], itemsOnly: true }));
  await settle();
  t.is('an image exposed only as a DataTransferItem still attaches', h.atts().length, 1);
}

t.section('The two clipboard shapes students actually produce');
{
  // Windows Snipping Tool / Win+Shift+S. The capture reaches the clipboard as a
  // bitmap and nothing else; Chromium surfaces it as a single synthesized
  // image/png File. Measured payload: types ["Files"], text/plain empty.
  const h = harness();
  const ev = paste({ files: [file('image/png', { name: 'image.png' })] });
  h.input.fire('paste', ev);
  await settle();
  t.is('a screen snip attaches', h.atts().length, 1);
  t.is('through the canvas pipeline, not raw', h.atts()[0].url, 'data:image/jpeg;base64,1600x800@0.85');
  t.ok('and suppresses the default paste, since there is no text to keep', ev.prevented);
}
{
  // Chrome right-click -> Copy Image. The decoded bitmap arrives as image/png
  // ALONGSIDE a text/html fragment carrying the original <img src>. Measured
  // payload: types ["text/html","Files"] — text/plain is absent, which is why
  // the source URL never reaches the student's message box.
  const h = harness();
  const ev = paste({
    files: [file('image/png', { name: 'q17.png' })],
    html: '<img src="https://cdn.example.com/sat/q17.jpg">',
  });
  h.input.fire('paste', ev);
  await settle();
  t.is('a copied web image attaches', h.atts().length, 1);
  t.is('through the same canvas pipeline', h.atts()[0].url, 'data:image/jpeg;base64,1600x800@0.85');
  t.ok('an html-only text flavour does not count as text to preserve', ev.prevented);
}
{
  // Selecting an image on a page and pressing Ctrl+C is NOT Copy Image: Chromium
  // delivers text/plain (the alt text) and text/html with NO file at all. The
  // handler must stay out of the way so the alt text pastes as it always did.
  const h = harness();
  const ev = paste({ text: 'diagram of a circle', html: '<img alt="diagram of a circle" src="blob:...">' });
  h.input.fire('paste', ev);
  await settle();
  t.is('a selection copy of an image attaches nothing', h.atts().length, 0);
  t.ok('and pastes its text normally', !ev.prevented);
}

t.section('Unsupported clipboard content is rejected cleanly');
for (const type of ['application/pdf', 'text/plain', 'application/zip']) {
  const h = harness();
  const ev = paste({ files: [file(type)] });
  h.input.fire('paste', ev);
  await settle();
  t.is(`a pasted ${type} file attaches nothing and shows no dialog`,
    [h.atts().length, h.alerts.length, ev.prevented], [0, 0, false]);
}

t.section('Multiple pasted images');
{
  const h = harness();
  h.input.fire('paste', paste({ files: [
    file('image/png', { name: 'a' }), file('image/png', { name: 'b' }), file('image/png', { name: 'c' }),
  ] }));
  t.is('all three are counted as in flight immediately', h.pending(), 3);
  t.is('the strip is visible while they decode', h.shown(), 'flex');
  t.is('and says so', h.hint(), 'Pasting 3 images…');
  await settle();
  t.is('all three attach, in clipboard order', h.atts().map(a => a.name), ['a', 'b', 'c']);
  t.is('the in-flight count returns to zero', h.pending(), 0);
  t.is('the hint reverts to the normal attached state', h.hint(), '3 attached — ready to solve');
}
{
  const h = harness();
  const many = Array.from({ length: 14 }, (_, i) => file('image/png', { name: `n${i}` }));
  h.input.fire('paste', paste({ files: many }));
  await settle();
  t.is('a paste over the cap attaches exactly the cap', h.atts().length, h.max());
  t.is('and warns once for the whole paste, not once per file', h.alerts.length, 1);
  t.ok('naming what was dropped', /10 of 14/.test(h.alerts[0]));
}
{
  const h = harness();
  h.input.fire('paste', paste({ files: Array.from({ length: 10 }, () => file('image/png')) }));
  await settle();
  h.alerts.length = 0;
  h.input.fire('paste', paste({ files: [file('image/png')] }));
  await settle();
  t.is('pasting at the cap adds nothing', h.atts().length, 10);
  t.is('and says why, once', h.alerts.length, 1);
}
{
  // Two pastes in the same tick, before either decodes: in-flight images count
  // against the cap, so the pair cannot overshoot it.
  const h = harness();
  const six = () => Array.from({ length: 6 }, () => file('image/png'));
  h.input.fire('paste', paste({ files: six() }));
  h.input.fire('paste', paste({ files: six() }));
  await settle();
  t.is('back-to-back pastes stop at the cap', h.atts().length, h.max());
}

t.section('Failure paths still settle');
{
  const h = harness();
  h.input.fire('paste', paste({ files: [file('image/png', { size: 21 * 1024 * 1024 })] }));
  await settle();
  t.is('an oversized pasted image is refused', h.atts().length, 0);
  t.ok('with the existing size message', /too large/.test(h.alerts[0] || ''));
  t.is('and the decoding hint does not hang', h.pending(), 0);
  t.is('the strip hides again', h.shown(), 'none');
}
{
  const h = harness();
  h.input.fire('paste', paste({ files: [file('image/png', { unreadable: true })] }));
  await settle();
  t.is('an unreadable clipboard file is refused', h.atts().length, 0);
  t.is('the decoding hint does not hang', h.pending(), 0);
}
{
  const h = harness();
  h.input.fire('paste', paste({ files: [file('image/png', { dataUrl: 'data:image/png;base64,undecodable' })] }));
  await settle();
  t.is('an image the browser cannot decode still attaches, uncompressed',
    h.atts()[0].url, 'data:image/png;base64,undecodable');
  t.is('and the decoding hint does not hang', h.pending(), 0);
}

t.section('The existing upload paths are unchanged');
{
  const h = harness();
  h.qGallery.files = [file('image/png', { name: 'g1' }), file('image/png', { name: 'g2' })];
  h.qGallery.fire('change');
  await settle();
  t.is('gallery multi-select still attaches every file', h.atts().map(a => a.name), ['g1', 'g2']);
  t.is('the gallery input is cleared so re-picking the same file re-fires change', h.qGallery.value, '');
}
{
  const h = harness();
  h.qImage.files = [file('image/jpeg', { name: 'cam' })];
  h.qImage.fire('change');
  await settle();
  t.is('the camera input still attaches', h.atts().map(a => a.name), ['cam']);
}
{
  const h = harness();
  h.qGallery.files = [file('image/png', { name: 'picked' })];
  h.qGallery.fire('change');
  await settle();
  h.input.fire('paste', paste({ files: [file('image/png', { name: 'pasted' })] }));
  await settle();
  t.is('paste appends to picked files rather than replacing them',
    h.atts().map(a => a.name), ['picked', 'pasted']);
  h.removeImg.fire('click');
  t.is('remove-all clears pasted attachments too', h.atts().length, 0);
  t.is('and hides the strip', h.shown(), 'none');
}

t.section('Wiring and accessibility');
{
  const h = harness();
  t.is('exactly one paste listener, on the composer textarea', h.input.count('paste'), 1);
  t.ok('the attachment hint is announced to screen readers',
    /id="ipHint"[^>]*aria-live="polite"/.test(SRC));
}

t.done();
