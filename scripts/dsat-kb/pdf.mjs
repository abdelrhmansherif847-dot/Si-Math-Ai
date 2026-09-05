// Dependency-free PDF inspection for the ingestion pipeline.
//
// D-2. The first pilot PDF reported "pages ?" because its page tree lives inside
// COMPRESSED OBJECT STREAMS, which a raw-byte regex cannot see — and the
// consequence was silent: the manifest would have emitted an empty worklist for
// an 86-page file while the run appeared to succeed. Compressed cross-reference
// streams are the norm in modern PDFs, so the old probe was wrong far more often
// than it was right.
//
// This inflates every FlateDecode stream with node's own zlib and reads the page
// tree from the result. No external binary, no package.json — the repository has
// neither and is not getting either for this.
//
// D-1. The same pass collects CONTENT-level provenance signals: annotation URIs
// and text markers. Those classify a source; they never reject one.

import { inflateSync, inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { PROVENANCE_SIGNALS, HARD_EXCLUDED_SHA256 } from './schema.mjs';

// Inflate every FlateDecode stream we can, and return the concatenated result.
// Streams that fail to inflate are skipped: a PDF may use filters we do not
// implement, and one unreadable stream must not lose the rest.
// The stream dictionary's /Length, if it is a direct integer. An indirect
// reference (`/Length 12 0 R`) is not resolved here and returns null, which
// simply falls the caller back to the byte heuristics.
function declaredLength(hay, streamKeywordIndex) {
  const dict = hay.slice(Math.max(0, streamKeywordIndex - 2000), streamKeywordIndex);
  const open = dict.lastIndexOf('<<');
  if (open < 0) return null;
  const m = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict.slice(open));
  return m ? Number(m[1]) : null;
}

export function inflateAll(buf) {
  const out = [];
  const hay = buf.toString('latin1');
  // The lookbehind matters: "endstream" contains "stream", so a bare /stream/
  // re-matches inside every terminator and slices garbage. That bug cost this
  // file its annotation URIs on the first run.
  const re = /(?<![A-Za-z])stream(\r\n|\r|\n)?/g;
  let m;
  while ((m = re.exec(hay)) !== null) {
    const start = m.index + m[0].length;
    const end = hay.indexOf('endstream', start);
    if (end < 0) continue;
    // TWO candidate ends, and NEITHER of them trims.
    //
    // The code here used to walk back over trailing EOL bytes, justified by a
    // comment saying "zlib rejects trailing bytes". That is not true: node's
    // inflateSync ignores anything after the deflate stream ends. The trim was
    // never needed, and it actively destroyed streams — it cannot tell a
    // separator from compressed data that merely ENDS in 0x0A or 0x0D, and when
    // it guessed wrong it lost the whole stream rather than one byte. On
    // Units_24.pdf that was the entire page tree: /Length 22100, 22101 bytes to
    // `endstream`, 22099 after the trim, 140 KB of structure silently gone and
    // pageCount returning null while the run looked like it had worked.
    //
    // The dictionary's /Length is preferred because it is a fact rather than a
    // guess; the raw end is the fallback when it is absent or indirect.
    const declared = declaredLength(hay, m.index);
    const stops = [];
    if (declared !== null && start + declared <= end) stops.push(start + declared);
    stops.push(end);

    for (const stop of stops) {
      let done = false;
      for (const fn of [inflateSync, inflateRawSync]) {
        try { out.push(fn(buf.subarray(start, stop)).toString('latin1')); done = true; break; }
        catch { /* try the next decoder */ }
      }
      if (done) break;
    }
    re.lastIndex = end + 9;
  }
  return out.join('\n');
}

// Page count, by three independent routes. They are reported together so a
// disagreement is visible rather than resolved by silent preference.
export function pageCount(buf) {
  const raw = buf.toString('latin1');
  const inflated = inflateAll(buf);
  const both = raw + '\n' + inflated;

  // /Count on the page-tree root. Several may appear (nested trees); the tree
  // root carries the largest.
  const counts = [...both.matchAll(/\/Count\s+(\d+)/g)].map(x => Number(x[1]));
  const byCount = counts.length ? Math.max(...counts) : null;

  // Leaf page objects. /Type/Pages must not be counted, hence the lookahead.
  const byType = (both.match(/\/Type\s*\/Page(?![s])/g) || []).length || null;

  const agree = byCount !== null && byType !== null && byCount === byType;
  return {
    pages: byCount ?? byType,
    byCount, byType, agree,
    method: byCount !== null ? (inflated.includes('/Count') ? 'inflated page tree' : 'raw page tree') : 'page-object count',
  };
}

// Annotation URIs, from raw bytes and inflated streams alike.
export function extractUris(buf) {
  const both = buf.toString('latin1') + '\n' + inflateAll(buf);
  const uris = new Set();
  for (const m of both.matchAll(/\/URI\s*\(([^)]{4,300})\)/g)) uris.add(m[1].trim());
  return [...uris];
}

