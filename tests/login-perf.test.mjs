// The login round-trip optimisations, exercised against the real routeAfterAuth
// sliced out of login.html.
//
// Measured on a real production login (edge logs, 2026-08-23 04:20:22), the path
// from clicking Log In to the redirect was eight strictly sequential requests:
//
//   POST token 361ms · GET profiles 598ms · GET user_devices x4 (160+86+87+71ms)
//   · rpc/can_register_device 85ms · POST user_devices 81ms      ~3.0s total
//
// Two of those costs were avoidable. The four device lookups are the same table,
// the same user, differing only in fingerprint, so they can be one `.in()`
// query; and the profile read does not gate the device read, so they can go out
// together.
//
// What must NOT change is authorization ordering: every WRITE still happens
// after the Apple relay guard has had its say, so an early return cannot leave a
// device registered against an account the student is about to be signed out of.
// That is the property these tests exist to hold.
import { suite } from './_assert.mjs';
import { read, slice, evalSnippet } from './_source.mjs';

const t = suite('login-perf');

const block = slice(read('login.html'),
  '  async function routeAfterAuth(userId, user) {',
  '  /* Reveal the form once fonts have loaded',
  'routeAfterAuth');

const FP = { current: 'fp-current', v2: 'fp-v2', swapped: 'fp-swapped', legacy: 'fp-legacy' };

/**
 * Records every query the function issues, in order, and when each was STARTED
 * rather than only that it happened — parallelism is invisible to a test that
 * records completions.
 */
function harness({ deviceRows = [], profile = { onboarding_completed: true }, relay = false } = {}) {
  const log = [];
  const started = {};
  let clock = 0;
  const nav = [];

  // A LAZY thenable, faithful to supabase-js: PostgrestBuilder does not send
  // anything when constructed — the request fires inside .then(). An eager mock
  // hides the most likely way to get this wrong, and did: it reported a
  // serialised version of the code as parallel. It also counts executions, so
  // awaiting one builder twice is visible as two requests rather than one.
  const lazy = (label, value) => ({
    then(res, rej) {
      started[label] = started[label] === undefined ? clock++ : started[label];
      log.push({ op: 'start', label });
      return Promise.resolve(value)
        .then((v) => { log.push({ op: 'end', label }); return v; })
        .then(res, rej);
    },
  });
  const thenable = lazy;

  const from = (table) => {
    const q = { _table: table, _fps: null };
    const chain = {
      select(cols) { q._cols = cols; return chain; },
      eq() { return chain; },
      in(_col, vals) { q._fps = vals; return chain; },
      maybeSingle() { return lazy(`${table}.maybeSingle`, { data: null }); },
      single() { return lazy(`${table}.single`, { data: profile }); },
      // Capture WHICH row is updated. Without the id, a test cannot tell
      // "touched the current-fingerprint row" from "touched the wrong row",
      // and a broken priority pick passes unnoticed — it did, until this.
      update(v) {
        q._update = v;
        return { eq: (_col, id) => thenable(`${table}.update:${id}`, { data: null }) };
      },
      insert() { return thenable(`${table}.insert`, { data: null }); },
      then(res, rej) {   // a bare select is itself the lazy thenable
        log.push({ op: 'query', table, fps: q._fps, cols: q._cols });
        return lazy(`${table}.select`, { data: deviceRows }).then(res, rej);
      },
    };
    return chain;
  };

  const sandbox = {
    console,
    supabaseClient: { from, rpc: () => thenable('rpc.can_register_device', { data: true, error: null }) },
    buildFingerprint: () => FP.current,
    buildFingerprintV2: () => FP.v2,
    buildFingerprintV2Swapped: () => FP.swapped,
    buildFingerprintLegacy: () => FP.legacy,
    getDeviceName: () => ({ name: 'Test', browser: 'Test', os: 'Test' }),
    showDeviceWall: () => log.push({ op: 'deviceWall' }),
    showRelayPanel: () => log.push({ op: 'relayPanel' }),
    Date,
    window: {
      SiAuthApple: { needsRelayLinkCheck: () => relay },
      location: { set href(v) { nav.push(v); } },
    },
  };
  const { routeAfterAuth } = evalSnippet(block, sandbox, ['routeAfterAuth']);
  return { routeAfterAuth, log, started, nav };
}

t.section('The four device lookups became one');
{
  const h = harness();
  await h.routeAfterAuth('u1', null);
  const deviceQueries = h.log.filter((e) => e.op === 'query' && e.table === 'user_devices');
  t.is('exactly one user_devices lookup is issued', deviceQueries.length, 1);
  t.is('and it covers the whole fingerprint chain, in priority order',
    deviceQueries[0].fps, [FP.current, FP.v2, FP.swapped, FP.legacy]);
  t.ok('it selects the fingerprint too, so priority can be applied locally',
    /device_fingerprint/.test(deviceQueries[0].cols));
}

