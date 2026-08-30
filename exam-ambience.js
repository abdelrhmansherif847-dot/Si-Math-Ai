// Exam ambience — a TEST VERSION, to hear whether the idea is any good.
//
// THESE ARE NOT RECORDINGS. Every sound here is synthesised in the browser out
// of filtered noise: no files, no downloads, no licence to clear, nothing to
// commit. That is the whole point at this stage — the question on the table is
// "does a room around the student help or distract", and it can be answered
// with textures that are roughly right. Real Foley replaces these later without
// reshaping anything: same three layers, same gains, same scheduler.
//
// WHY SYNTHESISED AND NOT SOURCED. Both other routes are shut from here. Every
// sound library is blocked by this environment's egress proxy, and the audio
// generator available refuses sound effects by design. Filtered noise was the
// only way to put something in your ears today, and it turns out to be the
// honest choice anyway: pen-on-paper and paper rustle ARE broadband noise with
// an envelope, so this is not a mock-up of the sound, it is a cheap version of
// the real mechanism.
//
// AUDIO OBSERVES; IT NEVER DRIVES — the rule exam-audio.js already sets. Nothing
// here touches the timer, the view, saving or scoring. Every entry point
// catches. A browser that blocks the context produces silence, and silence is a
// working exam.
(function (root) {
  'use strict';

  var ctx = null, master = null, timer = null, on = false, last = null;

  // Independent gains, which is the point of layers: the whisper can come down
  // without touching the pen. These are the starting mix and are meant to be
  // argued with.
  var GAIN = { pen: 0.55, paper: 0.40, whisper: 0.22 };

  // How often a moment happens. Short here ON PURPOSE — the real interval is
  // 8-12 minutes (mock-exam-v2-investigation §8.3) and you cannot judge a
  // texture by waiting ten minutes for it.
  var EVERY = 45;

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

  /* WHISPER — deliberately UNINTELLIGIBLE, and that is a requirement rather
     than a limitation: words would be a distraction and, in an exam, a
     suggestion. Low-passed hard so it reads as coming from across a room, and
     shaped in short syllable-length pulses so the ear hears speech rhythm
     without any speech. */
  function whisper(at) {
    var t = at, sylls = 4 + Math.floor(Math.random() * 4);
    for (var i = 0; i < sylls; i++) {
      burst({ at: t, dur: 0.09 + Math.random() * 0.11, type: 'lowpass',
              freq: 700 + Math.random() * 500, q: 0.7,
              peak: GAIN.whisper * (0.6 + Math.random() * 0.4), attack: 0.03 });
      t += 0.13 + Math.random() * 0.10;
    }
    return t - at;
  }

  var MOMENTS = [
    { id: 'writing',  play: function () { pen(0); paper(1.1 + Math.random()); } },
    { id: 'page',     play: function () { paper(0); pen(0.7 + Math.random() * 0.6); } },
    { id: 'asking',   play: function () { whisper(0.2); paper(0.1); } },
    { id: 'room',     play: function () { pen(0); whisper(0.9); paper(1.9); } },
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

  function enable() {
    try {
      if (on) return true;
      if (!context()) return false;
      on = true;
      timer = root.setInterval(function () { if (on) moment(); }, EVERY * 1000);
      moment();                      // one immediately, so it can be judged now
      return true;
    } catch (e) { return false; }
  }

  function disable() {
    try {
      on = false;
      if (timer) { root.clearInterval(timer); timer = null; }
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
    _moments: MOMENTS.map(function (m) { return m.id; }),
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
