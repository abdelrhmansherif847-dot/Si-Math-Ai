// ═══════════════════════════════════════════════════════════════════════════
// algebra-verifier.core.ts — Verdict Pilot, P5
// ═══════════════════════════════════════════════════════════════════════════
// The first REAL mathematics in the pilot. P1–P4 built contracts; this actually
// verifies something:
//
//     CANDIDATE ANSWER + STRUCTURED LINEAR EQUATION
//                        |
//              EXACT RATIONAL SUBSTITUTION
//                        |
//              VERIFICATION EVIDENCE
//
// AND IT IS STILL ONLY EVIDENCE. `verified` here means ONE DETERMINISTIC CHECK
// SUCCEEDED. It is not a verdict, not truth, and not authority over the models.
// Sufficiency, confidence, routing, escalation and publication belong to phases
// that do not exist.
//
// ───────────────────────────────────────────────────────────────────────────
// NO CAS, AND NOT PRETENDING TO HAVE ONE
//
// SymPy is not installed, CI has no install step, the repo has no package.json
// by design, and the deployed runtime is a Deno Edge Function that cannot spawn
// a Python process. So there is no symbolic algebra system here and nothing is
// labelled as though there were. What there is instead: a hand-written
// recursive-descent parser over a deliberately tiny grammar, and exact rational
// arithmetic in BigInt. Narrow and genuinely deterministic beats broad and
// pretending.
//
// ───────────────────────────────────────────────────────────────────────────
// THE PROBLEM ARRIVES STRUCTURED. THIS FILE NEVER READS THE PROSE.
//
// The equation comes from subject.interpretation, not from question_text.
// Deciding what a photographed, OCR'd, model-paraphrased question MEANS is a
// different problem — and it is the one this product actually gets wrong. Handing
// a verifier a guess to check would launder that guess into a deterministic
// result, which is worse than not checking at all.
//
// ───────────────────────────────────────────────────────────────────────────
// THE SUPPORTED SUBSET, EXACTLY
//
//   one `=` · the grammar { + - * / ( ) digits . single-letter variables } ·
//   implicit multiplication (3x, 2(x+1)) · exactly one variable, matching the
//   declared one · degree <= 1 in it · never in a denominator · candidate a
//   rational (5, -3, 2.5, 5/2, "x = 5", "5 = x")
//
// EVERYTHING ELSE IS EXPLICITLY UNSUPPORTED WITH A NAMED REASON. Nothing outside
// the subset may come back `verified`, and nothing may come back `contradicted`
// either: blaming the candidate for the parser's limits would turn a gap in this
// pilot into deterministic-looking evidence against a model that may be right.
//
// ───────────────────────────────────────────────────────────────────────────
// THE DEGENERATE CASES, AND WHY THEY ARE INCONCLUSIVE
//
// After reduction the equation is A·x = B.
//
//   A != 0          well posed, unique solution. verified / contradicted are
//                   decisive, and a passing substitution really does mean this
//                   candidate is THE answer.
//   A = 0, B = 0    an identity: 2x+3 = 2x+3. Substitution succeeds for EVERY
//                   value, so success says nothing about this candidate.
//   A = 0, B != 0   no solution: 2x+3 = 2x+5. Substitution fails for every
//                   value, so `contradicted` would blame the candidate for what
//                   is almost certainly a misread or OCR-damaged equation.
//
// Both degenerate cases are `inconclusive` with the fact in the evidence. Never
// a decisive result the mathematics does not support.
//
// ───────────────────────────────────────────────────────────────────────────
// SAFETY: THE INPUT IS HOSTILE, AND THE GRAMMAR IS AN ALLOW-LIST
//
// This text comes from OCR, from students typing, and from models paraphrasing.
// Nothing here compiles, executes, interpolates or evaluates any part of it —
// no dynamic code, no shell, no regular expression built from input, no
// property lookup keyed by parsed text. Every character the tokenizer does not
// explicitly recognize is refused by name. Length and nesting are bounded, so no
// input can make the parser run away.
//
// ───────────────────────────────────────────────────────────────────────────
// COUNT-AGNOSTIC by construction: there is no model input at all. 3(9) + 7 = 34
// whether one model said 9 or five did.
//
// OFFLINE. Imports only the P4 contract; no clock, no randomness, no I/O, no
// environment read, no throw; nothing in the deployed bundle imports this file.

