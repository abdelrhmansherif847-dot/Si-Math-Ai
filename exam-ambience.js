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

  /* One gain, for the one layer. The clips are normalised to a common -6 dBFS
     peak so this number means the same thing for all seven — a whisper recorded
     honestly is QUIET, the raw takes peaked between -15 and -25 dBFS, and
     normalising is level rather than processing, so treatment A's character is
     untouched. 0.5 against a master of 0.35 is background, not foreground; it
     is a number to argue with rather than a measurement. */
  var GAIN = { voices: 0.50 };

  /* THE VOICE SCHEDULE: A ROTATION, PLUS TWO ANCHORED SOUNDS.
     The first one at 0:00, the next five minutes later, and so on through the
     list; after the last it returns to the first. Order and timing are both
     deterministic — the schedule is a fact that can be printed, which is the
     whole reason for it.

     IT DOES NOT RESET AT A MODULE BOUNDARY, and that is a decision rather than
     an oversight (confirmed 2026-08-30). Restarting each module at sound 1
     would be one line here — resetting voiceIdx on enable() already does it —
     so if a later reader finds module 2 "starting on the wrong sound", this is
     the note saying it is the right one.
     TWO KINDS OF SOUND, because two kinds of rule were asked for.

     ROTATION is the continuous cycle: sound 1, 2, 3, 4, round again, never
     restarting at a module boundary.

     ANCHORS are pinned to a point INSIDE each module — sound 5 at 10:00, sound
     6 at 20:00 — and play there once per module, every module. They are held
     back because both are much closer, louder recordings than the rotation
     (15 dB hotter before normalising), and a voice that present is a different
     kind of event: better once a student has settled than in the opening
     minutes.

     WHY ANCHORS AND NOT JUST A FLOOR ON THE ROTATION. A floor was the first
     shape and it does not survive the requirement. With a continuous cycle and
     a skip-if-too-early rule, sound 6 lands at 25:00 in module 1 and then never
     appears in module 2 at all — the skip shifts the queue, and "in every
     module" quietly stops being true. An anchor is the only shape that keeps
     both promises at once: the cycle never restarts, AND each gated sound
     appears in every module at the point it was given.

     So a mark is filled by an anchor if one is due, and otherwise by the next
     rotation entry. The rotation index carries across modules untouched, which
     is why module 2 opens on a different sound from module 1.

     ELAPSED IS COUNTED IN MARKS, NOT WALL CLOCK. setInterval fires late and the
     drift accumulates, so Date.now() at the 10:00 mark can read 599.98s and
     miss an anchor at 600 — exactly the boundary these are built on. Counting
     marks makes the runtime and schedule() agree by construction rather than by
     luck, which matters because the printed table is meant to BE what happens.
     markIdx points at the next entry in that list; moduleT0 is when the
     current module began, and every arming is measured from it. */
  var VOICE_EVERY = 180;
  var ROTATION = ['voice-1', 'voice-2', 'voice-3', 'voice-4'];
  var ANCHORS = [
    { id: 'voice-5', at: 600 },     // 10:00 into every module
    { id: 'voice-6', at: 1200 },    // 20:00 into every module
    { id: 'voice-7', at: 1920 },    // 32:00 — deliberately OFF the five-minute grid
  ];
  var voiceTimer = null, voiceIdx = 0, markIdx = 0, moduleT0 = 0, moduleKey = null;

  /* THE MARKS ARE A LIST, NOT A FIXED INTERVAL, and sound 7 is why. It was
     asked for at 32:00, and 32:00 is not on a five-minute grid — the marks in a
     35-minute module run 0, 5, 10, 15, 20, 25, 30 and stop. An anchor there
     would have sat in the repository and never once played. So the marks are
     the UNION of the grid and the anchor times: the beat is unchanged for
     everything else, and an anchor can be put anywhere.

     Generated an hour out, which is longer than any module, and driven by a
     timeout re-armed against the module's start time rather than by an
     interval. Absolute arming is what stops the drift accumulating — the same
     reason the old code counted marks instead of reading the clock.

     A GRID MARK TOO CLOSE TO AN ANCHOR IS DROPPED. At a three-minute beat the
     grid lands on 9:00 and the first anchor on 10:00, which is a MINUTE apart —
     two exchanges almost on top of each other, in a layer whose whole point is
     that events are sparse and unremarkable. The anchors are fixed by
     instruction and the grid is not, so the grid gives way. 90 seconds is the
     smallest gap that still reads as two separate events rather than one
     stuttering one. */
  var HORIZON = 3600, MIN_GAP = 90;

  /* EXTRA MARKS, asked for by hand and exempt from the crowding rule above.
     The last minutes of a real hall are the busy ones — people finishing,
     papers moving, someone giving up — so 33:00 and 34:00 come a minute apart
     on purpose, right after the 32:00 anchor. Clustering is the point here
     rather than the defect it is elsewhere, which is why these bypass MIN_GAP
     instead of the constant being loosened for everything.

     35:00 WAS ASKED FOR AND IS NOT HERE. A module is 2100 seconds and the
     schedule stops strictly before its end, so a mark at 35:00 is the moment
     the timer reaches zero: it would never play, in either module. 34:30 is
     the nearest point that would. */
  var EXTRA = [1980, 2040];        // 33:00, 34:00

  function markTimes() {
    var anchors = ANCHORS.map(function (a) { return a.at; });
    var seen = {}, out = [], t;
    for (t = 0; t < HORIZON; t += VOICE_EVERY) {
      var crowded = anchors.some(function (a) { return Math.abs(a - t) < MIN_GAP; });
      if (!crowded) seen[t] = true;
    }
    anchors.forEach(function (a) { seen[a] = true; });
    EXTRA.forEach(function (e) { seen[e] = true; });
    Object.keys(seen).forEach(function (k) { out.push(+k); });
    return out.sort(function (a, b) { return a - b; });
  }

  function context() {
    if (ctx) return ctx;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;          // everything is quiet, then quieter
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
     never turns this on. A clip that fails to load leaves the layer silent and
     the other two playing, because a missing asset must not take the exam with
     it. */
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
    g.gain.value = GAIN.voices;
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

  /* One scheduled exchange. An anchor due at this mark wins; otherwise the
     rotation advances by one. */
  function pick(markSeconds) {
    for (var i = 0; i < ANCHORS.length; i++)
      if (ANCHORS[i].at === markSeconds) return ANCHORS[i].id;
    return ROTATION[(voiceIdx++) % ROTATION.length];
  }

  var lastVoice = null;
  function voiceMoment() {
    var times = markTimes();
    var t = times[markIdx];
    if (t === undefined) return null;           // past the horizon: nothing left
    markIdx++;
    var id = pick(t);
    lastVoice = id;
    voices(0.25, id);
    return id;
  }

  /* Arm the NEXT mark against the module's start, never against "now plus an
     interval". A late fire therefore costs that mark a few milliseconds and
     nothing after it. */
  function armNext() {
    if (voiceTimer) { root.clearTimeout(voiceTimer); voiceTimer = null; }
    var times = markTimes(), t = times[markIdx];
    if (t === undefined || !on) return;
    var due = moduleT0 + t * 1000 - Date.now();
    voiceTimer = root.setTimeout(function () {
      if (!on) return;
      voiceMoment();
      armNext();
    }, Math.max(0, due));
  }

  /* THE PAGE SAYS WHEN A MODULE STARTS, because only the page knows. Called on
     every render with whatever identifies the current module; the clock resets
     only when that changes, so calling it repeatedly is free. The rotation
     index is deliberately NOT reset — the cycle runs straight through. */
  function noteModule(key) {
    if (key === moduleKey) return false;
    moduleKey = key;
    markIdx = 0;
    moduleT0 = Date.now();
    if (on) armNext();
    return true;
  }

  /* The timetable for ONE module, as data. Anchors land on their own mark;
     everything else is the rotation continuing from wherever it is, so pass
     `startIndex` to see a later module. */
  function schedule(moduleMinutes, startIndex) {
    var out = [], end = (moduleMinutes || 35) * 60, i = startIndex || 0;
    var times = markTimes();
    for (var k = 0; k < times.length && times[k] < end; k++) {
      var t = times[k], id = null;
      for (var a = 0; a < ANCHORS.length; a++) if (ANCHORS[a].at === t) id = ANCHORS[a].id;
      if (!id) id = ROTATION[(i++) % ROTATION.length];
      out.push({ at: t, clock: Math.floor(t / 60) + ':' + (t % 60 < 10 ? '0' : '') + (t % 60),
                 clip: id, anchored: !!ANCHORS.filter(function (x) { return x.at === t; }).length });
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
      markIdx = 0;
      moduleT0 = Date.now();
      preload();
      // THE FIRST MARK IS 0:00, so arming immediately plays it now rather than
      // leaving the schedule's first entry silent.
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
    setGain: function (k, v) { if (k in GAIN) GAIN[k] = Math.max(0, Math.min(1, v)); },
    setMaster: function (v) { if (master) master.gain.value = Math.max(0, Math.min(1, v)); },
    // The voice schedule, and a way to hear the next one without waiting for it.
    schedule: schedule,
    voiceNow: voiceMoment,
    // Console-only. Returns the beat when called with nothing — an accidental
    // voiceEverySeconds() used to set VOICE_EVERY to NaN, and a NaN step ends
    // markTimes()' loop after one iteration, silently reducing the whole
    // schedule to 0:00 plus the anchors.
    voiceEverySeconds: function (s) {
      if (!isFinite(s)) return VOICE_EVERY;
      VOICE_EVERY = Math.max(10, s);
      if (on) { disable(); enable(); }
      return VOICE_EVERY;
    },
    noteModule: noteModule,
    get _lastVoice() { return lastVoice; },
    marks: markTimes,
    _voices: ROTATION.concat(ANCHORS.map(function (a) { return a.id; })),
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
