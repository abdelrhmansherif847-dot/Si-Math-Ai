// Exam ambience — a TEST VERSION, to hear whether the idea is any good.
//
// EVERY SOUND HERE IS A RECORDING. Seven of them, made by the owner and
// processed from the originals, and nothing else: the synthesised pen and paper
// that stood in while there were no recordings are gone (2026-08-30, on
// instruction). They were never meant to survive real audio — filtered noise is
// what a nib and a sheet of paper sound like, which made them an honest
// placeholder, but a placeholder is all they were.
//
// Removing them removed the whole synthesis half of this file: no AudioContext
// buffer generation, no envelopes, no random texture timer. What is left is a
// clip loader and a schedule.
//
// AUDIO OBSERVES; IT NEVER DRIVES — the rule exam-audio.js already sets. Nothing
// here touches the timer, the view, saving or scoring. Every entry point
// catches. A browser that blocks the context produces silence, and silence is a
// working exam.
(function (root) {
  'use strict';

  var ctx = null, master = null, on = false;

  /* THE LAYER GAIN, AND WHY IT COULD NOT SIMPLY BE RAISED.
     The clips were normalised to a common -6 dBFS PEAK, and the comment that
     used to sit here said that made one number mean the same thing for all
     seven. It does not, and measuring is what showed it: peaks were within
     0.7 dB of each other while the loudest 100 ms of each clip — which is what
     a listener actually hears — spanned 16.8 dB, from -16.7 dBFS on voice-5 to
     -33.5 dBFS on voice-3.

     A whisper is why. Peak-normalising sets the level from the plosives, and a
     whispered plosive is a spike far above the body of the phrase; the quieter
     the recording, the wider that gap. voice-3's crest factor is 27.3 dB
     against voice-5's 10.4 dB, so peak-matching them left voice-3's whisper
     17 dB down. At the old gain it played at -45.7 dBFS: present in the graph,
     inaudible in a room.

     So raising ONE number could not make all seven louder. The fix is TRIM
     below — a per-clip level that matches them by loudness — and only then is
     a single gain meaningful. This is now unity because the trims land the
     group exactly where it should sit; the level lives in one place instead of
     being split across three. */
  var GAIN = { voices: 1.0 };

  /* THE VOICE SCHEDULE: A CHAIN, PLUS FIXED POINTS IN EVERY MODULE.

     THE GAP IS MEASURED FROM THE END OF ONE SOUND TO THE START OF THE NEXT.
     It used to be measured from start to start, on an absolute grid, and the
     grid was the thing the schedule was built to protect: a table that could
     be printed and would be exactly what happened. That is now the SECOND
     priority. A recording plays whole, and the clock moves to accommodate it.

     WHAT THAT CHANGED IN PRACTICE: nothing yet, and the measurement is the
     reason to say so rather than let a future reader assume it fixed a bug.
     Nothing was being cut. src.start() is called with no duration, stop() is
     never called, there is no fade and no cap; the tightest spacing in the old
     grid was 60 seconds against clips of 2.39-3.15 seconds, so a sound had
     roughly 57 seconds of silence after it. The cut a listener hears on
     voice-5 and voice-6 is not a cut at all: those two reach full level in 36
     and 44 ms where the others take 256-982, and a fast onset 8 dB louder than
     last week reads as abrupt. Their first samples are 1e-5 and their tails
     are 52-54 dB down, so there is nothing there to repair.

     The chain is still worth having. It makes "no sound is ever truncated" a
     property of the mechanism instead of an accident of the current durations
     — drop in a 90-second recording tomorrow and the gap still opens after it
     ends. tests/exam-ambience.test.mjs asserts it directly.

     TWO CLASSES OF EVENT, because two kinds of rule were asked for.

     FREE events are the rotation: voice-1 through voice-4, each starting GAP
     seconds after the previous sound FINISHED. The cycle never restarts at a
     module boundary, which is why module 2 opens on a different sound.

     FIXED events keep their minute: voice-5 at 10:00, voice-6 at 20:00,
     voice-7 at 32:00, in every module, plus two rotation sounds at 33:00 and
     34:00. These are times someone asked for, so they stay times. Drift cannot
     truncate them either — a fixed event is 60+ seconds from its neighbour and
     the clips are 3 seconds, and the planner refuses to place a free event
     inside MIN_GAP of one regardless.

     WHY THE FIXED ONES DID NOT BECOME RELATIVE TOO. "Sound 6 after the first
     20 m in every module" is a statement about the module, not about the queue.
     Made relative, it would land at a different minute in every module and in
     every session, and the instruction would no longer be checkable. Say the
     word if they should drift with the chain instead.

     ARMED ABSOLUTELY, ALWAYS. Each event is armed as a delay from moduleT0
     rather than "now plus a gap", so a late-firing timeout costs that event a
     few milliseconds and never accumulates. This is the same reason the old
     code counted marks instead of reading the clock; the chain reintroduces a
     running total, so the arming has to stay absolute or the drift comes back
     compounded by every duration in it. */
  var GAP = 180;                    // seconds of silence between two sounds
  var MIN_GAP = 90;                 // no free event this close to a fixed one
  var LEAD = 3;                     // a fixed event never lands on top of a sound
  var ROTATION = ['voice-1', 'voice-2', 'voice-3', 'voice-4'];
  var ANCHORS = [
    { id: 'voice-5', at: 600 },     // 10:00 into every module
    { id: 'voice-6', at: 1200 },    // 20:00 into every module
    { id: 'voice-7', at: 1920 },    // 32:00 — deliberately off any regular beat
  ];

  /* EXTRA FIXED POINTS, asked for by hand, and the one place clustering is the
     point rather than the defect. The last minutes of a real hall are the busy
     ones — people finishing, papers moving, someone giving up — so 33:00 and
     34:00 come a minute apart on purpose, right after the 32:00 anchor. They
     carry no id: each is filled by the next rotation sound.

     35:00 WAS ASKED FOR AND IS NOT HERE. A module is 2100 seconds and the
     schedule stops strictly before its end, so a mark at 35:00 is the moment
     the timer reaches zero: it would never play, in either module. */
  var EXTRA = [1980, 2040];         // 33:00, 34:00

  /* Every fixed point in one module, in order. */
  function fixedPoints() {
    var out = ANCHORS.map(function (a) { return { at: a.at, id: a.id }; })
      .concat(EXTRA.map(function (t) { return { at: t, id: null }; }));
    return out.sort(function (a, b) { return a.at - b.at; });
  }

  /* HOW LONG EACH RECORDING IS, in seconds, committed so the planner can be
     simulated without decoding an mp3 — schedule() below prints the real
     timetable, and a timetable that guessed the durations would print a
     different one from the one that plays.

     The browser reads the true duration off the decoded buffer and uses that;
     these values only drive the printed table and the CI checks. They were
     measured with ffprobe on the shipped files. If a clip is ever replaced,
     re-measure DURATION_S, PEAK_DBFS and TRIM together — all three describe
     the same bytes. */
  var DURATION_S = {
    'voice-1': 30.55, 'voice-2': 24.44, 'voice-3': 27.97, 'voice-4': 35.34,
    'voice-5': 17.07, 'voice-6': 15.27, 'voice-7': 16.62,
  };

  var voiceTimer = null, voiceIdx = 0, moduleT0 = 0, moduleKey = null;
  var lastEndAt = 0;                // module seconds at which the last sound ended
  var fixedIdx = 0;                 // how many fixed points this module are done

  var HORIZON = 3600;

  /* THE PLANNER. Given where the last sound ended and how many fixed points
     have gone, decide what happens next and when. Pure: schedule() and the
     runtime both call it, so the printed table cannot drift from behaviour. */
  function planNext(endedAt, fIdx, rIdx) {
    var cand = endedAt + GAP;
    var pts = fixedPoints();
    var f = fIdx < pts.length ? pts[fIdx] : null;
    if (f && f.at <= cand + MIN_GAP) {
      // The fixed point wins its minute; it only slides if a sound is still
      // playing, and then only by LEAD.
      return { at: Math.max(f.at, endedAt + LEAD), id: f.id || ROTATION[rIdx % ROTATION.length],
               fixed: true, usesRotation: !f.id };
    }
    return { at: cand, id: ROTATION[rIdx % ROTATION.length], fixed: false, usesRotation: true };
  }

  function context() {
    if (ctx) return ctx;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    // Unity: the per-clip TRIMs set the level, so this stage only sums.
    // It was 0.35 while the layer's level was split between here and GAIN,
    // which is how a 16.8 dB imbalance stayed invisible for as long as it did.
    master.gain.value = 1.0;
    master.connect(ctx.destination);
    return ctx;
  }

  /* VOICES — THE ONE LAYER THAT IS A RECORDING.
     
     Two attempts at synthesising a voice were thrown away first. The second one
     measured correctly — a periodic source at 124 Hz with sliding formants and
     a convolved room — and still sounded engineered, because a voice is the one
     sound a listener has spent their whole life calibrated against and an
     approximation does not survive that. That verdict is now the file's only
     policy: the pen and paper were synthesised too, and went the same way.

     The clips are CLEANED ONLY — a gentle FFT denoise, 7.4 dB off the noise
     floor — and deliberately not distanced. Room-processed versions were made
     and not chosen. What keeps them in the background is therefore the GAIN and
     nothing else, which is a number anyone can move, rather than filtering
     baked into the file.

     THE DENOISE IS TUNED PER TAKE, not reused. The first recording took nr=12
     and lost under 1 dB of whisper. The same setting on this one lost 4.4 dB
     from one passage — and sweeping the strength showed that passage still
     losing 3.8 dB at the gentlest setting that does anything at all. The cause
     is not the filter being too strong: a whisper is largely UNVOICED, so
     whispered consonants ARE broadband noise, and a spectral denoiser cannot
     tell them from the room. So this take runs at nr=6, which is gentler than
     the first take's and still takes more off the floor. Reusing a number would
     have been the mistake that reusing an approach avoids.

     Fetched on first use, not on page load: nothing downloads for a student who
     never turns this on. A clip that fails to load costs its own marks and
     nothing else — the schedule keeps running and the other six still play,
     because a missing asset must not take the exam with it. */
  /* PER-CLIP LOUDNESS TRIM — measured, not chosen.

     Each clip's loudest 100 ms window was measured against its own true peak,
     and the trim is whatever brings that window to a common -24 dBFS. Since
     the 2026-08-30 re-cut every clip is peak-normalised to -3 dBFS before
     encoding, so no clip reaches the -0.5 dBFS ceiling any more and the match
     is exact: the spread across all seven is 0.00 dB, where the previous set
     left voice-3 parked 0.9 dB under the group.

     PEAK dBFS   LOUDEST-100ms   TRIM     LENGTH    -> plays at
      -4.4         -17.1        0.452    30.55s      -24.0
      -3.2         -17.2        0.459    24.44s      -24.0
      -3.2         -25.2        1.152    27.97s      -24.0
      -3.1         -13.4        0.297    35.34s      -24.0
      -2.7         -12.4        0.263    17.07s      -24.0
      -3.2         -15.4        0.371    15.27s      -24.0
      -3.0         -13.4        0.294    16.62s      -24.0

     WHY A TRIM AT ALL, when the files are normalised. Because peak is not
     loudness, which is the whole lesson of this layer: these seven still span
     12.5 dB in the loudest 100 ms while their peaks sit within 0.8 dB. The
     normalisation exists to give a 64 kbps encoder a strong signal, not to set
     the playback level, and confusing those two is what left five of the seven
     inaudible before.

     PEAK is committed beside TRIM so the no-clipping invariant is checkable
     without decoding an mp3 in CI; tests/exam-ambience.test.mjs asserts
     PEAK + TRIM + gain stays under 0 dBFS for every clip. DURATION_S sits with
     them because all three describe the same bytes. Re-measure all three
     together if a clip is ever replaced. */
  var TRIM = {
    'voice-1': 0.452, 'voice-2': 0.459, 'voice-3': 1.152, 'voice-4': 0.297,
    'voice-5': 0.263, 'voice-6': 0.371, 'voice-7': 0.294,
  };
  var PEAK_DBFS = {
    'voice-1': -4.4, 'voice-2': -3.2, 'voice-3': -3.2, 'voice-4': -3.1,
    'voice-5': -2.7, 'voice-6': -3.2, 'voice-7': -3.0,
  };

  /* The gain at which the first clip's peak would reach 0 dBFS. The reviewer
     control stops here rather than letting a review session distort the
     material it is judging.

     1.29 since the re-cut, from 1.05: the clips now leave 2.23 dB of headroom
     at unity instead of 0.46, because none of them is straining against the
     ceiling to reach the group level. Derived, never chosen — the suite
     asserts the hottest clip actually REACHES full scale here, so a rounded
     value fails. One did: 1.06 shipped for a minute and clipped by 0.04 dB. */
  var SAFE_MAX = 1.25;

  var buffers = {}, fetching = {};

  function clip(name) {
    if (buffers[name] !== undefined) return buffers[name];
    if (fetching[name]) return null;
    fetching[name] = true;
    try {
      root.fetch('assets/exam-ambience/' + name + '.mp3')
        .then(function (r) { return r.ok ? r.arrayBuffer() : Promise.reject(r.status); })
        .then(function (a) { return ctx.decodeAudioData(a); })
        .then(function (b) { buffers[name] = b; })
        .catch(function () { buffers[name] = null; });
    } catch (e) { buffers[name] = null; }
    return null;
  }

  function voices(at, name) {
    var id = name || ROTATION[voiceIdx % ROTATION.length];
    var buf = clip(id);
    if (!buf) return 0;                      // not decoded yet, or failed: silence
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var g = ctx.createGain();
    g.gain.value = GAIN.voices * (TRIM[id] || 1);
    src.connect(g); g.connect(master);
    src.start(ctx.currentTime + at);
    return buf.duration;
  }

  // Warm the cache the moment the layer is switched on, so the first moment is
  // not the one that misses.
  function preload() {
    try {
      ROTATION.forEach(clip);
      ANCHORS.forEach(function (a) { clip(a.id); });
    } catch (e) {}
  }

  var lastVoice = null;

  /* Play the next event and advance the chain.

     THE GAP OPENS FROM THE REAL DURATION, not from DURATION_S: the browser has
     the decoded buffer and knows exactly how long it is, so a clip replaced on
     disk without its table being updated still gets its full length plus the
     gap. voices() returns that duration, and 0 when nothing decoded yet —
     which correctly opens the gap from now rather than from a length that
     never played. */
  function voiceMoment() {
    var pts = fixedPoints();
    var plan = planNext(lastEndAt, fixedIdx, voiceIdx);
    if (plan.at >= HORIZON) return null;              // past the horizon
    if (plan.fixed) fixedIdx++;
    if (plan.usesRotation) voiceIdx++;
    lastVoice = plan.id;
    var dur = voices(0.25, plan.id) || (DURATION_S[plan.id] || 3);
    lastEndAt = plan.at + 0.25 + dur;                 // the gap starts HERE
    return plan.id;
  }

  /* Arm the next event against the module's start, never against "now plus a
     gap". The chain now carries a running total, so relative arming would
     compound every timeout's lateness with every duration; absolute arming
     costs one event a few milliseconds and nothing after it. */
  function armNext() {
    if (voiceTimer) { root.clearTimeout(voiceTimer); voiceTimer = null; }
    if (!on) return;
    var plan = planNext(lastEndAt, fixedIdx, voiceIdx);
    if (plan.at >= HORIZON) return;
    var due = moduleT0 + plan.at * 1000 - Date.now();
    voiceTimer = root.setTimeout(function () {
      if (!on) return;
      voiceMoment();
      armNext();
    }, Math.max(0, due));
  }

  /* THE PAGE SAYS WHEN A MODULE STARTS, because only the page knows. Called on
     every render with whatever identifies the current module; the clock resets
     only when that changes, so calling it repeatedly is free. The rotation
     index is deliberately NOT reset — the cycle runs straight through — but
     the chain and the fixed points are, because both are module-relative.

     lastEndAt starts at -GAP so the first event lands at 0:00. */
  function noteModule(key) {
    if (key === moduleKey) return false;
    moduleKey = key;
    fixedIdx = 0;
    lastEndAt = -GAP;
    moduleT0 = Date.now();
    if (on) armNext();
    return true;
  }

  /* THE TIMETABLE FOR ONE MODULE, as data — and it is a SIMULATION of the
     runtime rather than a second description of it. Same planner, same
     durations, same order, so the table cannot say one thing while the page
     does another. That mattered more when the times were a fixed grid; now
     that a duration moves every subsequent event, a table derived any other
     way would be wrong by construction.

     `startIndex` continues the rotation, so pass a previous module's
     nextIndex to see the one after it. */
  function schedule(moduleMinutes, startIndex) {
    var out = [], end = (moduleMinutes || 35) * 60;
    var i = startIndex || 0, f = 0, ended = -GAP, guard = 0;
    while (guard++ < 500) {
      var plan = planNext(ended, f, i);
      if (plan.at >= end || plan.at >= HORIZON) break;
      if (plan.fixed) f++;
      if (plan.usesRotation) i++;
      var dur = DURATION_S[plan.id] || 3;
      var t = plan.at;
      out.push({ at: +t.toFixed(2),
                 clock: Math.floor(t / 60) + ':' + (t % 60 < 10 ? '0' : '') + Math.floor(t % 60),
                 clip: plan.id, seconds: dur, fixed: plan.fixed,
                 endsAt: +(t + 0.25 + dur).toFixed(2) });
      ended = t + 0.25 + dur;
    }
    out.nextIndex = i;
    return out;
  }

  function enable() {
    try {
      if (on) return true;
      if (!context()) return false;
      on = true;
      voiceIdx = 0;
      fixedIdx = 0;
      lastEndAt = -GAP;              // so the first event lands at 0:00
      moduleT0 = Date.now();
      preload();
      // The first event is at 0:00, so arming immediately plays it now rather
      // than leaving the chain's first entry silent.
      armNext();
      return true;
    } catch (e) { return false; }
  }

  function disable() {
    try {
      on = false;
      if (voiceTimer) { root.clearTimeout(voiceTimer); voiceTimer = null; }
      if (ctx && ctx.state === 'running') ctx.suspend();
      return true;
    } catch (e) { return false; }
  }

  root.SiExamAmbience = {
    enable: enable,
    disable: disable,
    isOn: function () { return on; },
    gains: GAIN,
    setGain: function (k, v) { if (k in GAIN) GAIN[k] = Math.max(0, Math.min(SAFE_MAX, v)); return GAIN[k]; },
    safeMax: SAFE_MAX,
    trim: TRIM,
    peakDbfs: PEAK_DBFS,
    setMaster: function (v) { if (master) master.gain.value = Math.max(0, Math.min(1, v)); },
    // The voice schedule, and a way to hear the next one without waiting for it.
    schedule: schedule,
    voiceNow: voiceMoment,
    /* Console-only. The gap BETWEEN sounds, in seconds — end of one to start
       of the next, which is what changed on 2026-08-30. Returns the current
       value when called with nothing: an accidental gapSeconds() setting it to
       NaN would put every event at NaN seconds and stop the layer dead, and
       the same slip on the old interval reduced the whole schedule to 0:00 in
       silence. */
    gapSeconds: function (v) {
      if (!isFinite(v)) return GAP;
      GAP = Math.max(10, v);
      if (on) { disable(); enable(); }
      return GAP;
    },
    noteModule: noteModule,
    get _lastVoice() { return lastVoice; },
    durations: DURATION_S,
    fixedPoints: fixedPoints,
    _voices: ROTATION.concat(ANCHORS.map(function (a) { return a.id; })),
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
