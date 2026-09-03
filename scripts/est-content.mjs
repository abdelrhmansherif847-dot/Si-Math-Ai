// Structural content signatures.
//
// WHY THE LENGTH THRESHOLD HAD TO GO
//
// The Stage-3.5 content detector compared a math span only when it ran to at
// least twelve characters and carried two distinct numerals. The threshold
// existed for a real reason — `y = mx + b`, `a^2 + b^2 = c^2` and `\pi r^2`
// appear in every EST form and must never be flagged — but it is a proxy for
// "distinctive" and it failed on the first thing that tested it:
//
//   ESTM2-2026-P3 Q15 and Q47 both defined  f(x) = 2x + 4.
//
// Normalised, that span is nine characters. The detector never looked at it.
//
// WHAT REPLACES IT
//
// Not a smaller number. The decision is now STRUCTURAL: a signature is compared
// if and only if the span PARSES into a recognised mathematical structure that
// carries concrete parameters. `y = mx + b` parses as a linear form whose
// coefficients are symbolic, so it yields no signature and is never compared.
// `f(x) = 2x + 4` parses as a linear form with coefficients (2, 4) and is
// compared, at any length.
//
// Six signature kinds, each a different way for two items to be the same:
//
//   functionalForm         a named function and its coefficient vector
//   equationCoefficients   any polynomial-shaped span, by degree and coefficients
//   targetExpression       what is asked, normalised away from its wording
//   numericTuple           the sorted numbers a stem prints
//   geometricConfiguration the named figure, its angle set, and which part is given
//   transformationParams   slope/intercept, scale, ratio and growth parameters
//
// NOTHING HERE STORES EXAM TEXT. Every value is a signature computed from an
// in-memory item; the repository holds the extractor, never the questions.

/* ────────────────────────── extraction ────────────────────────── */

const spansOf = stem => (String(stem).match(/\$[^$]+\$/g) || []).map(s => s.slice(1, -1));
const nums = s => (String(s).match(/-?\d+(?:\.\d+)?/g) || []).map(Number);

/**
 * Strip the digits that are STRUCTURE rather than parameters.
 *
 * An exponent, a radical index and the interior of a \sqrt are part of the
 * mathematics being named, not of the particular item. Without this,
 * `a^2 + b^2 = c^2` reads as the numeric tuple (2, 2, 2) and two items stating
 * Pythagoras collide with each other — a false positive on the single most
 * common formula in the corpus. The quadratic formula loses its 4 and its
 * square root the same way and drops below the two-numeral floor.
 */
const stripStructuralDigits = s => String(s)
  .replace(/\\sqrt\{[^}]*\}/g, ' ')
  .replace(/\\sqrt\[[^\]]*\]/g, ' ')
  .replace(/\^\{?-?\d+\}?/g, ' ');

/**
 * A named function definition, as name + shape + coefficients.
 *
 * Matches `f(x) = 2x + 4`, `g(x) = x^2 - 3`, `h(t) = 5t^2 + t - 1`. Returns null
 * when every coefficient is symbolic, which is what keeps `y = mx + b` out.
 */
export function functionalForms(stem) {
  const out = [];
  const text = String(stem);
  const re = /([a-zA-Z])\s*\(\s*([a-zA-Z])\s*\)\s*=\s*([^,.;$)]+)/g;
  let m;
  while ((m = re.exec(text))) {
    const body = m[3].trim();
    const v = m[2];
    const terms = {};
    // degree-by-degree coefficient extraction, tolerant of spacing and \cdot
    const clean = body.replace(/\\cdot|\\,|\s/g, '');
    const tre = new RegExp(`([+-]?\\d*)${v}(?:\\^\\{?(\\d+)\\}?)?|([+-]?\\d+)`, 'g');
    let t, saw = false;
    while ((t = tre.exec(clean))) {
      if (t[0] === '') { tre.lastIndex++; continue; }
      if (t[3] !== undefined) { terms[0] = (terms[0] || 0) + Number(t[3]); saw = true; continue; }
      const deg = t[2] ? Number(t[2]) : 1;
      const c = t[1] === '' || t[1] === '+' ? 1 : t[1] === '-' ? -1 : Number(t[1]);
      terms[deg] = (terms[deg] || 0) + c; saw = true;
    }
    if (!saw) continue;
    const deg = Math.max(...Object.keys(terms).map(Number));
    const vec = [];
    for (let d = deg; d >= 0; d--) vec.push(terms[d] || 0);
    // Symbolic-only bodies produce no numeric coefficients at all.
    if (vec.every(c => c === 0)) continue;
    out.push(`${m[1]}:deg${deg}:${vec.join(',')}`);
  }
  return out;
}

/**
 * Coefficient vectors of polynomial-shaped spans that are not function
 * definitions. `a^2 + b^2 = c^2` yields nothing: its numerals are exponents,
 * and an exponent-only span carries no coefficients.
 */
export function equationCoefficients(stem) {
  const out = [];
  for (const raw of spansOf(stem)) {
    const s = raw.replace(/\\cdot|\\,|\s/g, '');
    if (/^[a-zA-Z]\([a-zA-Z]\)=/.test(s)) continue;          // handled by functionalForms
    // strip exponents so `a^2 + b^2 = c^2` contributes nothing
    const noExp = stripStructuralDigits(s);
    const n = nums(noExp);
    if (n.length < 2) continue;
    const symbols = (noExp.match(/[a-zA-Z]/g) || []).length;
    if (symbols === 0) continue;                              // pure arithmetic, not a structure
    out.push(`eq:${n.slice().sort((a, b) => a - b).join(',')}`);
  }
  return out;
}

