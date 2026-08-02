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

  // Three column sets, newest first. Each is a superset of the next, and load()
  // falls back down the list on error, so a page always renders whichever
  // migration the database has actually had applied. V2_COLS adds the authoring
  // surface (badge, colours, icon, copy, features, CTA, visibility, archive).
  var V2_COLS = 'plan_code, display_name, kind, amount_egp, currency, credits_granted, ' +
                'billing_cycle, period_days, device_limit, daily_limit, ' +
                'is_founder, is_best_value, active, sort_order, badge, badge_text, ' +
                'theme_color, accent_color, icon, short_description, full_description, ' +
                'features, cta_text, cta_href, visibility, archived_at';
  var V1_COLS = 'plan_code, display_name, kind, amount_egp, credits_granted, ' +
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

  // A feature is {text, included}. Anything else in the array is coerced rather
  // than dropped, so a hand-edited row still renders instead of vanishing.
  function normalizeFeatures(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(function (f) {
      if (f == null) return null;
      if (typeof f === 'string') return { text: f, included: true };
      return { text: String(f.text == null ? '' : f.text), included: f.included !== false };
    }).filter(function (f) { return f && f.text; });
  }

  function normalize(row) {
    return {
      plan_code:       row.plan_code,
      display_name:    row.display_name,
      kind:            row.kind || 'subscription',
      price_egp:       row.amount_egp == null ? null : Number(row.amount_egp),
      currency:        row.currency || 'EGP',
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
      sort_order:      row.sort_order == null ? 0 : Number(row.sort_order),

      // Authoring surface (v2). Every one of these is null/empty on a plan that
      // predates the authoring migration, and every consumer treats
      // null as "fall back to what the page already does" — which is why
      // applying v2 changes nothing about how the existing plans render.
      badge:             row.badge || 'none',
      badge_text:        row.badge_text || null,
      theme_color:       row.theme_color || null,
      accent_color:      row.accent_color || null,
      icon:              row.icon || null,
      short_description: row.short_description || null,
      full_description:  row.full_description || null,
      features:          normalizeFeatures(row.features),
      cta_text:          row.cta_text || null,
      cta_href:          row.cta_href || null,
      visibility:        row.visibility || 'public',
      archived_at:       row.archived_at || null
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

    // Walk the column sets newest-first. Each step is one round trip and only
    // happens when the previous one failed, so an up-to-date database pays for
    // exactly one query.
    var attempt = function (cols, rest) {
      return Promise.resolve(sb.from('plan_definitions').select(cols))
        .then(function (res) {
          if (res && !res.error && Array.isArray(res.data)) return res.data;
          return rest.length ? attempt(rest[0], rest.slice(1)) : null;
        })
        .catch(function () { return rest.length ? attempt(rest[0], rest.slice(1)) : null; });
    };

    _loadPromise = attempt(V2_COLS, [V1_COLS, LEGACY_COLS])
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

  // Default badge wording. `badge_text` on the row always wins — this is only
  // the label for a badge the owner selected without typing their own words.
  var BADGE_LABEL = {
    best_value:   'BEST VALUE',
    most_popular: 'MOST POPULAR',
    'new':        'NEW',
    limited:      'LIMITED'
  };

  // What the owner chose to show on the badge, or null for no badge. A 'custom'
  // badge with no text is no badge at all, not an empty pill.
  function badgeOf(codeOrPlan) {
    var p = (typeof codeOrPlan === 'string') ? get(codeOrPlan) : codeOrPlan;
    if (!p || !p.badge || p.badge === 'none') return null;
    var text = p.badge_text || BADGE_LABEL[p.badge] || null;
    return text ? { kind: p.badge, text: text } : null;
  }

  // How long one billing period lasts, in months. Drives "per month" maths on
  // pages that compare plans. Null when the cycle has no recurring period.
  function monthsIn(cycle) {
    return cycle === 'monthly' ? 1 : cycle === 'quarterly' ? 3
         : cycle === 'semiannual' ? 6 : cycle === 'annual' ? 12 : null;
  }

  var CYCLE_SUFFIX = {
    monthly:    '/ month',
    quarterly:  '/ 3 months',
    semiannual: '/ 6 months',
    annual:     '/ year'
  };

  // Days per period, as an explicit table rather than months x 30.44. The
  // approximation put semiannual at 183 while the dashboard form writes 182,
  // and two definitions that disagree by a day are still two definitions.
  // These are the same numbers the Create Plan form fills in.
  var CYCLE_DAYS = { monthly: 30, quarterly: 91, semiannual: 182, annual: 365 };

  // Length of one billing period in days. A plan's own period_days always wins
  // over the named cycle — a custom plan can be any length.
  function cycleDays(codeOrPlanOrCycle) {
    if (codeOrPlanOrCycle && typeof codeOrPlanOrCycle === 'object') {
      var authored = Number(codeOrPlanOrCycle.period_days);
      if (isFinite(authored) && authored > 0) return authored;
      return CYCLE_DAYS[codeOrPlanOrCycle.billing_cycle] || null;
    }
    var p = get(codeOrPlanOrCycle);
    if (p) return cycleDays(p);
    return CYCLE_DAYS[codeOrPlanOrCycle] || null;
  }

  // 'monthly' -> '/ month'. One-time, pack and custom cycles have no suffix,
  // because "1,299 EGP / one_time" is not a thing anyone wants to read.
  function periodLabel(codeOrPlan) {
    var p = (typeof codeOrPlan === 'string') ? get(codeOrPlan) : codeOrPlan;
    return (p && CYCLE_SUFFIX[p.billing_cycle]) || '';
  }

  // Currency-aware price. Intl gives the right symbol and grouping for whatever
  // the owner set, and falls back to "1,299 EGP" if the runtime does not know
  // the code. Note: the plan is QUOTED in its currency; settlement is a separate
  // concern the catalogue does not model.
  function formatPrice(codeOrPlan, opts) {
    var p = (typeof codeOrPlan === 'string') ? get(codeOrPlan) : codeOrPlan;
    if (!p || p.price_egp == null) return '';
    var cur = (p.currency || 'EGP').toUpperCase();
    var n = Number(p.price_egp);
    var digits = (opts && opts.decimals) || 0;
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency', currency: cur,
        minimumFractionDigits: digits, maximumFractionDigits: digits
      }).format(n);
    } catch (e) {
      return n.toLocaleString(undefined, { maximumFractionDigits: digits }) + ' ' + cur;
    }
  }

  // `opts` may be a boolean for backwards compatibility (true = everything).
  //   default          — what a student should see: live, public, on sale
  //   {all:true}       — everything the catalogue holds, archived included
  //   {archived:true}  — only archived plans
  function byKind(kind, opts) {
    if (!_rows) return [];
    if (opts === true) opts = { all: true };
    opts = opts || {};
    return _rows
      .filter(function (r) {
        if (r.kind !== kind) return false;
        if (opts.archived) return !!r.archived_at;
        if (opts.all) return true;
        return r.active && r.visibility === 'public' && !r.archived_at;
      })
      .sort(function (a, b) {
        return a.sort_order - b.sort_order || a.plan_code.localeCompare(b.plan_code);
      });
  }

  // Everything a profile can hold — every kind except 'pack'. A lifetime or
  // custom plan is a plan, so anything reasoning about "the plans on offer"
  // must include them or it will go stale the first time one is created.
  function planKinds() { return ['subscription', 'lifetime', 'custom']; }

  function acrossKinds(opts) {
    return planKinds()
      .reduce(function (acc, k) { return acc.concat(byKind(k, opts)); }, [])
      .sort(function (a, b) {
        return a.sort_order - b.sort_order || a.plan_code.localeCompare(b.plan_code);
      });
  }

  var api = {
    load:          load,
    isLoaded:      function () { return !!_rows; },
    all:           function (opts) {
                     if (!_rows) return [];
                     if (opts === true) opts = { all: true };
                     opts = opts || {};
                     if (opts.all) return _rows.slice();
                     if (opts.archived) return _rows.filter(function (r) { return !!r.archived_at; });
                     return _rows.filter(function (r) {
                       return r.active && r.visibility === 'public' && !r.archived_at;
                     });
                   },
    get:           get,
    name:          nameOf,
    price:         priceOf,
    credits:       creditsOf,
    // Plans (every non-pack kind) and packs. `subscriptions` keeps its name
    // because that is what every caller already says, but it now spans
    // subscription + lifetime + custom.
    subscriptions: acrossKinds,
    plans:         acrossKinds,
    packs:         function (opts) { return byKind('pack', opts); },
    ofKind:        byKind,
    planKinds:     planKinds,
    codes:         function (kind, opts) {
                     var rows = (kind === 'subscription' || kind === 'plan')
                       ? acrossKinds(opts) : byKind(kind, opts);
                     return rows.map(function (r) { return r.plan_code; });
                   },
    // Presentation, all read from the row.
    badge:         badgeOf,
    features:      function (code) { var p = get(code); return p ? p.features : []; },
    periodLabel:   periodLabel,
    formatPrice:   formatPrice,
    monthsIn:      monthsIn,
    cycleDays:     cycleDays,
    CYCLE_DAYS:    CYCLE_DAYS,
    icon:          function (code) { var p = get(code); return (p && p.icon) || null; },
    themeColor:    function (code) { var p = get(code); return (p && p.theme_color) || null; },
    accentColor:   function (code) { var p = get(code); return (p && p.accent_color) || null; },
    ctaText:       function (code) { var p = get(code); return (p && p.cta_text) || null; },
    ctaHref:       function (code) { var p = get(code); return (p && p.cta_href) || null; },
    humanize:      humanize,
    BADGE_LABEL:   BADGE_LABEL
  };

  global.PlanCatalog = api;
})(typeof window !== 'undefined' ? window : this);