import type {
  DeterministicVerifier, VerificationRequest, VerificationResult, VerifierIdentity,
} from './deterministic-verifier.core.ts';
import { buildVerificationResult, canonicalizeText } from './deterministic-verifier.core.ts';

export const ALGEBRA_VERIFIER_IDENTITY: VerifierIdentity = {
  verifier_id: 'algebra-linear-substitution',
  version: 'v1',
  method: 'exact_rational_substitution',
};

/** The one interpretation type this pilot handles. Anything else is unsupported
 *  rather than attempted — a verifier that guesses at a problem class it was not
 *  built for is the failure this whole design exists to avoid. */
export const SUPPORTED_INTERPRETATION_TYPE = 'linear_equation';

/** Every reason this module can emit. Exported so a suite asserts against the
 *  declaration rather than against strings it re-guesses, and so that adding a
 *  refusal path is a visible edit here. */
export const ALGEBRA_REASONS: string[] = [
  'no_structured_algebra_interpretation',
  'unsupported_interpretation_type',
  'no_equation_supplied',
  'equation_too_long',
  'unsupported_character',
  'unsupported_operator',
  'unsupported_relation',
  'missing_equals',
  'multiple_equals',
  'parse_error',
  'nesting_too_deep',
  'no_variable_in_equation',
  'multiple_variables',
  'designated_variable_absent',
  'nonlinear_not_supported',
  'variable_in_denominator',
  'division_by_zero_in_equation',
  'unsupported_candidate_form',
  'candidate_variable_mismatch',
  'candidate_too_long',
  'equation_is_an_identity',
  'equation_has_no_solution',
  'internal_inconsistency',
];

const MAX_EQUATION_CHARS = 512;
const MAX_CANDIDATE_CHARS = 64;
const MAX_DEPTH = 32;

/** A variable name the tokenizer cannot produce, for the call sites where no
 *  variable can be present and the argument is therefore unreachable. */
const NO_VARIABLE = '(none)';

// ───────────────────────────────────────────────────────────────────────────
// EXACT RATIONAL ARITHMETIC
//
// BigInt fractions, always reduced, denominator always positive. No floating
// point anywhere: 0.1 + 0.2 must not be part of a claim that something was
// deterministically verified.

interface Rat { n: bigint; d: bigint }

function bigGcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a, y = b < 0n ? -b : b;
  while (y) { const t = x % y; x = y; y = t; }
  return x || 1n;
}
function rat(n: bigint, d: bigint = 1n): Rat {
  if (d === 0n) return { n: 0n, d: 0n };          // marker; callers refuse it
  const s = d < 0n ? -1n : 1n;
  const nn = n * s, dd = d * s;
  const g = bigGcd(nn, dd);
  return { n: nn / g, d: dd / g };
}
const isBadRat = (r: Rat): boolean => r.d === 0n;
const addR = (a: Rat, b: Rat): Rat => rat(a.n * b.d + b.n * a.d, a.d * b.d);
const subR = (a: Rat, b: Rat): Rat => rat(a.n * b.d - b.n * a.d, a.d * b.d);
const mulR = (a: Rat, b: Rat): Rat => rat(a.n * b.n, a.d * b.d);
const divR = (a: Rat, b: Rat): Rat => (b.n === 0n ? { n: 0n, d: 0n } : rat(a.n * b.d, a.d * b.n));
const negR = (a: Rat): Rat => ({ n: -a.n, d: a.d });
const eqR = (a: Rat, b: Rat): boolean => a.n === b.n && a.d === b.d;
const isZeroR = (a: Rat): boolean => a.n === 0n;
const showR = (a: Rat): string => (a.d === 1n ? String(a.n) : `${a.n}/${a.d}`);

// ───────────────────────────────────────────────────────────────────────────
// TOKENIZER — an allow-list, refusing everything else by name

const ALLOWED_DIGITS = '0123456789';
const ALLOWED_LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ALLOWED_SYMBOLS = '+-*/(). ';
const REFUSED_OPERATORS = '^%!';
const REFUSED_RELATIONS = '<>≤≥≠';

