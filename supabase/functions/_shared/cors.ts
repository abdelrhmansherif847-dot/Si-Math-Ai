// Shared CORS policy for every Si Math AI Edge Function.
//
// Single source of truth for origin handling. Behaviour is identical to the
// implementation ai-tutor has carried inline since v88 (SECURITY.md SEC-03);
// this module exists so admin-actions and anything added later cannot drift
// from it. ai-tutor still has its own inline copy for now — migrating a
// 291,876-byte production function is a deliberate change of its own, and
// tests/edge-security.test.mjs asserts the two agree (behaviourally: it calls
// both implementations, it does not compare their text).
//
// THAT SIZE READ "205 KB" UNTIL 2026-08-25. It was accurate when written and
// simply stopped being so; ai-tutor is now 291,876 bytes / 5,122 lines,
// measured. The argument it supports gets stronger as the number grows, which
// is exactly why a stale one is worth correcting rather than ignoring.
//
// THIS FILE'S COMMENTS ARE AHEAD OF TWO DEPLOYED BUNDLES, BY DECISION. It ships
// inside admin-actions (platform version 16) and support-actions (platform
// version 1), and both deployed copies still carry the old sentence. The
// correction here is COMMENT-ONLY — the executable source is unchanged and NO
// redeploy was performed, because deploying two functions that handle money and
// support escalations in order to fix a number in a comment costs more risk
// than the divergence it removes. The consequence, deliberate and recorded so
// it is not misread later: a byte-for-byte comparison of either bundle against
// this tree will differ, in comments and nowhere else.
//
// WHY NOT `Access-Control-Allow-Origin: *`
// ---------------------------------------
// A wildcard lets any website on the internet script these endpoints against a
// visiting user's session: the browser attaches their bearer token and hands
// the response back to the attacker's page. For admin-actions that is the
// owner's session, and the endpoint moves money — credit grants, payment
// approval, founder slots.
//
// ENFORCEMENT IS OPT-IN, AND DELIBERATELY SO
// ------------------------------------------
// With ALLOWED_ORIGINS unset the function keeps permissive behaviour and logs
// a warning rather than rejecting. These functions are deployed by hand
// (DEPLOY.md §4) and the origin list lives in Supabase project config, not in
// this repo — a fail-closed default would mean anyone deploying without first
// setting the secret takes the platform down for every user.
//
// Set it with:
//   supabase secrets set ALLOWED_ORIGINS="https://si-math-ai.com,https://www.si-math-ai.com"
//
// The value must be scheme + host with NO trailing slash and no path, because
// that is exactly the shape a browser sends in the Origin header. A mismatch
// does not fail loudly — it returns 403 to real users while a naive check that
// asks the function about the same value it was configured with still passes.

const ALLOWED_ORIGINS: string[] = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',').map((o) => o.trim()).filter(Boolean);

export const ORIGIN_ENFORCED = ALLOWED_ORIGINS.length > 0;

if (!ORIGIN_ENFORCED) {
  console.log('[cors] WARNING: ALLOWED_ORIGINS unset — origin enforcement is ' +
    'DISABLED and every origin is accepted. Set the env var to enable it.');
}

/** Exact-match only. Suffix or substring matching would accept
 *  `https://si-math-ai.com.evil.example`. */
export function isAllowedOrigin(origin: string): boolean {
  if (!ORIGIN_ENFORCED) return true;   // unconfigured → permissive, as above
  if (!origin) return false;
  return ALLOWED_ORIGINS.includes(origin);
}

/** Headers for any response. Echoes the caller's origin only when it is on the
 *  list — an unrecognised origin gets no ACAO header at all, so the browser
 *  blocks the response. That is NOT the same as returning `*`. */
export function corsHeaders(origin: string): Record<string, string> {
  const h: Record<string, string> = {
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
  // Only ever echo a non-empty, permitted origin. A request with no Origin
  // header is server-to-server and needs no ACAO; emitting an empty one would
  // be a malformed header.
  if (origin && isAllowedOrigin(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

/** True when a browser request arrives from an origin we do not permit.
 *  A request with no Origin is server-to-server (curl, smoke tests) and is
 *  allowed through: anyone who can script curl can also forge an Origin
 *  header, so the check buys nothing there. Its whole value is stopping a
 *  third-party *website* from riding a user's session, and that case always
 *  carries a real Origin the browser will not let script code fake. */
export function isBlockedOrigin(origin: string): boolean {
  return !!origin && !isAllowedOrigin(origin);
}
