/* ===========================================================================
 * plan-catalog.js — Zero AI centralized plan/pack catalogue (client)
 * ===========================================================================
 * The single source of truth for what a plan is called, what it costs and how
 * many credits it grants is the database table public.plan_definitions
 * (consolidated by supabase/migrations/20260802_plan_catalog_single_source.sql,
 * which also turned pricing_settings and credit_packs into views over it).
 * Pages MUST resolve those three facts through this module — never hardcode a
 * plan name, a price, or a credit grant inside a page. Editing a plan in the
 * Owner → Plans & Packs dashboard then updates the entire platform (pricing
 * page, checkout, subscriptions, settings, profile, admin) with no code change.
 *
 * This is the plan-level twin of credit-config.js, which does the same job for
 * per-operation credit costs, and it follows the same three rules:
 *   1. the DB is authoritative once loaded,
 *   2. a failed read degrades, it never blocks,
 *   3. nothing in this file is a second copy of a value that lives in the DB.
 *
 * Rule 3 is why there is no fallback name table here. When the catalogue has
 * not loaded, a name is DERIVED from the plan_code ('PRO_MONTHLY' → 'Pro
 * Monthly') rather than looked up in a hardcoded map. A derivation cannot
 * drift from the database, because it holds no data of its own.
 *
 * Usage:
 *   await PlanCatalog.load(sb);              // once, at page init
 *   PlanCatalog.name('PRO_MONTHLY');         // 'Pro Monthly'
 *   PlanCatalog.price('PRO_MONTHLY');        // 349
 *   PlanCatalog.credits('PACK_VALUE');       // 1000
 *   PlanCatalog.subscriptions();             // active subs, sort_order asc
 *   PlanCatalog.packs();                     // active packs, sort_order asc
 *
 * A new plan added to plan_definitions appears everywhere automatically — no
 * page-specific catalogue to update.
 * ===========================================================================*/
(function (global) {
  'use strict';

  // Full column set. `billing_cycle` and its neighbours only exist after the
  // consolidation migration; LEGACY_COLS is what plan_definitions carried
  // before it, so a page shipped ahead of the migration still renders.
  var FULL_COLS = 'plan_code, display_name, kind, amount_egp, credits_granted, ' +
                  'billing_cycle, period_days, device_limit, daily_limit, ' +
                  'is_founder, is_best_value, active, sort_order';
  var LEGACY_COLS = 'plan_code, display_name, kind, amount_egp, credits_granted, period_days';

  var _rows        = null;   // array of catalogue rows, DB order
  var _byCode      = null;   // plan_code -> row
  var _loadPromise = null;

  // 'PRO_MONTHLY' → 'Pro Monthly'. A last-resort label for the window before
  // the catalogue loads, or if the read fails. Derived, never stored — so it
  // cannot disagree with the database the way a hardcoded map would.
  function humanize(code) {
    if (!code) return '';
    return String(code).toLowerCase().split(/[_\s-]+/)
      .filter(Boolean)
      .map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); })
      .join(' ');
  }

  function normalize(row) {
    return {
      plan_code:       row.plan_code,
      display_name:    row.display_name,
      kind:            row.kind || 'subscription',
      price_egp:       row.amount_egp == null ? null : Number(row.amount_egp),
      credits_granted: row.credits_granted == null ? null : Number(row.credits_granted),
      billing_cycle:   row.billing_cycle || null,
      period_days:     row.period_days == null ? null : Number(row.period_days),
      device_limit:    row.device_limit == null ? null : Number(row.device_limit),
      daily_limit:     row.daily_limit == null ? null : Number(row.daily_limit),
      is_founder:      !!row.is_founder,
      is_best_value:   !!row.is_best_value,
      // Pre-migration rows have no `active` column. Treating them as active is
      // the safe default: it shows a plan that might be retired rather than
      // hiding one that is on sale.
      active:          row.active === undefined ? true : row.active !== false,
      sort_order:      row.sort_order == null ? 0 : Number(row.sort_order)
    };
  }

  function ingest(data) {
    _rows = (data || []).map(normalize);
    _byCode = {};
    _rows.forEach(function (r) { _byCode[r.plan_code] = r; });
  }

  // Load the live catalogue once. Resolves to the module API for chaining.
  // Never rejects — on any error it resolves unloaded so callers keep working
  // against derived names and their own local data.
  function load(sb, opts) {
    if (_loadPromise && !(opts && opts.force)) return _loadPromise;
    if (!sb || !sb.from) { _loadPromise = Promise.resolve(api); return _loadPromise; }

    _loadPromise = Promise.resolve(sb.from('plan_definitions').select(FULL_COLS))
      .then(function (res) {
        if (res && !res.error && Array.isArray(res.data)) return res.data;
        // Pre-migration schema: retry with the columns that definitely exist.
        return Promise.resolve(sb.from('plan_definitions').select(LEGACY_COLS))
          .then(function (r2) {
            return (r2 && !r2.error && Array.isArray(r2.data)) ? r2.data : null;
          });
      })
      .then(function (data) { if (data) ingest(data); return api; })
      .catch(function () { return api; });

    return _loadPromise;
  }

  function get(code) {
    if (!code || !_byCode) return null;
    return _byCode[code] || null;
  }

  function nameOf(code) {
    var row = get(code);
    return (row && row.display_name) || humanize(code);
  }

  function priceOf(code) {
    var row = get(code);
    return row ? row.price_egp : null;
  }

  function creditsOf(code) {
    var row = get(code);
    return row ? row.credits_granted : null;
  }

  function byKind(kind, includeInactive) {
    if (!_rows) return [];
    return _rows
      .filter(function (r) { return r.kind === kind && (includeInactive || r.active); })
      .sort(function (a, b) {
        return a.sort_order - b.sort_order || a.plan_code.localeCompare(b.plan_code);
      });
  }

  var api = {
    load:          load,
    isLoaded:      function () { return !!_rows; },
    all:           function (includeInactive) {
                     if (!_rows) return [];
                     return includeInactive ? _rows.slice() : _rows.filter(function (r) { return r.active; });
                   },
    get:           get,
    name:          nameOf,
    price:         priceOf,
    credits:       creditsOf,
    subscriptions: function (includeInactive) { return byKind('subscription', includeInactive); },
    packs:         function (includeInactive) { return byKind('pack', includeInactive); },
    codes:         function (kind, includeInactive) {
                     return byKind(kind, includeInactive).map(function (r) { return r.plan_code; });
                   },
    humanize:      humanize
  };

  global.PlanCatalog = api;
})(typeof window !== 'undefined' ? window : this);
