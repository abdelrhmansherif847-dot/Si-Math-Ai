// Exam countdown — the single source of truth for "days until the exam".
//
// Why this file exists: the countdown was implemented four separate times
// (dashboard, progress, focus, ai-tutor) and all four disagreed. The dashboard
// told a student "1 day" on the morning of their exam; Zero told the same
// student "0"; the Progress page's answer changed depending on the time of day.
//
// The bug in every client copy was the same. `exam_date` is a Postgres DATE, so
// it arrives as 'YYYY-MM-DD', and `new Date('YYYY-MM-DD')` parses that as
// **UTC midnight** — not local midnight. Subtracting a UTC-midnight instant
// from a local midnight (or from Date.now()) leaves a residue of the UTC
// offset, and Math.ceil rounds that partial day up to a whole extra day. In
// Cairo (UTC+2/+3) the dashboard was therefore off by exactly +1, always.
//
// The fix is to never parse the date as an instant at all. Both sides are
// reduced to a calendar day key and compared as date-only values, which is
// exact, DST-proof, and independent of the device timezone.
//
// Day boundaries are pinned to Africa/Cairo, matching assets/streak.js — the
// product's audience is Egyptian, and a student on a VPN should not see a
// different countdown than the same student at home.
(function () {
  var EXAM_TZ = 'Africa/Cairo';

  // 'YYYY-MM-DD' for the given instant, in Cairo local time.
  function cairoDayKey(d) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: EXAM_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d);
  }

  // A date-only key → the UTC-midnight epoch for that calendar day. Both
  // operands go through this, so the subtraction is an exact multiple of a day.
  function keyToEpoch(key) {
    var p = key.split('-');
    return Date.UTC(+p[0], +p[1] - 1, +p[2]);
  }

  // Whole days from today (Cairo) until the exam date.
  //   > 0  exam is in the future
  //     0  exam is TODAY
  //   < 0  exam has passed
  //  null  no/invalid date
  //
  // Accepts a bare 'YYYY-MM-DD' (the DATE column) or any ISO timestamp string;
  // the leading 10 characters are the calendar day either way.
  window.examDaysRemaining = function (examDate, nowOverride) {
    if (!examDate) return null;
    var key = String(examDate).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
    var today = cairoDayKey(nowOverride instanceof Date ? nowOverride : new Date());
    return Math.round((keyToEpoch(key) - keyToEpoch(today)) / 86400000);
  };

  // Convenience for display: never negative, so a passed exam reads as 0.
  window.examDaysRemainingClamped = function (examDate, nowOverride) {
    var d = window.examDaysRemaining(examDate, nowOverride);
    return d == null ? null : Math.max(0, d);
  };
}());
