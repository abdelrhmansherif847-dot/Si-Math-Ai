// Rank ladder — the single client source of truth for XP → rank.
//
// The same seven-rank table was authored four separate times (chat.html,
// mock-exam.html, progress.html, profile.html) alongside the SQL rank_for_xp().
// They happened to agree, but nothing enforced it: a price-style edit to one
// copy would have shown a student a different rank on different pages.
//
// mock-exam.html still carries its own copy because that file is FROZEN. It is
// held in line by tests/constants-drift.test.mjs, which fails if any copy —
// including the SQL function — diverges from this table. Fold it in when the
// freeze lifts.
//
// Thresholds and names must stay identical to public.rank_for_xp()
// (supabase/migrations/20260624_focus_xp.sql), which is authoritative for
// server-side writes.
(function (root) {
  'use strict';

  // Ascending by `min`. `bg` is only consumed by profile.html; other pages
  // ignore it, which is why one shared table can serve all callers.
  var RANKS = [
    { name: 'Beginner',      min: 0,    color: '#7a90b2', bg: 'rgba(122,144,178,.15)', icon: '🌱' },
    { name: 'Learner',       min: 100,  color: '#60a5fa', bg: 'rgba(96,165,250,.15)',  icon: '📘' },
    { name: 'Solver',        min: 300,  color: '#a78bfa', bg: 'rgba(167,139,250,.15)', icon: '🔧' },
    { name: 'Scholar',       min: 600,  color: '#4ade80', bg: 'rgba(74,222,128,.15)',  icon: '🎓' },
    { name: 'Expert',        min: 1000, color: '#f59e0b', bg: 'rgba(245,158,11,.15)',  icon: '⭐' },
    { name: 'Master',        min: 1500, color: '#f97316', bg: 'rgba(249,115,22,.15)',  icon: '🏆' },
    { name: 'Elite Scholar', min: 2500, color: '#f59e0b', bg: 'rgba(245,158,11,.2)',   icon: '👑' },
  ];

  /** The rank a given XP total sits in. Never null — floors at Beginner. */
  function forXp(xp) {
    var r = RANKS[0];
    for (var i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].min) r = RANKS[i];
    return r;
  }

  /** The next rank up, or null at the top of the ladder. */
  function nextForXp(xp) {
    for (var i = 0; i < RANKS.length; i++) if (xp < RANKS[i].min) return RANKS[i];
    return null;
  }

  /** Just the name — what gets written to profiles.rank_name. */
  function nameForXp(xp) {
    return forXp(xp).name;
  }

  root.SiRanks = {
    RANKS: RANKS,
    forXp: forXp,
    nextForXp: nextForXp,
    nameForXp: nameForXp,
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
