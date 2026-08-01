// Client writes to public.profiles must stay inside the column allow-list.
//
// THE REGRESSION THIS PINS
// ------------------------
// 20260727_profiles_column_privilege_hardening.sql (SEC-01) dropped the
// table-wide INSERT/UPDATE grants on public.profiles and re-granted an explicit
// per-column allow-list. `id` is on the INSERT list (the self-healing inserts
// must supply it) but deliberately NOT on the UPDATE list — a student has no
// business re-pointing their own row.
//
// PostgREST's merge-duplicates upsert — `.upsert(payload, { onConflict: 'id' })`
// in supabase-js — compiles to:
//
//     INSERT INTO profiles (...) VALUES (...)
//     ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id, email = EXCLUDED.email, ...
//
// It re-assigns EVERY payload column, the conflict key included. `id` is in the
// payload (it has to be, to identify the row), so the statement needs UPDATE(id)
// — which `authenticated` does not have. Postgres rejects it with
//
//     42501: permission denied for table profiles
//
// checked at executor start: before RLS, and whether or not a row actually
// conflicts. onboarding.html's final save used exactly this form, so from
// 2026-07-27 every student hit a red "permission denied for table profiles" on
// the last onboarding step and could not finish signup. Verified against the
// live database: the same statement minus `id = EXCLUDED.id` plans fine.
//
// So: no merge-duplicates upsert on profiles from the browser, ever.
// `ignoreDuplicates: true` (→ ON CONFLICT DO NOTHING, which writes no columns
// on conflict) is fine; UPDATE + INSERT-fallback is the pattern for a real save.
//
// The allow-lists below are parsed out of the migration rather than restated,
// so a future migration that widens or narrows a grant moves this test with it.
import { suite } from './_assert.mjs';
import { read, REPO } from './_source.mjs';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const t = suite('profiles-write-grants');
const MIGRATION = 'supabase/migrations/20260727_profiles_column_privilege_hardening.sql';

// ── The grants, straight from the migration ────────────────────────────────
// Strip `--` comments first: the file's prose contains illustrative GRANT and
// REVOKE statements that would otherwise be picked up ahead of the real ones.
const sql = read(MIGRATION).replace(/--[^\n]*/g, '');

function grantedColumns(privilege) {
  const re = new RegExp(
    `GRANT\\s+${privilege}\\s*\\(([^)]*)\\)\\s*ON\\s+public\\.profiles\\s+TO\\s+authenticated`, 'i');
  const m = sql.match(re);
  if (!m) throw new Error(`${MIGRATION}: no executable GRANT ${privilege} (...) block found`);
  const cols = m[1].split(',').map(s => s.trim()).filter(Boolean);
  if (!cols.length) throw new Error(`${MIGRATION}: GRANT ${privilege} allow-list is empty`);
  return new Set(cols);
}

const UPDATABLE = grantedColumns('UPDATE');
const INSERTABLE = grantedColumns('INSERT');

// ── Source scanning ────────────────────────────────────────────────────────
// Everything a browser loads. Edge Functions are exempt: they run as
// service_role, which kept its table-wide grants.
const CLIENT_FILES = [
  ...readdirSync(REPO).filter(f => /\.(html|js)$/.test(f)),
  ...readdirSync(resolve(REPO, 'assets')).filter(f => f.endsWith('.js')).map(f => `assets/${f}`),
].sort();

const lineOf = (src, i) => src.slice(0, i).split('\n').length;

/** Advance past whitespace and `//` comments. */
function skipTrivia(src, i) {
  for (;;) {
    while (i < src.length && /\s/.test(src[i])) i++;
    if (src.startsWith('//', i)) { const nl = src.indexOf('\n', i); if (nl < 0) return src.length; i = nl + 1; continue; }
    if (src.startsWith('/*', i)) { const e = src.indexOf('*/', i); if (e < 0) return src.length; i = e + 2; continue; }
    return i;
  }
}

/** Text of the argument list starting just after `(`, up to its matching `)`. */
function argText(src, start) {
  let depth = 1, i = start, q = null;
  while (i < src.length) {
    const c = src[i];
    if (q) {
      if (c === '\\') i++;
      else if (c === q) q = null;
    } else if (c === '"' || c === "'" || c === '`') q = c;
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) { depth--; if (depth === 0) return src.slice(start, i); }
    i++;
  }
  throw new Error('unbalanced call at offset ' + start);
}

/** The first top-level argument of an argument list (upsert's payload, not its options). */
function firstArg(text) {
  let depth = 0, i = 0, q = null;
  while (i < text.length) {
    const c = text[i];
    if (q) {
      if (c === '\\') i++;
      else if (c === q) q = null;
    } else if (c === '"' || c === "'" || c === '`') q = c;
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ',' && depth === 0) return text.slice(0, i);
    i++;
  }
  return text;
}

