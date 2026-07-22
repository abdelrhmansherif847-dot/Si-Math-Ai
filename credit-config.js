/* ===========================================================================
 * credit-config.js — Zero AI centralized credit configuration (client)
 * ===========================================================================
 * The single source of truth for per-operation credit costs is the database
 * table public.credit_costs (seeded by
 * supabase/migrations/20260722_credits_operation_based_v1.sql). Pages MUST
 * resolve costs and charge operations through this module — never hardcode a
 * credit number or a raw feature name inside a page. Changing a value in
 * credit_costs (or the Owner → Credits Management dashboard) then updates the
 * entire platform with no code change.
 *
 * Usage:
 *   await CreditConfig.load(sb);                 // once, at page init
 *   const res = await CreditConfig.charge(sb, {  // per AI operation
 *     userId, op: 'chat_image', sessionId, model: 'claude-3-5-haiku'
 *   });
 *   if (!res.ok) { ...show upsell by res.reason... }
 *   const price = CreditConfig.cost('mock_exam'); // for UI copy
 *
 * Future AI features (Truth Engine, Teacher AI, Essay Review, OCR Premium, …)
 * register a new row in credit_costs + an entry in OP_FEATURE below — no
 * page-specific billing logic required (RFC "Future Expandability").
 * ===========================================================================*/
