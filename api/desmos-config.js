// /api/desmos-config — the only place a Desmos API key enters the product.
//
// WHY THIS IS A FUNCTION AND NOT A FILE
// -------------------------------------
// This repository is PUBLIC and has no build step. A key cannot be committed
// (Desmos API Terms §5.c, and a key in public git history cannot be un-published
// by a revert), and there is nothing at deploy time to template it into a static
// file. Vercel serves zero-config functions from /api for any project, including
// a static one, so this reads the environment variable at request time.
//
// WHAT "NOT EXPOSED CLIENT-SIDE" CAN AND CANNOT MEAN HERE
// -------------------------------------------------------
// It cannot mean the browser never sees the key. The Desmos JS API is loaded BY
// the student's browser from
//
//     https://www.desmos.com/api/v1.11/calculator.js?apiKey=<key>
//
// so the key is in that browser's network log the moment the calculator opens.
// There is no configuration of this endpoint that changes that; it is what a
// browser integration is. Anyone who tells you otherwise is describing a
// server-side proxy of Desmos's bundle, which is a different — and legally
// distinct — thing (see desmos-integration.md §9).
//
// What it CAN mean, and what this file now enforces:
//
//   · not in git                — validate-desmos-activation.mjs fails CI on a
//                                 literal apiKey in any tracked file
//   · not in logs               — the same check fails CI if any console call
//                                 here references a config value
//   · not in the page source    — the config is fetched on demand, not inlined
//   · not served to anonymous   — THIS FILE. A caller must present a valid
//     requests                    Supabase session; without one it gets 401 and
//                                 no key. Before 2026-08-28 this endpoint served
//                                 the key to the open internet, which made the
//                                 exposure much wider than the exam itself.
//   · not fetched until needed  — the launcher asks for it when a student opens
//                                 the calculator, not on every exam page load
//
// The control that actually binds is domain-restricting the key at Desmos, if
// they support it. That is an open question in desmos-integration.md §8.
//
// THE CONTRACT IS NOT RESHAPED HERE
// ---------------------------------
// The environment variable IS the configuration object, as JSON. This endpoint
// parses it, checks it, and returns it. It does not rename fields, supply
// defaults the provider already supplies, or invent a second spelling — a
// translation layer between the variable and the contract is a place for the two
// to drift apart silently.
'use strict';

var FIELDS = ['apiKey', 'tier', 'studentFacing', 'apiVersion'];

// Public by design: this exact value is already inlined in every signed-in page
// of this repository, which is public. It identifies the project to Supabase's
// auth endpoint; it authorises nothing — the caller's own bearer token does
// that. Defaulted rather than required, because an unset variable here would
// make the calculator silently inert with no visible cause.
var SB_URL = process.env.SUPABASE_URL || 'https://igvkyxkmjnkzscqgommj.supabase.co';
var SB_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_MTRD_njnCX-1CobeqTIMiw_QhNYarXp';

function send(res, status, obj, note) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // Not cached anywhere. A cached copy would outlive a rotated or revoked key,
  // and a CDN edge holding a credential is a credential in one more place.
  res.setHeader('Cache-Control', 'no-store, max-age=0, private');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Vary', 'Authorization');
  res.statusCode = status;
  res.end(JSON.stringify(note ? Object.assign({ note: note }, obj) : obj));
}

// An inert answer is a NORMAL outcome, not an error: preview deployments with
// no variable, forks, and any environment where the calculator is deliberately
// off. The provider's own 'no-key' state handles it, and no student sees a
// broken control because exam-registry.js must also name the provider.
function inert(res, note) { return send(res, 200, { config: {} }, note); }

/**
 * Is this caller a signed-in user of THIS project?
 *
 * Verified by asking Supabase, not by decoding the token here — a locally
 * decoded JWT proves only that someone can write JSON. Returns true/false and
 * never throws; a Supabase outage must not become a 500 on the exam page.
 */
async function isSignedIn(req) {
  try {
    var auth = req.headers && (req.headers.authorization || req.headers.Authorization);
    if (!auth || !/^Bearer\s+\S+$/i.test(String(auth))) return false;
    if (!SB_KEY) return false;
    var r = await fetch(SB_URL + '/auth/v1/user', {
      headers: { Authorization: String(auth), apikey: SB_KEY },
    });
    return r.status === 200;
  } catch (e) { return false; }
}

module.exports = async function handler(req, res) {
  if (!SB_KEY) {
    // Fail CLOSED. Without the publishable key this function cannot tell a
    // student from a stranger, and serving the credential to both is worse
    // than serving it to neither.
    console.error('desmos-config: SUPABASE_PUBLISHABLE_KEY is not set; refusing to serve a key');
    return inert(res, 'Server is not configured to verify sessions. Calculator inert.');
  }
  if (!(await isSignedIn(req))) {
    return send(res, 401, { config: {} }, 'Sign in to use the calculator.');
  }

  var raw = process.env.SI_DESMOS_CONFIG;
  if (!raw || !String(raw).trim()) {
    return inert(res, 'SI_DESMOS_CONFIG is not set in this environment.');
  }

  var cfg;
  try {
    cfg = JSON.parse(String(raw));
  } catch (e) {
    // The message never includes `raw` — a malformed value still contains a key.
    console.error('desmos-config: SI_DESMOS_CONFIG is not valid JSON');
    return inert(res, 'SI_DESMOS_CONFIG could not be parsed. Calculator inert.');
  }
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
    console.error('desmos-config: SI_DESMOS_CONFIG is not an object');
    return inert(res, 'SI_DESMOS_CONFIG is not an object. Calculator inert.');
  }

  var picked = {};
  for (var i = 0; i < FIELDS.length; i++) {
    if (Object.prototype.hasOwnProperty.call(cfg, FIELDS[i])) picked[FIELDS[i]] = cfg[FIELDS[i]];
  }
  var extra = Object.keys(cfg).filter(function (k) { return FIELDS.indexOf(k) === -1; });
  if (extra.length) {
    // Named, because a typo'd field is silently ignored otherwise and the
    // symptom is a calculator that will not start for no visible reason.
    console.error('desmos-config: ignoring unknown field(s): ' + extra.join(', '));
  }

  if (typeof picked.apiKey !== 'string' || !picked.apiKey.trim()) {
    console.error('desmos-config: apiKey is missing or not a non-empty string');
    return inert(res, 'SI_DESMOS_CONFIG has no usable apiKey. Calculator inert.');
  }
  if (picked.tier !== 'commercial' && picked.tier !== 'trial') {
    console.error('desmos-config: tier must be "commercial" or "trial"');
    return inert(res, 'SI_DESMOS_CONFIG has no valid tier. Calculator inert.');
  }
  // The same refusal the client makes, made again here. API Terms §2.a: the
  // 90-day trial is for internal evaluation, so it must not be served to
  // students. Two independent refusals, because the client-side one lives in
  // code a browser could be serving a stale copy of.
  if (picked.tier === 'trial' && picked.studentFacing === true) {
    console.error('desmos-config: refusing to serve a trial-tier key as student-facing (API Terms 2.a)');
    return inert(res, 'Trial tier is internal-only under API Terms 2.a. Calculator inert.');
  }
  if (picked.apiVersion !== undefined && !/^v\d+\.\d+$/.test(String(picked.apiVersion))) {
    console.error('desmos-config: apiVersion must look like v1.11');
    delete picked.apiVersion;   // fall back to the provider's own default
  }

  // The note names the tier, never the key.
  return send(res, 200, { config: picked }, 'Desmos configuration, ' + picked.tier + ' tier.');
};
