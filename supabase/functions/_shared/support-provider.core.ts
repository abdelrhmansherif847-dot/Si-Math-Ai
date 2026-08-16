// Help & Support — the meeting-provider contract.
//
// PREPARED. Depends on migrations 20260815a–20260815f, which are NOT applied.
// Nothing in this file talks to a database; it is pure logic so that
// tests/support-isolation.test.mjs can execute the REAL shipped source rather
// than a paraphrase of it.
//
// =====================================================================
// WHY THIS FILE EXISTS AT ALL
// =====================================================================
// 20260815a made provider_ref a jsonb column rather than typed Zoom columns,
// "so the schema does not encode one vendor's vocabulary". That decision is
// only worth anything if the CODE also refuses to encode one vendor: an
// adapter interface here, one implementation per provider, and a registry the
// Edge Function reads from support.meeting_provider. Swapping Zoom for
// anything else is then a new file and a settings UPDATE — no migration, no
// client change, which is exactly what the owner asked for.
//
// =====================================================================
// THE SECURITY PROPERTY THIS FILE OWNS
// =====================================================================
// support_meetings.provider_ref IS READ BY THE STUDENT. 20260815b's
// support_meetings_read_own policy lets a meeting's owner SELECT the row, and
// support.html reads provider_ref.join_url from it. So provider_ref is not
// internal storage — it is a public field with extra steps.
//
// Zoom's create-meeting response contains `start_url`, and a start_url is a
// bearer credential: anyone holding it joins AS THE HOST, with host controls,
// with no further authentication. Storing the provider's raw response in
// provider_ref would hand every student host rights over their own support
// call — and, because the URL embeds a signed host token, a durable credential
// they could keep after the meeting.
//
// So provider_ref is a REDACTED PROJECTION, never the provider's response.
// redactProviderRef() is an ALLOW-LIST, deliberately: a deny-list would leak
// every field a provider adds later, and "we did not know Zoom started
// returning that" is not a defence. A key that is not named below cannot reach
// the database, whatever the provider sends.
// =====================================================================

/** Every key permitted to reach support_meetings.provider_ref, and why.
 *  Adding one is a security decision: assume a student reads it, because one
 *  will. */
export const PROVIDER_REF_ALLOWED = [
  'provider',     // which adapter produced this — 'zoom'
  'meeting_id',   // the provider's own id, for support to quote in a ticket
  'join_url',     // the ATTENDEE url. Not start_url. Never start_url.
  'passcode',     // shown next to the join button; useless without the url
  'starts_at',    // what the provider recorded, for comparison with the slot
] as const;

/** Keys seen in real provider responses that must NEVER be persisted. Not the
 *  enforcement — the allow-list above is — but naming them makes the intent
 *  greppable, and the isolation suite asserts each one is actually dropped. */
export const PROVIDER_REF_FORBIDDEN = [
  'start_url',            // Zoom: host-authenticated join. A bearer credential.
  'host_email', 'host_id',
  'encrypted_password',   // Zoom returns this alongside the plain passcode
  'access_token', 'refresh_token', 'token', 'client_secret', 'api_secret',
  'settings',             // whole subtree; has contained host keys historically
  'registration_url',
] as const;

export type ProviderRef = Record<string, unknown>;

/** Project a provider response down to the permitted keys.
 *
 *  Values are flattened to primitives on purpose. A nested object could carry a
 *  forbidden key one level down and satisfy a top-level allow-list, so anything
 *  that is not a string, finite number or boolean is dropped rather than
 *  recursed into: this file's job is a flat, boring, readable record. */
export function redactProviderRef(raw: unknown): ProviderRef {
  const out: ProviderRef = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const src = raw as Record<string, unknown>;
  for (const key of PROVIDER_REF_ALLOWED) {
    if (!(key in src)) continue;
    const v = src[key];
    if (typeof v === 'string') { if (v.length > 0 && v.length <= 2048) out[key] = v; }
    else if (typeof v === 'number' && Number.isFinite(v)) out[key] = String(v);
    else if (typeof v === 'boolean') out[key] = v;
    // anything else — object, array, null, function — is dropped
  }
  return out;
}

/** True when a ref is safe to write. The Edge Function asserts this after
 *  redaction as a second, independent check: if redactProviderRef is ever
 *  edited into something leaky, this still refuses the write. */
export function isSafeProviderRef(ref: unknown): boolean {
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)) return false;
  const allowed = new Set<string>(PROVIDER_REF_ALLOWED as readonly string[]);
  for (const [k, v] of Object.entries(ref as Record<string, unknown>)) {
    if (!allowed.has(k)) return false;
    if (v !== null && typeof v === 'object') return false;
  }
  return true;
}

/** support_slots_provider_chk in 20260815a is `provider ~ '^[a-z][a-z0-9_]{1,31}$'`.
 *  Validating here means a bad provider name is refused with a sentence rather
 *  than a constraint violation. */
export const PROVIDER_NAME_RE = /^[a-z][a-z0-9_]{1,31}$/;

export function isValidProviderName(name: unknown): name is string {
  return typeof name === 'string' && PROVIDER_NAME_RE.test(name);
}

/** What a meeting looks like to an adapter. Deliberately not Zoom-shaped. */
export interface MeetingRequest {
  topic: string;        // what the student sees in the provider's UI
  startsAt: string;     // ISO 8601
  endsAt: string;       // ISO 8601 — the caller needs the window, not just a length
  durationMinutes: number;
  agenda?: string;
  /** The slot's host_id. An adapter maps it to whatever a host means to it;
   *  null means "the default host". Present here so support_meeting_slots.host_id
   *  is actually load-bearing rather than decorative. */
  hostId?: string | null;
}

/** One provider. Two methods, because a meeting is created and eventually
 *  released, and nothing else belongs at this boundary. */
export interface MeetingProvider {
  readonly name: string;
  /** Create a meeting. MUST return the provider's raw response; redaction is
   *  the caller's job, in one place, so an adapter cannot forget to do it. */
  create(req: MeetingRequest): Promise<Record<string, unknown>>;
  /** Delete/cancel at the provider. Idempotent: an already-gone meeting is a
   *  success, because the caller's goal is "not scheduled any more". */
  release(providerMeetingId: string): Promise<void>;
}

/** A provider that exists in the settings table but has no adapter compiled in.
 *  Returned rather than thrown so the caller reports "no adapter for x" instead
 *  of a stack trace, and so a mis-set setting cannot take booking down. */
export class MissingProviderError extends Error {
  constructor(name: string) {
    super(`no adapter compiled for provider '${name}'`);
    this.name = 'MissingProviderError';
  }
}
