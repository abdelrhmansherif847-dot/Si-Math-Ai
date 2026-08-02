// ═══════════════════════════════════════════════════════════════════════════
// _shared/telemetry.core.ts — AI model-call telemetry
// ═══════════════════════════════════════════════════════════════════════════
// EXTRACTED VERBATIM from ai-tutor/index.ts by V1-T16. Pure refactor: no
// behavioural change, no policy change, no logging change, no threshold change.
//
// It lives here rather than inside verification.core.ts because it is NOT
// verification logic — the OCR pass, the vision question-detector and the
// difficulty detector all record calls through it too. Extracting the pipeline
// required its dependencies to be importable; giving telemetry its own module
// was the alternative to either inventing an injection mechanism or filing
// generic telemetry under "verification".
//
// Behaviour is proven unchanged by tests/verification-core-parity.test.mjs
// against tests/fixtures/v1-t16-golden.json.

// Structural type for the Supabase service-role client. Declared locally rather
// than imported, so this module carries no https: specifier and the Node test
// suites can execute exactly the bytes Deno runs. Types are erased at runtime,
// so this is not a behavioural difference — it is the only edit made to any
// moved line, and it is type-only.
export type SupabaseAdminClient = { from(table: string): any };

// ═══════════════════════════════════════════════════════════════════════════
// AI MODEL-CALL TELEMETRY (v90 — AI Economics Phase 3)
// ═══════════════════════════════════════════════════════════════════════════
// One row per upstream provider call, describing WHAT capability did the work
// (canonical service_code from the Phase 2 AI Service Catalog) and WHAT it
// consumed (usage in units). Deliberately records no money: pricing is the Cost
// Engine's job (Phase 4), and a cost stamped here would be an unversioned
// pricing formula living in the service layer.
//
// Nothing in this block may throw into a tutoring path. Every entry point is
// wrapped; a telemetry failure logs one line and is swallowed.
//
// Kill switch: AI_MODEL_TELEMETRY_ENABLED=false stops all recording and
// flushing with no redeploy. Default is on.
export const MODEL_TELEMETRY_ENABLED =
  (Deno.env.get('AI_MODEL_TELEMETRY_ENABLED') ?? 'true') !== 'false';

export interface ModelCallRow {
  call_uid:          string;   // F1 — per-call identity; makes the write idempotent
  started_at:        string;   // F2 — the economic clock (created_at is the write clock)
  service_code:      string;
  stage:             string;
  provider:          string;
  model:             string;
  api_surface:       string;
  units:             Record<string, number>;
  prompt_tokens:     number;
  completion_tokens: number;
  success:           boolean;
  http_status:       number | null;
  error_code:        string | null;
  latency_ms:        number;
  meta:              Record<string, unknown> | null;
}

// Buffer one call. `sink` is request-scoped, so concurrent requests never share
// state. Never awaits, never throws, never touches the network.
//
// Token decomposition: OpenAI's `usage.prompt_tokens` INCLUDES the cached
// prefix, and `prompt_tokens_details.cached_tokens` is the subset billed at the
// cheaper cached rate. Units split them so a rate card can price each
// separately: input_token + cached_input_token === prompt_tokens. The
// prompt_tokens column keeps the provider's raw figure as a convenience mirror.
export function recordModelCall(
  sink: ModelCallRow[] | undefined,
  args: {
    service_code: string;
    stage:        string;
    model:        string;
    started:      number;
    res?:         { ok: boolean; status: number } | null;
    json?:        unknown;
    err?:         unknown;
    meta?:        Record<string, unknown>;
    // F6: the implementation axis is parameterised, not hardcoded. Adding a
    // second provider is then a call-site argument, never an edit to this
    // function — which is what INV-12 ("a provider change is a data change")
    // promises. Defaults keep every existing call site unchanged.
    provider?:    string;
    api_surface?: string;
  },
): void {
  if (!sink || !MODEL_TELEMETRY_ENABLED) return;
  try {
    const j = (args.json ?? null) as
      { usage?: Record<string, unknown>; error?: { code?: string } } | null;
    const u = (j?.usage ?? {}) as Record<string, unknown>;
    const prompt_tokens     = Number(u.prompt_tokens     ?? 0) || 0;
    const completion_tokens = Number(u.completion_tokens ?? 0) || 0;
    const cached = Number(
      (u.prompt_tokens_details as Record<string, unknown> | undefined)?.cached_tokens ?? 0,
    ) || 0;
    const uncached = Math.max(0, prompt_tokens - cached);

    const units: Record<string, number> = {};
    if (uncached)          units.input_token        = uncached;
    if (cached)            units.cached_input_token = cached;
    if (completion_tokens) units.output_token       = completion_tokens;

    const ok = !!args.res?.ok && !args.err;
    sink.push({
      call_uid:          crypto.randomUUID(),
      started_at:        new Date(args.started).toISOString(),
      service_code:      args.service_code,
      stage:             args.stage,
      provider:          args.provider    ?? 'openai',
      model:             args.model,
      api_surface:       args.api_surface ?? 'default',
      units,
      prompt_tokens,
      completion_tokens,
      success:           ok,
      http_status:       args.res ? args.res.status : null,
      error_code:        args.err ? 'fetch_failed'
                       : ok       ? null
                       : String(j?.error?.code ?? 'no_content'),
      latency_ms:        Date.now() - args.started,
      meta:              args.meta ?? null,
    });
  } catch { /* telemetry must never affect tutoring */ }
}