/** Top-level keys of an object literal, or null if `text` is not a literal. */
function literalKeys(text) {
  const s = text.trimStart();
  if (!s.startsWith('{')) return null;
  const keys = [];
  let depth = 0, i = 0, q = null, expectKey = false;
  while (i < s.length) {
    const c = s[i];
    if (q) {
      if (c === '\\') i++;
      else if (c === q) q = null;
      i++; continue;
    }
    if (c === '"' || c === "'" || c === '`') { q = c; i++; continue; }
    if (c === '{') { depth++; if (depth === 1) expectKey = true; i++; continue; }
    if (c === '}') { depth--; i++; continue; }
    if (c === '(' || c === '[') { depth++; i++; continue; }
    if (c === ')' || c === ']') { depth--; i++; continue; }
    if (depth === 1 && c === ',') { expectKey = true; i++; continue; }
    if (depth === 1 && expectKey && /[A-Za-z_$'"]/.test(c)) {
      const m = s.slice(i).match(/^(?:['"]([\w]+)['"]|([A-Za-z_$][\w$]*))\s*:/);
      if (m) { keys.push(m[1] || m[2]); i += m[0].length; expectKey = false; continue; }
      expectKey = false;
    }
    i++;
  }
  return keys;
}

/** Every `.from('profiles').<verb>(...)` write in a source file. */
function profileWrites(src, file) {
  const sites = [];
  const re = /\.from\(\s*['"]profiles['"]\s*\)/g;
  let m;
  while ((m = re.exec(src))) {
    let i = skipTrivia(src, m.index + m[0].length);
    if (src[i] !== '.') continue;
    const verb = (src.slice(i + 1).match(/^(update|upsert|insert)\b/) || [])[1];
    if (!verb) continue;
    const open = src.indexOf('(', i);
    sites.push({ file, verb, line: lineOf(src, m.index), args: argText(src, open + 1) });
  }
  return sites;
}

const sites = CLIENT_FILES.flatMap(f => profileWrites(read(f), f));
const where = s => `${s.file}:${s.line} .${s.verb}()`;

// ── 1. The grant asymmetry that makes merge-duplicates upserts fail ────────
t.section('Column grants (parsed from the migration)');
t.ok(`${MIGRATION} grants INSERT(id)`, INSERTABLE.has('id'));
t.ok('and withholds UPDATE(id) — so ON CONFLICT DO UPDATE cannot touch it',
  !UPDATABLE.has('id'));
t.ok('the onboarding columns are updatable',
  ['full_name', 'email', 'exam_type', 'target_score', 'exam_date',
   'study_sessions_per_week', 'session_length', 'onboarding_completed']
    .every(c => UPDATABLE.has(c)));
t.ok('no privileged column is client-writable',
  ['is_admin', 'role', 'credits_balance', 'subscription_credits', 'pack_credits',
   'plan_code', 'plan', 'subscription_expires_at', 'is_founder', 'founder_badge']
    .every(c => !UPDATABLE.has(c) && !INSERTABLE.has(c)));

// ── 2. No merge-duplicates upsert reaches profiles from the browser ────────
t.section('No merge-duplicates upsert on profiles');
const upserts = sites.filter(s => s.verb === 'upsert');
t.ok(`found upsert call sites to check (${upserts.length})`, upserts.length > 0);
for (const s of upserts) {
  t.ok(`${where(s)} passes ignoreDuplicates: true`,
    /ignoreDuplicates\s*:\s*true/.test(s.args));
}

// ── 3. Every statically visible written column is on its allow-list ────────
t.section('Written columns are granted');
let checked = 0, dynamic = 0;
for (const s of sites) {
  const keys = literalKeys(firstArg(s.args));
  if (!keys) { dynamic++; t.note(`${where(s)} — payload is a variable, not checkable here`); continue; }
  const allowed = s.verb === 'update' ? UPDATABLE : INSERTABLE;
  const denied = keys.filter(k => !allowed.has(k));
  checked++;
  t.is(`${where(s)} {${keys.join(', ')}}`, denied, []);
}
t.ok(`checked real payloads, not nothing (${checked} literal, ${dynamic} dynamic)`, checked >= 8);

// ── 4. onboarding's final save specifically ────────────────────────────────
// The page that broke. Pin the shape of the fix, not just its absence of upsert.
t.section("onboarding.html's final save");
const onboarding = read('onboarding.html');
const finalSave = onboarding.slice(onboarding.indexOf('var payload = {'));
t.ok('payload no longer carries `id`',
  !/var payload = \{[^}]*\bid\s*:/.test(finalSave));
t.ok('saves with .update().eq(\'id\', ...)',
  /\.from\('profiles'\)\.update\(payload\)\.eq\('id', currentUser\.id\)/.test(
    finalSave.replace(/\s*\n\s*/g, '')));
t.ok('falls back to .insert() when no row was updated',
  /\.from\('profiles'\)\.insert\(Object\.assign\(\{ id: currentUser\.id \}, payload\)\)/.test(
    finalSave.replace(/\s*\n\s*/g, '')));
t.ok('a lost insert race (23505) is not reported as an error',
  /ins\.error\.code !== '23505'/.test(finalSave));

t.done();
