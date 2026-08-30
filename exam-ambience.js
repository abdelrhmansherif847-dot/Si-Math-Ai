// Exam ambience — a TEST VERSION, to hear whether the idea is any good.
//
// THREE LAYERS, AND THEY ARE NOT THE SAME KIND OF THING. Pen and paper are
// synthesised in the browser from filtered noise; the voices are a real
// recording, made by the owner and processed from it. That split is deliberate
// and is explained where each one is defined: noise with an envelope IS what a
// nib and a sheet of paper sound like, and it is not what a voice sounds like.
//
// The synthetic pair also had no alternative — every sound library is blocked by
// this environment's egress proxy and the audio generator available refuses
// sound effects — but they would be the right choice regardless.
//
// AUDIO OBSERVES; IT NEVER DRIVES — the rule exam-audio.js already sets. Nothing
// here touches the timer, the view, saving or scoring. Every entry point
// catches. A browser that blocks the context produces silence, and silence is a
// working exam.
(function (root) {
  'use strict';

  var ctx = null, master = null, timer = null, on = false, last = null;

  // Independent gains, which is the point of layers: the voices come down
  // without touching the pen. The starting mix, and meant to be argued with.
  //
  // `voices` is the one that will need tuning, and the clips are normalised to
  // a common -6 dBFS peak so this number means the same thing for all four. A
  // whisper recorded honestly is QUIET — the raw takes peaked between -15 and
  // -25 dBFS — so without that step the layer sat about 18 dB under the pen and
  // was effectively inaudible. Normalising is level, not processing: treatment
  // A's character is untouched. At 0.5 the voice lands a few dB under the pen,
  // which is a number to argue with rather than a measurement.
  var GAIN = { pen: 0.55, paper: 0.40, voices: 0.50 };

  // How often a PEN-AND-PAPER moment happens. Short here on purpose — a texture
  // cannot be judged by waiting ten minutes for it.
  var EVERY = 45;

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
     Kept separate from the pen and paper, which stay random: writing and paper
     are texture and should not arrive on a beat, while an exchange between two
     students is an event and reads better on one.

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
  function markTimes() {
    var anchors = ANCHORS.map(function (a) { return a.at; });
    var seen = {}, out = [], t;
    for (t = 0; t < HORIZON; t += VOICE_EVERY) {
      var crowded = anchors.some(function (a) { return Math.abs(a - t) < MIN_GAP; });
      if (!crowded) seen[t] = true;
    }
    anchors.forEach(function (a) { seen[a] = true; });
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

  // A short burst of noise. Every layer is this with different filtering and a
  // different envelope, which is what those sounds physically are.
  function noise(seconds) {
    var n = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    var buf = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function burst(opts) {
    var src = ctx.createBufferSource();
    src.buffer = noise(opts.dur);
    var f = ctx.createBiquadFilter();
    f.type = opts.type || 'bandpass';
    f.frequency.value = opts.freq;
    f.Q.value = opts.q || 1;
    var g = ctx.createGain();
    var t = ctx.currentTime + (opts.at || 0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(opts.peak, t + (opts.attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + opts.dur + 0.05);
  }

  /* PEN — a nib on paper is a series of short, bright scratches, not a tone.
     Irregular spacing is most of what makes it read as writing rather than as
     a machine: even spacing sounds like a printer. */
  function pen(at) {
    var t = at, strokes = 5 + Math.floor(Math.random() * 4);
    for (var i = 0; i < strokes; i++) {
      burst({ at: t, dur: 0.07 + Math.random() * 0.10, freq: 2600 + Math.random() * 1600,
              q: 0.8, peak: GAIN.pen * (0.5 + Math.random() * 0.5), attack: 0.004 });
      t += 0.10 + Math.random() * 0.22;
    }
    return t - at;
  }

  /* PAPER — one longer, lower, softer event: a sheet moved or a page handled.
     Slower attack than the pen, because paper does not click. */
  function paper(at) {
    burst({ at: at, dur: 0.45 + Math.random() * 0.35, freq: 900 + Math.random() * 700,
            q: 0.5, peak: GAIN.paper, attack: 0.09 });
    return 0.8;
  }

  /* VOICES — THE ONE LAYER THAT IS A RECORDING.
     
     Two attempts at synthesising a voice were thrown away first. The second one
     measured correctly — a periodic source at 124 Hz with sliding formants and
     a convolved room — and still sounded engineered, because a voice is the one
     sound a listener has spent their whole life calibrated against and an
     approximation does not survive that. So this layer is a real recording and
     the other two stay synthetic, which is not an inconsistency: pen-on-paper
     and paper rustle ARE noise with an envelope, and a voice is not.

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

  var MOMENTS = [
    { id: 'writing',  play: function () { pen(0); paper(1.1 + Math.random()); } },
    { id: 'page',     play: function () { paper(0); pen(0.7 + Math.random() * 0.6); } },
    { id: 'settling', play: function () { paper(0); paper(0.5 + Math.random() * 0.4); } },
    { id: 'nearby',   play: function () { pen(0); pen(1.4 + Math.random() * 0.8); } },
  ];

  /** Play one moment now. Exposed so it can be auditioned without waiting. */
  function moment(id) {
    try {
      if (!context()) return null;
      if (ctx.state === 'suspended') ctx.resume();
      var pool = MOMENTS.filter(function (m) { return m.id !== last; });
      var m = id ? MOMENTS.filter(function (x) { return x.id === id; })[0]
                 : pool[Math.floor(Math.random() * pool.length)];
      if (!m) return null;
      last = m.id;
      m.play();
      return m.id;
    } catch (e) { return null; }
  }

  /* One scheduled exchange: paper under it, never a pen — a student writing is
     not the one talking. An anchor due at this mark wins; otherwise the
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
    paper(0.05);
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
      timer = root.setInterval(function () { if (on) moment(); }, EVERY * 1000);
      // THE FIRST MARK IS 0:00, so arming immediately plays it now rather than
      // leaving the schedule's first entry silent.
      armNext();
      moment();
      return true;
    } catch (e) { return false; }
  }

  function disable() {
    try {
      on = false;
      if (timer) { root.clearInterval(timer); timer = null; }
      if (voiceTimer) { root.clearTimeout(voiceTimer); voiceTimer = null; }
      if (ctx && ctx.state === 'running') ctx.suspend();
      return true;
    } catch (e) { return false; }
  }

  root.SiExamAmbience = {
    enable: enable,
    disable: disable,
    isOn: function () { return on; },
    moment: moment,
    gains: GAIN,
    setGain: function (k, v) { if (k in GAIN) GAIN[k] = Math.max(0, Math.min(1, v)); },
    setMaster: function (v) { if (master) master.gain.value = Math.max(0, Math.min(1, v)); },
    everySeconds: function (s) { EVERY = Math.max(5, s); if (on) { disable(); enable(); } },
    // The voice schedule, and a way to hear the next one without waiting for it.
    schedule: schedule,
    voiceNow: voiceMoment,
    voiceEverySeconds: function (s) { VOICE_EVERY = Math.max(10, s); if (on) { disable(); enable(); } },
    noteModule: noteModule,
    get _lastVoice() { return lastVoice; },
    marks: markTimes,
    _voices: ROTATION.concat(ANCHORS.map(function (a) { return a.id; })),
    _moments: MOMENTS.map(function (m) { return m.id; }),
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