type Tok =
  | { k: 'num'; v: Rat }
  | { k: 'var'; name: string }
  | { k: 'op'; op: '+' | '-' | '*' | '/' }
  | { k: 'open' } | { k: 'close' };

type Fail = { ok: false; reason: string };
type Ok<T> = { ok: true; value: T };
const fail = (reason: string): Fail => ({ ok: false, reason });
const ok = <T>(value: T): Ok<T> => ({ ok: true, value });

/** Split canonical text into tokens, or refuse. Digits and a single dot form a
 *  literal; each letter is its own variable, so `sin(x)` becomes four variables
 *  and is refused as multi-variable rather than silently treated as a function
 *  this pilot cannot evaluate. */
function tokenize(s: string): Ok<Tok[]> | Fail {
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s.charAt(i);
    if (c === ' ') { i++; continue; }

    if (REFUSED_RELATIONS.includes(c)) return fail('unsupported_relation');
    if (REFUSED_OPERATORS.includes(c)) return fail('unsupported_operator');

    if (ALLOWED_DIGITS.includes(c) || c === '.') {
      let lit = '';
      while (i < s.length && (ALLOWED_DIGITS.includes(s.charAt(i)) || s.charAt(i) === '.')) {
        lit += s.charAt(i); i++;
      }
      const parsed = literalToRat(lit);
      if (!parsed.ok) return parsed;
      out.push({ k: 'num', v: parsed.value });
      continue;
    }
    if (ALLOWED_LETTERS.includes(c)) { out.push({ k: 'var', name: c }); i++; continue; }
    if (c === '(') { out.push({ k: 'open' }); i++; continue; }
    if (c === ')') { out.push({ k: 'close' }); i++; continue; }
    if (c === '+' || c === '-' || c === '*' || c === '/') { out.push({ k: 'op', op: c }); i++; continue; }

    if (!ALLOWED_SYMBOLS.includes(c)) return fail('unsupported_character');
    return fail('unsupported_character');
  }
  return ok(out);
}

/** "12" -> 12/1, "2.5" -> 5/2. Exact, by construction: the decimal is read as
 *  digits over a power of ten rather than through a float. */
function literalToRat(lit: string): Ok<Rat> | Fail {
  let dots = 0;
  for (const ch of lit) if (ch === '.') dots++;
  if (dots > 1 || lit === '' || lit === '.') return fail('parse_error');
  const dot = lit.indexOf('.');
  if (dot === -1) return ok(rat(BigInt(lit)));
  const whole = lit.slice(0, dot) || '0';
  const frac = lit.slice(dot + 1);
  if (frac === '') return fail('parse_error');
  let scale = 1n;
  for (let i = 0; i < frac.length; i++) scale *= 10n;
  return ok(rat(BigInt(whole) * scale + BigInt(frac), scale));
}

// ───────────────────────────────────────────────────────────────────────────
// PARSER — recursive descent over the tiny grammar. Nothing is executed.

type Node =
  | { k: 'num'; v: Rat }
  | { k: 'var'; name: string }
  | { k: 'bin'; op: '+' | '-' | '*' | '/'; l: Node; r: Node }
  | { k: 'neg'; e: Node };

