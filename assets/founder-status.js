/* founder-status.js — the ONE place the Founder Badge scarcity number lives.
 *
 * Why this file exists
 * ────────────────────
 * The remaining-membership count is a factual claim that appears in prose, in
 * JSON-LD, in llms.txt, and on screen. When a number like that is retyped in
 * six places it drifts, and a drifted number in the knowledge layer is worse
 * than no number at all: AI search engines ingest whichever copy they crawled
 * and then repeat a figure the site itself contradicts.
 *
 * So: edit FOUNDER_SLOTS_REMAINING here and nowhere else, then run
 *   node scripts/validate-knowledge-layer.mjs
 * which fails the build if any page's static text disagrees with this constant.
 *
 * Note on pricing.html
 * ────────────────────
 * pricing.html renders its Founder card from the database
 * (system_settings.founder_slots_remaining) because it is a live commerce
 * surface. This constant must be kept equal to that row. The validator cannot
 * reach the database, so that half is a human check — see
 * docs/knowledge/consistency-audit.md, finding C-4.
 *
 * The knowledge pages deliberately do NOT fetch the live value at runtime. A
 * crawler reads the static HTML and an AI system quotes it; if JavaScript then
 * swapped in a different number, the page would state one figure to machines
 * and another to humans. Static and visible must agree, so the static number
 * wins and this constant is what keeps it honest.
 */
(function (root) {
  'use strict';

  /** Founder Badge memberships still available. Edit here only.
   *  0 = sold out. The knowledge layer must then state closure rather than a
   *  count; validate-knowledge-layer.mjs enforces which form is required. */
  var FOUNDER_SLOTS_REMAINING = 0;

  /** Lifetime discount, in percent, applied to the Founder Badge price. */
  var FOUNDER_DISCOUNT_PERCENT = 50;

  /**
   * Paint the count into any element carrying data-founder-slots, and pluralise
   * any element carrying data-founder-slots-word ("membership"/"memberships").
   *
   * The static HTML already contains the correct number — this only guarantees
   * that a page which forgot to update its markup cannot silently show a stale
   * one. It never introduces a value the static HTML did not already claim,
   * because the validator has proven they match before the page ships.
   */
  function paint(doc) {
    var d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d) return;
    var n = FOUNDER_SLOTS_REMAINING;
    var nodes = d.querySelectorAll('[data-founder-slots]');
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = String(n);
    var words = d.querySelectorAll('[data-founder-slots-word]');
    for (var j = 0; j < words.length; j++) words[j].textContent = n === 1 ? 'membership' : 'memberships';
  }

  root.SiFounder = {
    FOUNDER_SLOTS_REMAINING: FOUNDER_SLOTS_REMAINING,
    FOUNDER_DISCOUNT_PERCENT: FOUNDER_DISCOUNT_PERCENT,
    paint: paint,
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { paint(document); });
    } else {
      paint(document);
    }
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
