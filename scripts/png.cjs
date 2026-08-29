/* PNG in and out, and a pixel comparison, with nothing installed.
 *
 * The repo has no package.json on purpose, so the visual suite decodes its own
 * screenshots. Node ships zlib, which is the only hard part; the rest is the
 * PNG spec's five filters and a byte loop. Chromium writes 8-bit RGB or RGBA
 * non-interlaced, which is all this needs to read.
 */
const zlib = require('node:zlib');
const fs = require('node:fs');

function decode(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let i = 8, w = 0, h = 0, depth = 0, type = 0, idat = [];
  while (i < buf.length) {
    const len = buf.readUInt32BE(i), tag = buf.toString('ascii', i + 4, i + 8);
    const data = buf.subarray(i + 8, i + 8 + len);
    if (tag === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; type = data[9];
      if (data[12] !== 0) throw new Error('interlaced PNG unsupported');
    } else if (tag === 'IDAT') idat.push(data);
    else if (tag === 'IEND') break;
    i += 12 + len;
  }
  if (depth !== 8) throw new Error('bit depth ' + depth + ' unsupported');
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[type];
  if (!ch) throw new Error('colour type ' + type + ' unsupported');
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch, out = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride), pos = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[pos++];
    const line = Buffer.from(raw.subarray(pos, pos + stride)); pos += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? line[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      if (f === 1) line[x] = (line[x] + a) & 255;
      else if (f === 2) line[x] = (line[x] + b) & 255;
      else if (f === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    line.copy(out, y * stride); prev = line;
  }
  // normalise to RGB, compositing any alpha over white — the paper a figure is
  // printed on, so a transparent margin never reads as a difference
  const rgb = Buffer.alloc(w * h * 3);
  for (let p = 0; p < w * h; p++) {
    let r, g, b, al = 255;
    if (ch === 1) { r = g = b = out[p]; }
    else if (ch === 2) { r = g = b = out[p * 2]; al = out[p * 2 + 1]; }
    else if (ch === 3) { r = out[p * 3]; g = out[p * 3 + 1]; b = out[p * 3 + 2]; }
    else { r = out[p * 4]; g = out[p * 4 + 1]; b = out[p * 4 + 2]; al = out[p * 4 + 3]; }
    const k = al / 255;
    rgb[p * 3] = Math.round(r * k + 255 * (1 - k));
    rgb[p * 3 + 1] = Math.round(g * k + 255 * (1 - k));
    rgb[p * 3 + 2] = Math.round(b * k + 255 * (1 - k));
  }
  return { width: w, height: h, data: rgb };
}

function encode({ width, height, data }) {
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    data.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  const chunk = (tag, body) => {
    const c = Buffer.alloc(8 + body.length + 4);
    c.writeUInt32BE(body.length, 0); c.write(tag, 4, 'ascii'); body.copy(c, 8);
    c.writeUInt32BE(crc(Buffer.concat([Buffer.from(tag, 'ascii'), body])) >>> 0, 8 + body.length);
    return c;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))]);
}

let TBL = null;
function crc(b) {
  if (!TBL) {
    TBL = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TBL[n] = c; }
  }
  let c = -1;
  for (let i = 0; i < b.length; i++) c = TBL[(c ^ b[i]) & 255] ^ (c >>> 8);
  return c ^ -1;
}

/* Compare two renders.
 *
 * `tolerance` is per channel, and exists for ONE reason: text and curves are
 * anti-aliased, and the same glyph rasterised twice can land a shade apart. It
 * is NOT there to wave through a real difference — a moved line, a wrong
 * weight or a changed colour clears any sane tolerance easily, because it moves
 * whole pixels rather than shading them.
 *
 * Different dimensions are a difference, not an error: the plate changing shape
 * is exactly the defect that started all of this.
 */