function parseTokens(toks: Tok[]): Ok<Node> | Fail {
  let pos = 0;
  let failure: string | null = null;

  const peek = (): Tok | null => (pos < toks.length ? toks[pos] : null);
  const startsFactor = (tk: Tok | null): boolean =>
    !!tk && (tk.k === 'num' || tk.k === 'var' || tk.k === 'open');

  function expr(depth: number): Node | null {
    if (depth > MAX_DEPTH) { failure = failure ?? 'nesting_too_deep'; return null; }
    let left = term(depth);
    if (!left) return null;
    for (;;) {
      const tk = peek();
      if (tk && tk.k === 'op' && (tk.op === '+' || tk.op === '-')) {
        pos++;
        const right = term(depth);
        if (!right) return null;
        left = { k: 'bin', op: tk.op, l: left, r: right };
        continue;
      }
      return left;
    }
  }

  function term(depth: number): Node | null {
    let left = unary(depth);
    if (!left) return null;
    for (;;) {
      const tk = peek();
      if (tk && tk.k === 'op' && (tk.op === '*' || tk.op === '/')) {
        pos++;
        const right = unary(depth);
        if (!right) return null;
        left = { k: 'bin', op: tk.op, l: left, r: right };
        continue;
      }
      if (startsFactor(tk)) {                       // implicit multiplication: 3x, 2(x+1)
        const right = unary(depth);
        if (!right) return null;
        left = { k: 'bin', op: '*', l: left, r: right };
        continue;
      }
      return left;
    }
  }

  function unary(depth: number): Node | null {
    const tk = peek();
    if (tk && tk.k === 'op' && (tk.op === '+' || tk.op === '-')) {
      pos++;
      const e = unary(depth);
      if (!e) return null;
      return tk.op === '-' ? { k: 'neg', e } : e;
    }
    return primary(depth);
  }

  function primary(depth: number): Node | null {
    if (depth > MAX_DEPTH) { failure = failure ?? 'nesting_too_deep'; return null; }
    const tk = peek();
    if (!tk) { failure = failure ?? 'parse_error'; return null; }
    if (tk.k === 'num') { pos++; return { k: 'num', v: tk.v }; }
    if (tk.k === 'var') { pos++; return { k: 'var', name: tk.name }; }
    if (tk.k === 'open') {
      pos++;
      const inner = expr(depth + 1);
      if (!inner) return null;
      const close = peek();
      if (!close || close.k !== 'close') { failure = failure ?? 'parse_error'; return null; }
      pos++;
      return inner;
    }
    failure = failure ?? 'parse_error';
    return null;
  }

  if (!toks.length) return fail('parse_error');
  const node = expr(0);
  if (!node) return fail(failure ?? 'parse_error');
  if (pos !== toks.length) return fail('parse_error');
  return ok(node);
}

function variablesIn(node: Node, into: Set<string>): void {
  if (node.k === 'var') { into.add(node.name); return; }
  if (node.k === 'neg') { variablesIn(node.e, into); return; }
  if (node.k === 'bin') { variablesIn(node.l, into); variablesIn(node.r, into); }
}

// ───────────────────────────────────────────────────────────────────────────
// TWO INDEPENDENT WALKS
//
// evaluateAt substitutes the candidate and computes both sides. reduceLinear
// reduces the same tree to A·x + B. They are separate on purpose: they must
// agree, and a guard below refuses to conclude anything if they ever do not.
// That guard is what makes "ignore one side of the equation" a detectable
// change rather than a silent one.

function evaluateAt(node: Node, variable: string, value: Rat): Ok<Rat> | Fail {
  if (node.k === 'num') return ok(node.v);
  if (node.k === 'var') {
    return node.name === variable ? ok(value) : fail('multiple_variables');
  }
  if (node.k === 'neg') {
    const e = evaluateAt(node.e, variable, value);
    return e.ok ? ok(negR(e.value)) : e;
  }
  const l = evaluateAt(node.l, variable, value);
  if (!l.ok) return l;
  const r = evaluateAt(node.r, variable, value);
  if (!r.ok) return r;
  if (node.op === '+') return ok(addR(l.value, r.value));
  if (node.op === '-') return ok(subR(l.value, r.value));
  if (node.op === '*') return ok(mulR(l.value, r.value));
  const q = divR(l.value, r.value);
  return isBadRat(q) ? fail('division_by_zero_in_equation') : ok(q);
}

interface Linear { a: Rat; b: Rat }