// D-1: classify, never discard. Returns the signals a file carries, what each
// suggests, and — separately — whether the file is on the one hash-pinned hard
// exclusion list.
export function provenanceScan({ buf, text = '', uris = null }) {
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const foundUris = uris ?? extractUris(buf);
  const haystackText = text || '';
  const haystackUri = foundUris.join('\n');

  const signals = [];
  for (const sig of PROVENANCE_SIGNALS) {
    const hay = sig.where === 'uri|text' ? haystackUri + '\n' + haystackText : haystackText;
    const hits = [...hay.matchAll(new RegExp(sig.pattern.source, sig.pattern.flags.includes('g') ? sig.pattern.flags : sig.pattern.flags + 'g'))];
    if (hits.length) signals.push({
      id: sig.id, means: sig.means, suggests: sig.suggests, hits: hits.length,
      examples: [...new Set(hits.map(h => h[0].trim()))].slice(0, 3),
    });
  }

  const hardExcluded = HARD_EXCLUDED_SHA256.find(x => x.sha256 === sha256) ?? null;

  // The strongest suggestion wins, but this is a SUGGESTION recorded for a human
  // to confirm — the pipeline never sets provenance from it on its own.
  const order = ['official_college_board', 'recalled_unofficial', 'third_party'];
  const suggested = order.find(o => signals.some(s => s.suggests === o)) ?? 'unknown';

  return { sha256, signals, suggestedProvenance: suggested, hardExcluded, uris: foundUris };
}

// A best-effort text probe, NOT a text extractor.
//
// D-1 defines five provenance signals; four of them read text. The pipeline was
// passing the empty string, so those four could never fire — dead code wearing a
// passing test, because the only test hand-fed the text it was checking for.
// The second PDF is where that cost something: it announces its own provenance
// in per-question administration tags, and the scan reported no signals at all.
//
// A CORRECT extractor would resolve each content stream's fonts through the page
// resource dictionary and decode with that font's ToUnicode CMap. That is a PDF
// parser, and this repository is not getting one to read five regexes. So this
// harvests the literal strings from content streams and keeps only the runs that
// are ALREADY legible — a subset font with a shifted code table yields bytes
// that are not text, and those runs are dropped rather than guessed at.
//
// Dropping them silently would be the same defect one layer down, so the return
// value carries the counts: a caller that reads 5 of 55 streams must be able to
// say so rather than report "no signals found".
const PRINTABLE = /[\x20-\x7e\r\n\t]/g;
const WORDY = /[A-Za-z]{3,}/g;
const VOWEL = /[aeiouAEIOU]/;

export function looksLikeText(run) {
  if (run.length < 20) return false;
  const printable = (run.match(PRINTABLE) || []).length / run.length;
  if (printable < 0.85) return false;
  // A shifted code table still yields letters; it does not yield English-shaped
  // words. One vowel-carrying token is a weak test and is meant to be — it
  // rejects consonant soup, and nothing here claims more than that.
  return (run.match(WORDY) || []).some(w => VOWEL.test(w));
}

export function contentText(buf) {
  const hay = buf.toString('latin1');
  const re = /(?<![A-Za-z])stream(\r\n|\r|\n)?/g;
  const runs = [];
  let streams = 0, legible = 0, m;
  while ((m = re.exec(hay)) !== null) {
    const start = m.index + m[0].length;
    const end = hay.indexOf('endstream', start);
    if (end < 0) continue;
    let stop = end;
    while (stop > start && (hay[stop - 1] === '\n' || hay[stop - 1] === '\r')) stop--;
    re.lastIndex = end + 9;
    let s = null;
    for (const fn of [inflateSync, inflateRawSync]) {
      try { s = fn(buf.subarray(start, stop)).toString('latin1'); break; } catch { /* next */ }
    }
    if (s === null) continue;
    // A page content stream draws text: it has BT and a show-text operator.
    // BOTH cases matter — `TJ` shows a kerned array, `Tj` a single string — and
    // /\bTJ?\b/ silently matches neither `Tj` nor `TJ` followed by a letter.
    if (!/\bBT\b/.test(s) || !/\bT[Jj]\b/.test(s)) continue;
    streams++;
    const parts = [];
    for (const lit of s.matchAll(/\((?:[^()\\]|\\[\\()nrtbf]|\\[0-7]{1,3})*\)/g))
      parts.push(lit[0].slice(1, -1).replace(/\\([\\()])/g, '$1'));
    const run = parts.join('');
    if (looksLikeText(run)) { legible++; runs.push(run); }
  }
  return { text: runs.join('\n'), streams, legible, ratio: streams ? legible / streams : 0 };
}
