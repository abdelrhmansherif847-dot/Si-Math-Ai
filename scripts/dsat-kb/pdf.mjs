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
    // Trim the EOL that precedes `endstream`; zlib rejects trailing bytes.
    let stop = end;
    while (stop > start && (hay[stop - 1] === '\n' || hay[stop - 1] === '\r')) stop--;
    const slice = buf.subarray(start, stop);
    for (const fn of [inflateSync, inflateRawSync]) {
      try { out.push(fn(slice).toString('latin1')); break; } catch { /* try the next */ }
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