function reduceLinear(node: Node, variable: string): Ok<Linear> | Fail {
  if (node.k === 'num') return ok({ a: rat(0n), b: node.v });
  if (node.k === 'var') {
    return node.name === variable
      ? ok({ a: rat(1n), b: rat(0n) })
      : fail('multiple_variables');
  }
  if (node.k === 'neg') {
    const e = reduceLinear(node.e, variable);
    return e.ok ? ok({ a: negR(e.value.a), b: negR(e.value.b) }) : e;
  }
  const l = reduceLinear(node.l, variable);
  if (!l.ok) return l;
  const r = reduceLinear(node.r, variable);
  if (!r.ok) return r;

  if (node.op === '+') return ok({ a: addR(l.value.a, r.value.a), b: addR(l.value.b, r.value.b) });
  if (node.op === '-') return ok({ a: subR(l.value.a, r.value.a), b: subR(l.value.b, r.value.b) });
  if (node.op === '*') {
    // x * x is degree two. This pilot verifies linear equations, and a quadratic
    // is refused rather than half-checked.
    if (!isZeroR(l.value.a) && !isZeroR(r.value.a)) return fail('nonlinear_not_supported');
    return ok({
      a: addR(mulR(l.value.a, r.value.b), mulR(r.value.a, l.value.b)),
      b: mulR(l.value.b, r.value.b),
    });
  }
  if (!isZeroR(r.value.a)) return fail('variable_in_denominator');
  if (isZeroR(r.value.b)) return fail('division_by_zero_in_equation');
  return ok({ a: divR(l.value.a, r.value.b), b: divR(l.value.b, r.value.b) });
}

// ───────────────────────────────────────────────────────────────────────────

interface Parsed { lhs: Node; rhs: Node; variable: string; canonical: string }

function parseEquation(rawEquation: unknown, declared: unknown): Ok<Parsed> | Fail {
  const canonical = canonicalizeText(rawEquation);
  if (!canonical) return fail('no_equation_supplied');
  if (canonical.length > MAX_EQUATION_CHARS) return fail('equation_too_long');

  for (const ch of canonical) if (REFUSED_RELATIONS.includes(ch)) return fail('unsupported_relation');

  let equals = 0;
  for (const ch of canonical) if (ch === '=') equals++;
  if (equals === 0) return fail('missing_equals');
  if (equals > 1) return fail('multiple_equals');

  const cut = canonical.indexOf('=');
  const sides: Node[] = [];
  for (const half of [canonical.slice(0, cut), canonical.slice(cut + 1)]) {
    const toks = tokenize(half);
    if (!toks.ok) return toks;
    const node = parseTokens(toks.value);
    if (!node.ok) return node;
    sides.push(node.value);
  }

  const found = new Set<string>();
  variablesIn(sides[0], found);
  variablesIn(sides[1], found);
  if (found.size === 0) return fail('no_variable_in_equation');
  if (found.size > 1) return fail('multiple_variables');

  const only = [...found][0];
  const want = typeof declared === 'string' && declared.trim() ? declared.trim() : null;
  if (want && want !== only) return fail('designated_variable_absent');

  return ok({ lhs: sides[0], rhs: sides[1], variable: only, canonical });
}

/** "5", "-3", "2.5", "5/2", "x = 5", "5 = x" -> one exact rational.
 *
 *  A candidate carrying a different variable is a mismatch, not a value: reading
 *  "y = 5" as 5 would verify an answer to a question nobody asked. */
function parseCandidate(raw: string, variable: string): Ok<Rat> | Fail {
  const s = canonicalizeText(raw);
  if (s.length > MAX_CANDIDATE_CHARS) return fail('candidate_too_long');

  let equals = 0;
  for (const ch of s) if (ch === '=') equals++;
  let valueText = s;
  if (equals === 1) {
    const cut = s.indexOf('=');
    const left = s.slice(0, cut).trim(), right = s.slice(cut + 1).trim();
    if (left === variable) valueText = right;
    else if (right === variable) valueText = left;
    else if (isBareVariable(left) || isBareVariable(right)) return fail('candidate_variable_mismatch');
    else return fail('unsupported_candidate_form');
  } else if (equals > 1) {
    return fail('unsupported_candidate_form');
  }

  const toks = tokenize(valueText);
  if (!toks.ok) return fail('unsupported_candidate_form');
  const node = parseTokens(toks.value);
  if (!node.ok) return fail('unsupported_candidate_form');
  const vars = new Set<string>();
  variablesIn(node.value, vars);
  if (vars.size > 0) return fail('unsupported_candidate_form');

  // The candidate has been checked to contain no variable, so the name and
  // value passed here are unreachable. NO_VARIABLE is a name the tokenizer
  // cannot produce: variables are single letters.
  const value = evaluateAt(node.value, NO_VARIABLE, rat(0n));
  return value.ok ? value : fail('unsupported_candidate_form');
}