function diff(a, b, { tolerance = 24 } = {}) {
  if (a.width !== b.width || a.height !== b.height)
    return { sizeChanged: true, changed: Math.max(a.width * a.height, b.width * b.height),
             total: Math.max(a.width * a.height, b.width * b.height), ratio: 1, image: null,
             note: `${a.width}x${a.height} vs ${b.width}x${b.height}` };
  const n = a.width * a.height;
  const img = Buffer.alloc(n * 3);
  let changed = 0;
  for (let p = 0; p < n; p++) {
    const d = Math.max(Math.abs(a.data[p * 3] - b.data[p * 3]),
                       Math.abs(a.data[p * 3 + 1] - b.data[p * 3 + 1]),
                       Math.abs(a.data[p * 3 + 2] - b.data[p * 3 + 2]));
    if (d > tolerance) {
      changed++;
      img[p * 3] = 220; img[p * 3 + 1] = 20; img[p * 3 + 2] = 60;    // what moved
    } else {
      // everything else, faded, so the difference is readable in context
      const g = 255 - Math.round((255 - a.data[p * 3 + 1]) * 0.16);
      img[p * 3] = img[p * 3 + 1] = img[p * 3 + 2] = g;
    }
  }
  return { sizeChanged: false, changed, total: n, ratio: changed / n,
           image: { width: a.width, height: a.height, data: img }, note: '' };
}

/* Compare two renders of the same figure that may sit at different sub-pixel
 * offsets on their pages.
 *
 * The exam card and the specimen page put the figure at different fractional y
 * positions, so the identical SVG rasterises a shade differently and its
 * screenshot rounds to a height one device pixel apart. Compared naively that
 * reads as every horizontal line in the figure having moved — 3% of the frame,
 * on a figure that is pixel-for-pixel correct.
 *
 * So the images are cropped to their common size and slid against each other by
 * up to two pixels, and the best alignment wins. This tolerates WHERE the figure
 * sits; it does not tolerate what it looks like. A moved gridline, a changed
 * stroke weight, a different grid step or a reshaped plate all survive every
 * offset, because none of them is a rigid translation of the whole drawing.
 */
/* Average 2x2 device pixels into one. Screenshots are taken at
 * deviceScaleFactor 2, so this is the figure at CSS resolution, and it is how a
 * half-device-pixel difference stops being a difference: two rasterisations of
 * the same glyph half a pixel apart average to nearly the same value, while
 * anything structural — a line that moved, a weight that changed, a grid step —
 * moves whole CSS pixels and survives untouched. */
function halve(img) {
  const w = img.width >> 1, h = img.height >> 1, out = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) {
      const i = ((y * 2) * img.width + x * 2) * 3 + c;
      out[(y * w + x) * 3 + c] = (img.data[i] + img.data[i + 3] +
        img.data[i + img.width * 3] + img.data[i + img.width * 3 + 3] + 2) >> 2;
    }
  }
  return { width: w, height: h, data: out };
}

function alignedDiff(rawA, rawB, opts = {}) {
  // ORDER MATTERS. Align first, at the resolution the screenshots were taken —
  // the exam card starts its figure at y=181.58 where the specimen page starts
  // at 0, which is a shift of more than a device pixel. Halve second, so the
  // fraction the integer slide could not remove is averaged away rather than
  // counted. Doing it the other way round leaves a sub-CSS-pixel offset that no
  // integer offset can reach, and a table identical in every measured dimension
  // reports half a percent of its glyphs as changed.
  const R = opts.range == null ? 4 : opts.range;
  const w = Math.min(rawA.width, rawB.width) - 2 * R;
  const h = Math.min(rawA.height, rawB.height) - 2 * R;
  if (w <= 2 || h <= 2)
    return { sizeChanged: true, changed: 1, total: 1, ratio: 1, image: null,
             note: `${rawA.width}x${rawA.height} vs ${rawB.width}x${rawB.height}`,
             offset: [0, 0], cropped: '' };
  const crop = (img, dx, dy) => {
    const out = Buffer.alloc(w * h * 3);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const s = ((y + R + dy) * img.width + (x + R + dx)) * 3, d = (y * w + x) * 3;
        out[d] = img.data[s]; out[d + 1] = img.data[s + 1]; out[d + 2] = img.data[s + 2];
      }
    return { width: w, height: h, data: out };
  };
  const base = opts.raw ? crop(rawA, 0, 0) : halve(crop(rawA, 0, 0));
  let best = null, bestAt = [0, 0];
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const other = crop(rawB, dx, dy);
    const d = diff(base, opts.raw ? other : halve(other), opts);
    if (!best || d.ratio < best.ratio) { best = d; bestAt = [dx, dy]; }
  }
  best.offset = bestAt;
  best.cropped = (rawA.width !== rawB.width || rawA.height !== rawB.height)
    ? `${rawA.width}x${rawA.height} vs ${rawB.width}x${rawB.height}` : '';
  return best;
}

const read = (p) => decode(fs.readFileSync(p));
const write = (p, img) => fs.writeFileSync(p, encode(img));
module.exports = { decode, encode, diff, alignedDiff, read, write };
