// /api/desmos-config — the only place a Desmos API key enters the product.
//
// WHY THIS IS A FUNCTION AND NOT A FILE
// -------------------------------------
// This repository is PUBLIC and has no build step. A key cannot be committed
// (Desmos API Terms §5.c, and a key in public git history cannot be un-published
// by a revert), and there is nothing at deploy time to template it into a static
// file. Vercel serves zero-config functions from /api for any project, including
// a static one, so this reads the environment variable at request time and hands
// the page the configuration object exam-graph-desmos.js already expects.
//
// It changes no build settings. The project stays framework: null with no build
// command, and every other file is served exactly as before. That mattered more
// than elegance: this site is live, and a broken build breaks all of it, not
// just the calculator.
//
// THE CONTRACT IS NOT RESHAPED HERE
// ---------------------------------
// The environment variable IS the configuration object, as JSON. This endpoint
// parses it, checks it, and assigns it. It does not rename fields, supply
// defaults for fields the provider defaults itself, or invent a second spelling
// of the same setting — a translation layer between the env var and the contract
// is a place for the two to drift apart silently.
//
// WHAT IT DOES NOT PRETEND
// ------------------------
// This endpoint is public, and the key it returns is visible to anyone who
// requests it. That is not a weakness of this design; it is what a browser
// integration is. The Desmos API script is loaded by the student's browser with
// the key in its URL, so the key is in the page's network log no matter how it
// got there. §5.c's "reasonable efforts" are therefore: never in git (enforced
// by scripts/validate-desmos-activation.mjs), never in logs (below), and
// domain-restricted at Desmos if they support it — which is the control that
// actually binds, and an open question in desmos-integration.md §8.
'use strict';

var FIELDS = ['apiKey', 'tier', 'studentFacing', 'apiVersion'];

// Never interpolated into the response. A key is only ever assigned as a JSON
// string by JSON.stringify of a checked object, so a key containing a quote or
// a </script> cannot break out of anything.
function emit(res, obj, note) {
  var body = '// ' + note + '\n'
    + 'globalThis.SI_DESMOS_CONFIG = ' + JSON.stringify(obj) + ';\n';
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  // Not cached anywhere. A cached copy would outlive a rotated or revoked key,
  // and a CDN edge holding a credential is a credential in one more place.
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.statusCode = 200;
  res.end(body);
}

module.exports = function handler(req, res) {
  var raw = process.env.SI_DESMOS_CONFIG;

  // Absent is a NORMAL state, not an error: preview deployments, forks and any
  // environment where the calculator is deliberately off. The provider's own
  // 'no-key' state handles it, and no student sees a broken control because
  // exam-registry.js must also name the provider before anything renders.
  if (!raw || !String(raw).trim()) {
    return emit(res, {}, 'SI_DESMOS_CONFIG is not set in this environment.');
  }

  var cfg;
  try {
    cfg = JSON.parse(String(raw));
  } catch (e) {
    // The message never includes `raw` — a malformed value still contains a key.
    console.error('desmos-config: SI_DESMOS_CONFIG is not valid JSON');
    return emit(res, {}, 'SI_DESMOS_CONFIG could not be parsed. Calculator inert.');
  }
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
    console.error('desmos-config: SI_DESMOS_CONFIG is not a JSON object');
    return emit(res, {}, 'SI_DESMOS_CONFIG is not an object. Calculator inert.');
  }

  var out = {};
  for (var i = 0; i < FIELDS.length; i++) {
    if (Object.prototype.hasOwnProperty.call(cfg, FIELDS[i])) out[FIELDS[i]] = cfg[FIELDS[i]];
  }
  var extra = Object.keys(cfg).filter(function (k) { return FIELDS.indexOf(k) === -1; });
  if (extra.length) {
    // Named, because a typo'd field is silently ignored otherwise and the
    // symptom is a calculator that will not start for no visible reason.
    console.error('desmos-config: ignoring unknown field(s): ' + extra.join(', '));
  }

  if (typeof out.apiKey !== 'string' || !out.apiKey.trim()) {
    console.error('desmos-config: apiKey is missing or not a non-empty string');
    return emit(res, {}, 'SI_DESMOS_CONFIG has no usable apiKey. Calculator inert.');
  }
  if (out.tier !== 'commercial' && out.tier !== 'trial') {
    console.error('desmos-config: tier must be "commercial" or "trial"');
    return emit(res, {}, 'SI_DESMOS_CONFIG has no valid tier. Calculator inert.');
  }
  // The same refusal the client makes, made again here. API Terms §2.a: the
  // 90-day trial is for internal evaluation, so it must not be served to
  // students. Two independent refusals because one of them is in code a student's
  // browser could, in principle, be served a stale copy of.
  if (out.tier === 'trial' && out.studentFacing === true) {
    console.error('desmos-config: refusing to serve a trial-tier key as student-facing (API Terms 2.a)');
    return emit(res, {}, 'Trial tier is internal-only under API Terms 2.a. Calculator inert.');
  }
  if (out.apiVersion !== undefined && !/^v\d+\.\d+$/.test(String(out.apiVersion))) {
    console.error('desmos-config: apiVersion must look like v1.11');
    delete out.apiVersion;   // fall back to the provider's own default
  }

  // The note names the tier, never the key.
  return emit(res, out, 'Desmos configuration, ' + out.tier + ' tier.');
};