function isBareVariable(s: string): boolean {
  return s.length === 1 && ALLOWED_LETTERS.includes(s);
}

/** The P5 verifier: exact rational substitution into a linear equation in one
 *  variable, supplied structurally. Pure, total, and offline. */
export function createAlgebraVerifier(): DeterministicVerifier {
  return {
    identity: { ...ALGEBRA_VERIFIER_IDENTITY },
    verify(request: VerificationRequest): Promise<VerificationResult> {
      const req = (request && typeof request === 'object') ? request : {} as VerificationRequest;
      const subj = (req.subject && typeof req.subject === 'object') ? req.subject : {};
      const done = (report: Record<string, unknown>) =>
        Promise.resolve(buildVerificationResult(ALGEBRA_VERIFIER_IDENTITY, req, report));
      const refuse = (reason: string) => done({ support: 'unsupported', reason });

      const interp = (subj as { interpretation?: unknown }).interpretation;
      if (!interp || typeof interp !== 'object') return refuse('no_structured_algebra_interpretation');
      const problem = interp as { type?: unknown; equation?: unknown; variable?: unknown };
      if (problem.type !== SUPPORTED_INTERPRETATION_TYPE) return refuse('unsupported_interpretation_type');

      // A missing equation is a missing INPUT, not an unhandled problem class.
      if (canonicalizeText(problem.equation) === '') {
        return done({ support: 'supported', outcome: 'insufficient_information', reason: 'no_equation_supplied' });
      }

      const parsed = parseEquation(problem.equation, problem.variable);
      if (!parsed.ok) return refuse(parsed.reason);
      const { lhs, rhs, variable, canonical } = parsed.value;

      const lin = reduceLinear({ k: 'bin', op: '-', l: lhs, r: rhs }, variable);
      if (!lin.ok) return refuse(lin.reason);
      const A = lin.value.a;                       // A·x = B, after moving both sides across
      const B = negR(lin.value.b);

      // An absent candidate is P4's guard, and it produces insufficient_information.
      if (req.candidate === null || req.candidate === undefined || String(req.candidate).trim() === '') {
        return done({ support: 'supported' });
      }
      const cand = parseCandidate(String(req.candidate), variable);
      if (!cand.ok) return refuse(cand.reason);
      const v = cand.value;

      const left = evaluateAt(lhs, variable, v);
      if (!left.ok) return refuse(left.reason);
      const right = evaluateAt(rhs, variable, v);
      if (!right.ok) return refuse(right.reason);
      const sidesMatch = eqR(left.value, right.value);

      const degenerate = isZeroR(A);
      const evidence = {
        interpretation_version: typeof (subj as { interpretation_version?: unknown }).interpretation_version === 'string'
          ? (subj as { interpretation_version?: string }).interpretation_version : null,
        equation_canonical: canonical,
        variable,
        candidate_normalized: showR(v),
        candidate_exact: { n: String(v.n), d: String(v.d) },
        substitution: { lhs: showR(left.value), rhs: showR(right.value), equal: sidesMatch },
        linear_form: {
          coefficient: showR(A),
          constant: showR(B),
          unique_solution: degenerate ? null : showR(divR(B, A)),
        },
        check: 'substituted_candidate_into_both_sides_and_compared_exact_rationals',
      };

      // A = 0: the equation does not determine the variable. Neither a pass nor
      // a failure of substitution says anything about THIS candidate, so neither
      // decisive outcome is honest.
      if (degenerate) {
        return done({
          support: 'supported', outcome: 'inconclusive', evidence,
          reason: isZeroR(B) ? 'equation_is_an_identity' : 'equation_has_no_solution',
        });
      }

      // The two walks must agree. If they ever disagree this module is wrong,
      // and the honest output is that nothing was established.
      if (eqR(mulR(A, v), B) !== sidesMatch) {
        return done({ support: 'supported', outcome: 'inconclusive', reason: 'internal_inconsistency' });
      }

      return done({
        support: 'supported',
        outcome: sidesMatch ? 'verified' : 'contradicted',
        evidence,
      });
    },
  };
}
