// xp-updater.js — D3 Focus Practice XP.
//
// Fully independent of mastery (D2): this module writes ONLY profiles.xp, via
// the atomic, idempotent award_focus_xp RPC. It never reads or writes
// mastery_records. Every award is guarded once-only by the focus_xp_log ledger
// (PK user_id,event_key) inside the RPC, so reloads / double-clicks / multiple
// tabs can never produce extra XP.
//
// Exposed as window.XpEngine. Call sites live in focus.html OUTSIDE the
// d1UserEligible() gate — Focus XP is awarded to ALL users (FREE + paid),
// matching chat (+5) and mock-exam (+50/+25) XP which are likewise ungated.
(function () {
  'use strict';

  // Approved XP table, indexed by tier (round) 1..7.
  //   tier:  1 Foundation  2 Advanced  3 Mastery
  //          4 Elite I     5 Elite II  6 Elite III   7 Legend
  var XP_TASK  = { 1: 6,  2: 8,  3: 10, 4: 13, 5: 15, 6: 18, 7: 22  };
  var XP_DAY   = { 1: 15, 2: 20, 3: 25, 4: 32, 5: 38, 6: 45, 7: 55  };
  var XP_ROUND = { 1: 60, 2: 80, 3: 100,4: 130,5: 155,6: 185,7: 225 };
  var XP_LEGEND_BONUS = 300;          // flat, on the round-7 clear
  var LEGEND_TIER = 7;

  function tierOk(t) { return t >= 1 && t <= 7; }

  // Low-level: call the RPC and normalise its single-row table result.
  // Returns { new_xp, new_rank, awarded, delta } or null on any failure.
  async function _award(sb, planId, eventKey, delta) {
    if (!sb || !eventKey || !(delta > 0)) return null;
    try {
      var res = await sb.rpc('award_focus_xp', {
        p_plan: planId || null, p_event_key: eventKey, p_delta: delta
      });
      if (res && res.error) {
        console.warn('[D3] award_focus_xp error (tolerated):', res.error.message);
        return null;
      }
      var row = (res && res.data && res.data[0]) ? res.data[0] : null;
      if (!row) return null;
      return {
        new_xp:   row.new_xp,
        new_rank: row.new_rank,
        awarded:  !!row.awarded,
        delta:    delta
      };
    } catch (e) {
      console.warn('[D3] award_focus_xp threw (tolerated):', (e && e.message) || e);
      return null;
    }
  }

  window.XpEngine = {
    XP_TASK: XP_TASK, XP_DAY: XP_DAY, XP_ROUND: XP_ROUND,
    XP_LEGEND_BONUS: XP_LEGEND_BONUS,

    // Task complete — event_key task:<taskId>. taskId makes it globally unique.
    onFocusTaskXp: function (sb, planId, taskId, tier) {
      if (!taskId || !tierOk(tier)) return Promise.resolve(null);
      return _award(sb, planId, 'task:' + taskId, XP_TASK[tier]);
    },

    // Day clear (all 3 tasks of a (round,day) done) — day:<plan>:<round>:<day>.
    onFocusDayXp: function (sb, planId, tier, day) {
      if (!planId || !tierOk(tier) || !(day >= 1 && day <= 3)) return Promise.resolve(null);
      return _award(sb, planId, 'day:' + planId + ':' + tier + ':' + day, XP_DAY[tier]);
    },

    // Round clear — round:<plan>:<round>.
    onFocusRoundXp: function (sb, planId, tier) {
      if (!planId || !tierOk(tier)) return Promise.resolve(null);
      return _award(sb, planId, 'round:' + planId + ':' + tier, XP_ROUND[tier]);
    },

    // Legend completion bonus — legend:<plan>, once per plan, only at tier 7.
    onLegendComplete: function (sb, planId, tier) {
      if (!planId || tier !== LEGEND_TIER) return Promise.resolve(null);
      return _award(sb, planId, 'legend:' + planId, XP_LEGEND_BONUS);
    }
  };
})();