(function (global) {
  'use strict';

  // RFC operation id → canonical DB feature_name.
  var OP_FEATURE = {
    chat_text:         'CHAT_TEXT',
    chat_image:        'CHAT_IMAGE',
    chat_followup:     'CHAT_FOLLOWUP',
    chat_deep_explain: 'CHAT_DEEP_EXPLAIN',
    study_plan:        'STUDY_PLAN',
    mock_exam:         'MOCK_EXAM',
    mock_timer:        'MOCK_TIMER',
    mock_practice:     'MOCK_PRACTICE',
    focus_session:     'FOCUS_SESSION',
    weakness_analysis: 'WEAKNESS_ANALYSIS'
  };

  // Static RFC costs — a display/last-resort fallback used only before the live
  // config has loaded (or if the network read fails). Once load() completes the
  // DB is always authoritative. Keep in sync with the migration.
  var DEFAULT_COST = {
    CHAT_TEXT: 5, CHAT_IMAGE: 8, CHAT_FOLLOWUP: 2, CHAT_DEEP_EXPLAIN: 10,
    STUDY_PLAN: 20, MOCK_EXAM: 40, MOCK_TIMER: 10, MOCK_PRACTICE: 10,
    FOCUS_SESSION: 15, WEAKNESS_ANALYSIS: 20, AI_CHAT_MESSAGE: 5
  };

  // Back-compat safety net. Until the operation-based migration is live the
  // granular chat features do not exist server-side, so consume_credits would
  // return feature_not_found and BLOCK the student. If a chat feature is missing
  // or inactive in the loaded config, fall back to the legacy flat feature that
  // is guaranteed to exist (AI_CHAT_MESSAGE). This makes the frontend safe to
  // ship before the migration is applied.
  var LEGACY_FALLBACK = {
    CHAT_TEXT:         'AI_CHAT_MESSAGE',
    CHAT_IMAGE:        'AI_CHAT_MESSAGE',
    CHAT_FOLLOWUP:     'AI_CHAT_MESSAGE',
    CHAT_DEEP_EXPLAIN: 'AI_CHAT_MESSAGE'
  };

  var _byFeature   = null;  // feature_name -> { credit_cost, active, always_charge }
  var _loadPromise = null;

  // Accept both RFC ids ('chat_text') and raw feature names ('CHAT_TEXT').
  function canonical(op) {
    if (!op) return null;
    if (OP_FEATURE[op]) return OP_FEATURE[op];
    return /^[A-Z0-9_]+$/.test(op) ? op : null;
  }

  // Resolve to a feature_name that actually exists + is active in the loaded
  // config, applying the legacy fallback when necessary.
  //   • config loaded, feature active            → the feature itself
  //   • config loaded, feature missing/inactive  → its legacy fallback if active
  //     (this is the pre-migration state), else the canonical name
  //   • config NOT loaded (unread / RLS-blocked) → prefer a legacy fallback so a
  //     student is never blocked by a not-yet-migrated feature; server enforces.
  function resolveFeature(op) {
    var feat = canonical(op);
    if (!feat) return null;
    if (_byFeature) {
      var row = _byFeature[feat];
      if (row && row.active) return feat;
      var fb = LEGACY_FALLBACK[feat];
      if (fb && _byFeature[fb] && _byFeature[fb].active) return fb;
      return feat;
    }
    return LEGACY_FALLBACK[feat] || feat;
  }

  function costOf(op) {
    var feat = canonical(op);
    if (!feat) return null;
    if (_byFeature && _byFeature[feat]) return _byFeature[feat].credit_cost;
    return (feat in DEFAULT_COST) ? DEFAULT_COST[feat] : null;
  }

  function alwaysCharge(op) {
    var feat = canonical(op);
    if (feat && _byFeature && _byFeature[feat]) return !!_byFeature[feat].always_charge;
    return false;
  }

  // Load the live cost catalogue once. Resolves to the module API for chaining.
  // Never rejects — on any error it resolves with static defaults so callers
  // keep working.
  function load(sb, opts) {
    if (_loadPromise && !(opts && opts.force)) return _loadPromise;
    if (!sb || !sb.from) { _loadPromise = Promise.resolve(api); return _loadPromise; }
    _loadPromise = Promise.resolve(
      sb.from('credit_costs').select('feature_name, credit_cost, active, always_charge')
    ).then(function (res) {
      if (res && !res.error && Array.isArray(res.data)) {
        var map = {};
        res.data.forEach(function (r) {
          map[r.feature_name] = {
            credit_cost:   r.credit_cost,
            active:        r.active !== false,
            always_charge: !!r.always_charge
          };
        });
        _byFeature = map;
      }
      return api;
    }).catch(function () { return api; });
    return _loadPromise;
  }

  // Charge one operation via the consume_credits RPC. Always resolves against
  // the loaded config first (kicking off a load if needed) so the feature name
  // is correct and the student is never blocked by a not-yet-migrated feature.
  // Returns the RPC's jsonb result ({ ok, credits_used, balance_after, reason,
  // subscription_credits, pack_credits, ... }) or a synthesized error object.
  function charge(sb, args) {
    args = args || {};
    if (!sb || !sb.rpc) return Promise.resolve({ ok: false, reason: 'no_client' });

    var run = function () {
      var feat = resolveFeature(args.op);
      if (!feat) return { ok: false, reason: 'unknown_operation' };
      return Promise.resolve(sb.rpc('consume_credits', {
        p_user_id:    args.userId || null,
        p_feature:    feat,
        p_model_name: args.model || null,
        p_prompt_tok: args.promptTokens || 0,
        p_comp_tok:   args.completionTokens || 0,
        p_cost_usd:   args.costUsd || 0,
        p_session_id: args.sessionId || null
      })).then(function (res) {
        if (res && res.error) return { ok: false, reason: 'rpc_error', error: res.error };
        return (res && res.data) || { ok: false, reason: 'no_result' };
      }).catch(function (e) {
        return { ok: false, reason: 'rpc_error', error: e };
      });
    };

    return (_loadPromise || load(sb)).then(run);
  }

  var api = {
    OP_FEATURE:   OP_FEATURE,
    DEFAULT_COST: DEFAULT_COST,
    load:         load,
    cost:         costOf,
    alwaysCharge: alwaysCharge,
    feature:      resolveFeature,
    charge:       charge,
    isLoaded:     function () { return !!_byFeature; }
  };

  global.CreditConfig = api;
})(typeof window !== 'undefined' ? window : this);