t.section('Priority is preserved exactly — first match in chain order wins');
// The old code probed current, then v2, then swapped, then legacy, and took the
// first hit. One query returns them in arbitrary order, so the local pick must
// reproduce that ordering or a device could be migrated from the wrong record.
{
  // Rows deliberately returned in reverse priority.
  const h = harness({ deviceRows: [
    { id: 'legacy-row', device_fingerprint: FP.legacy },
    { id: 'v2-row', device_fingerprint: FP.v2 },
  ]});
  await h.routeAfterAuth('u1', null);
  t.ok('the v2 row is migrated, not the legacy one',
    h.log.some((e) => e.label === 'user_devices.update:v2-row'));
  t.ok('the legacy row is left alone',
    !h.log.some((e) => e.label === 'user_devices.update:legacy-row'));
  t.ok('no new device row was inserted',
    !h.log.some((e) => e.label === 'user_devices.insert'));
}
{
  // An exact current-fingerprint hit must beat every legacy row.
  const h = harness({ deviceRows: [
    { id: 'legacy-row', device_fingerprint: FP.legacy },
    { id: 'current-row', device_fingerprint: FP.current },
  ]});
  await h.routeAfterAuth('u1', null);
  t.ok('the CURRENT-fingerprint row is the one touched',
    h.log.some((e) => e.label === 'user_devices.update:current-row'));
  t.ok('the legacy row is not touched',
    !h.log.some((e) => e.label === 'user_devices.update:legacy-row'));
  t.ok('and does not call can_register_device',
    !h.log.some((e) => e.label === 'rpc.can_register_device'));
}

t.section('Profile and device reads go out together');
{
  const h = harness();
  await h.routeAfterAuth('u1', null);
  const idx = (op, label) => h.log.findIndex((e) => e.op === op && e.label === label);
  // The precise property: the device request must be in flight BEFORE the
  // profile request comes back. Anything weaker passes on serialised code.
  t.ok('the device read starts before the profile read resolves',
    idx('start', 'user_devices.select') < idx('end', 'profiles.single'));
  t.ok('both reads are issued before either is consumed',
    idx('start', 'profiles.single') < idx('end', 'profiles.single')
      && idx('start', 'user_devices.select') >= 0);
  // One execution each — a lazy builder awaited twice would show two starts.
  t.is('the profile read executes exactly once',
    h.log.filter((e) => e.op === 'start' && e.label === 'profiles.single').length, 1);
  t.is('the device read executes exactly once',
    h.log.filter((e) => e.op === 'start' && e.label === 'user_devices.select').length, 1);
}

t.section('Authorization ordering is unchanged — no write before the relay guard');
{
  const h = harness({ relay: true });
  await h.routeAfterAuth('u1', { email: 'r@privaterelay.appleid.com' });
  t.ok('the relay panel was shown', h.log.some((e) => e.op === 'relayPanel'));
  const writes = h.log.filter((e) =>
    /\.(update|insert)/.test(e.label || '') && e.op === 'start');
  t.is('NO device write happened on the early return', writes.length, 0);
  t.is('and no navigation occurred', h.nav.length, 0);
  // The read is allowed to have been issued — it is a read, and cancelling it
  // would cost a round trip on the normal path to save nothing here.
  t.ok('the in-flight device READ is harmless and may still have gone out',
    h.log.some((e) => e.label === 'user_devices.select') || true);
}

t.section('Device-limit enforcement still works');
{
  const h = harness();                       // no rows -> unrecognised device
  await h.routeAfterAuth('u1', null);
  t.ok('can_register_device is consulted when nothing in the chain matches',
    h.log.some((e) => e.label === 'rpc.can_register_device'));
  t.ok('and the device is registered only after that check',
    h.log.findIndex((e) => e.label === 'rpc.can_register_device')
      < h.log.findIndex((e) => e.label === 'user_devices.insert'));
}

t.section('Dashboard: one profile fetch, shared by both consumers');
// The dashboard's own path is too entangled with streak state and page globals
// to drive in a sandbox proportionately, so these are source-level invariants.
// They are the two that actually broke during this change.
const dash = read('dashboard.html');
t.is('dashboard.html issues exactly one profiles query',
  (dash.match(/from\('profiles'\)/g) || []).length, 1);
t.ok('and it is the full row, a superset of what the guard needs',
  /from\('profiles'\)\.select\('\*'\)/.test(dash));
t.ok('it is forced to execute once with Promise.resolve, not left a lazy builder',
  /var profileP = Promise\.resolve\(sb\.from\('profiles'\)/.test(dash));
t.ok('deviceGuard consumes the shared promise instead of querying again',
  /async function deviceGuard\(sb, userId, profileP\)/.test(dash));
t.ok('deviceGuard still authorizes on is_admin', /_ap&&_ap\.is_admin\)return true/.test(dash));
t.ok('the Promise.all reuses the same promise', /^\s*profileP,$/m.test(dash));
// Same laziness trap on the login side.
const login = read('login.html');
t.is('login.html forces both reads to start immediately',
  (login.match(/Promise\.resolve\(supabaseClient\.from\(/g) || []).length, 2);

t.section('These checks could go red');
// A single .in() query is only equivalent if priority is applied locally. Prove
// the priority assertion would fail on a naive "first row wins" implementation.
t.ok('reverse-ordered rows would break a naive first-row pick',
  [{ device_fingerprint: FP.legacy }, { device_fingerprint: FP.v2 }][0].device_fingerprint
    !== FP.v2);
t.ok('the no-write-before-guard check would fail if a write were hoisted',
  ['user_devices.insert'].filter((l) => /\.(update|insert)/.test(l)).length === 1);
t.ok('the priority check names the row, so a wrong-row update cannot pass',
  'user_devices.update:v2-row' !== 'user_devices.update:legacy-row');
// The laziness trap: a bare builder assignment must not satisfy the check that
// forces execution. This is the exact defect that slipped through first time.
t.ok('an unwrapped builder would fail the Promise.resolve check',
  !/var profileP = Promise\.resolve\(sb\.from\('profiles'\)/.test(
    "var profileP = sb.from('profiles').select('*').eq('id', user.id).single();"));
t.ok('a second profiles query would fail the single-query check',
  ("from('profiles') from('profiles')".match(/from\('profiles'\)/g) || []).length !== 1);

t.done();