/** What the item asks, normalised away from its wording. */
export function targetExpression(item) {
  const t = item.fingerprint?.target || item.fingerprintParts?.target;
  if (!t) return null;
  const key = item.options?.find(o => o.id === item.key);
  return key ? `${t}=>${String(key.text).replace(/\s+/g, '')}` : null;
}

/** The sorted numbers a stem prints. Three or more, or it is not distinctive. */
export function numericTuple(stem) {
  const n = nums(stripStructuralDigits(stem).replace(/\\[a-zA-Z]+/g, ' '));
  if (n.length < 3) return null;
  return `nums:${n.slice().sort((a, b) => a - b).join(',')}`;
}

/**
 * A named geometric figure with its angle set and the part supplied.
 *
 * Two special-right-triangle items with different letters and different side
 * lengths are the same configuration if the angle set and the given/asked pair
 * match; that is what P2's three-triangle defect actually was.
 */
export function geometricConfiguration(stem) {
  const text = String(stem);
  if (!/triangle|circle|rectangle|square|polygon|parallelogram/i.test(text)) return null;
  const figure = (text.match(/triangle|circle|rectangle|square|polygon|parallelogram/i) || [])[0].toLowerCase();
  const angles = [...text.matchAll(/(\d+)\s*\^?\{?\\?circ/g)].map(m => Number(m[1])).sort((a, b) => a - b);
  // A figure named with no numbers at all is a formula statement, not an item.
  if (!/\d/.test(stripStructuralDigits(text))) return null;
  const given = /\b(PR|PQ|QR|AB|BC|AC|radius|diameter|perimeter|area|hypotenuse)\b/.exec(text);
  const asked = /length of|area of|measure of|perimeter of|radius of|diameter of/.exec(text);
  if (!angles.length && !given) return null;
  return `geo:${figure}:${angles.join('-') || 'noangles'}:${given ? given[1].toLowerCase() : '-'}:${asked ? asked[0].split(' ')[0] : '-'}`;
}

/** Slope/intercept, scale, ratio and growth parameters, as an ordered pair set. */
export function transformationParams(stem) {
  const out = [];
  const text = String(stem);
  for (const raw of spansOf(text)) {
    const s = raw.replace(/\s/g, '');
    const line = /^y=(-?\d*)x([+-]\d+)?$/.exec(s);
    if (line) out.push(`lin:${line[1] === '' ? 1 : line[1] === '-' ? -1 : Number(line[1])},${line[2] ? Number(line[2]) : 0}`);
    const std = /^(-?\d*)x([+-]\d*)y=(-?\d+)$/.exec(s);
    if (std) out.push(`std:${std[1] || 1},${std[2] || 1},${std[3]}`);
  }
  const pct = [...text.matchAll(/(\d+)\\?%/g)].map(m => Number(m[1]));
  if (pct.length >= 2) out.push(`pct:${pct.slice().sort((a, b) => a - b).join(',')}`);
  return out;
}

/* ────────────────────────── the detector ────────────────────────── */

export const SIGNATURE_KINDS = ['functionalForm', 'equationCoefficients', 'targetExpression',
  'numericTuple', 'geometricConfiguration', 'transformationParams', 'optionGrid'];

export function signaturesOf(item) {
  const out = [];
  for (const f of functionalForms(item.stem)) out.push(['functionalForm', f]);
  for (const e of equationCoefficients(item.stem)) out.push(['equationCoefficients', e]);
  const t = targetExpression(item); if (t) out.push(['targetExpression', t]);
  const n = numericTuple(item.stem); if (n) out.push(['numericTuple', n]);
  const g = geometricConfiguration(item.stem); if (g) out.push(['geometricConfiguration', g]);
  for (const p of transformationParams(item.stem)) out.push(['transformationParams', p]);
  // `if (item.options)` was true for an EMPTY array, so any two items without
  // printed options collided on the signature `''`. No assembled item has zero
  // options, so it never fired in production — which is exactly why it survived
  // review. A signature derived from nothing is not evidence of anything.
  if (item.options && item.options.length >= 2)
    out.push(['optionGrid', item.options.map(o => o.text).sort().join('|')]);
  return out;
}

/** Two items collide when they share any signature. */
export function contentCollisions(placements) {
  const seen = new Map();
  const collisions = [];
  for (const p of placements) {
    for (const [kind, sig] of signaturesOf(p.item)) {
      const id = `${kind}::${sig}`;
      if (seen.has(id)) collisions.push({ kind, first: seen.get(id), second: p.q });
      else seen.set(id, p.q);
    }
  }
  return { ok: !collisions.length, collisions,
    failures: collisions.map(c => `q${c.first} and q${c.second} share a ${c.kind} signature`) };
}

/**
 * The formulas that must NEVER be flagged, kept here as an executable list so
 * the guarantee is tested rather than asserted.
 */
export const COMMON_FORMULAS = [
  'The line has equation $y = mx + b$. What is $b$?',
  'In a right triangle, $a^2 + b^2 = c^2$. What is $c$?',
  'A circle has area $\\pi r^2$. What is $r$?',
  'What is $x^2$ when $x$ is 5?',
  'The quadratic formula gives $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$.',
  'The volume of a cylinder is $V = \\pi r^2 h$.',
];