// Write the buffered rows. Called from a `finally` on the main path and at the
// end of each background task, always inside a context the student is not
// waiting on. Drains the sink first, so a double flush cannot duplicate rows.
//
// The write is IDEMPOTENT (F1): every row carries a call_uid minted when the
// call was observed, and the insert is ON CONFLICT DO NOTHING against the
// unique index on that column. Two consequences, both required for this table
// to be a financial source of truth:
//   • A retry is safe. A flush that fails after partially committing can be
//     re-attempted; Postgres discards the rows that already landed and accepts
//     only the missing ones. Before F1 a failed write was permanently lost,
//     because retrying would have risked double-counting real spend.
//   • A duplicate is impossible at the database level, not merely improbable
//     because the code never retries.
export async function flushModelCalls(
  sbAdmin: SupabaseAdminClient,
  sink: ModelCallRow[],
  ctx: {
    requestId:          string;
    clientRequestId?:   string | null;
    questionRecordId?:  string | null;
    sessionId?:         string | null;
    userId?:            string | null;
    operation?:         string | null;
  },
): Promise<void> {
  if (!MODEL_TELEMETRY_ENABLED || !sink.length) return;
  const rows = sink.splice(0, sink.length).map((r) => ({
    ...r,
    request_id:         ctx.requestId,
    client_request_id:  ctx.clientRequestId ?? null,   // F3 — on every row
    question_record_id: ctx.questionRecordId ?? null,
    session_id:         ctx.sessionId ?? null,
    user_id:            ctx.userId ?? null,
    operation:          ctx.operation ?? null,
  }));

  // One retry. Bounded on purpose: this runs off the response path, but an
  // unbounded loop in a background task is its own hazard. A single retry
  // covers the transient failure (a dropped connection, a brief pool
  // exhaustion) that accounts for most loss; anything that fails twice is a
  // real outage and is reported rather than papered over.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { error } = await sbAdmin
        .from('ai_model_calls')
        .upsert(rows, { onConflict: 'call_uid', ignoreDuplicates: true });
      if (!error) return;
      console.log('[ai-tutor] model-call-telemetry-error', JSON.stringify({
        req: ctx.requestId.slice(0, 8), rows: rows.length, attempt, msg: error.message,
      }));
    } catch (e) {
      console.log('[ai-tutor] model-call-telemetry-error', JSON.stringify({
        req: ctx.requestId.slice(0, 8), rows: rows.length, attempt,
        msg: e instanceof Error ? e.message : String(e),
      }));
    }
    if (attempt === 1) await new Promise((r) => setTimeout(r, 250));
  }
  console.log('[ai-tutor] model-call-telemetry-lost', JSON.stringify({
    req: ctx.requestId.slice(0, 8), rows: rows.length,
  }));
}

