// Exam ambience — a TEST VERSION, to hear whether the idea is any good.
//
// THESE ARE NOT RECORDINGS. Every sound here is synthesised in the browser: no
// files, no downloads, no licence to clear, nothing to commit. That is the whole point at this stage — the question on the table is
// "does a room around the student help or distract", and it can be answered
// with textures that are roughly right. Real Foley replaces these later without
// reshaping anything: same three layers, same gains, same scheduler.
//
// WHY SYNTHESISED AND NOT SOURCED. Both other routes are shut from here. Every
// sound library is blocked by this environment's egress proxy, and the audio
// generator available refuses sound effects by design. Synthesis was the only
// way to put something in your ears today, and for two of the three layers it
// is the honest choice anyway: pen-on-paper and paper rustle ARE broadband
// noise with an envelope, so those are not mock-ups of the sound but cheap
// versions of the real mechanism. The third layer is not, and the comment above
// `utter()` records what that cost and what replaced it.
//
// AUDIO OBSERVES; IT NEVER DRIVES — the rule exam-audio.js already sets. Nothing
// here touches the timer, the view, saving or scoring. Every entry point
// catches. A browser that blocks the context produces silence, and silence is a
// working exam.
(function (root) {
  'use strict';

  var ctx = null, master = null, timer = null, on = false, last = null;

  // Independent gains, which is the point of layers: the voices can come down
  // without touching the pen. These are the starting mix and are meant to be
  // argued with.
  var GAIN = { pen: 0.55, paper: 0.40, voices: 0.30 };

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

  /* THE ROOM. One impulse response, made once and reused: noise decaying
     exponentially, which is what a small hard room does to a sound. Everything
     voiced goes through it, and that single fact is most of what separates
     "someone across the room" from "a sound in your headphones". */
  var room = null;
  function reverb() {
    if (room) return room;
    var secs = 1.1, n = Math.floor(ctx.sampleRate * secs);
    var ir = ctx.createBuffer(2, n, ctx.sampleRate);
    for (var c = 0; c < 2; c++) {
      var d = ir.getChannelData(c);
      for (var i = 0; i < n; i++)
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6);
    }
    room = ctx.createConvolver();
    room.buffer = ir;
    var wet = ctx.createGain();
    wet.gain.value = 0.9;
    room.connect(wet); wet.connect(master);
    return room;
  }

  /* DISTANT VOICES — the replacement for a synthetic whisper, and a different
     mechanism rather than the same one turned down.
     
     The first attempt shaped NOISE into syllables. That is why it sounded
     artificial: noise with a speech-like envelope is exactly what it is, and
     the ear is very good at hearing the difference. A voice is not noise with a
     rhythm — it is a PITCHED source with a fundamental and harmonics, filtered
     by a mouth into formants that move as the mouth moves. So:

       sawtooth at a speaking fundamental, drifting  — the vocal folds
       three parallel bandpass filters, sliding      — the mouth
       a hard lowpass                                — distance and a wall
       convolution reverb                            — the room it happens in

     Still no words, and still by requirement: the formants move between vowel
     positions without ever forming consonants, so there is speech-shaped sound
     and nothing to decode. Two short utterances with a gap is what makes it an
     exchange between two people rather than one person muttering — the second
     is briefer and a different pitch, the shape of an answer. */
  function utter(at, f0, dur) {
    var osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0, at);
    // Real speech never holds a pitch. This drift is small and is the
    // difference between a voice and a buzzer.
    osc.frequency.linearRampToValueAtTime(f0 * (0.88 + Math.random() * 0.2), at + dur);

    var glottal = ctx.createGain();
    glottal.gain.setValueAtTime(0, at);
    var t = at, syl = 2 + Math.floor(Math.random() * 2);
    for (var i = 0; i < syl; i++) {
      var len = dur / syl;
      glottal.gain.linearRampToValueAtTime(0.6 + Math.random() * 0.4, t + len * 0.35);
      glottal.gain.linearRampToValueAtTime(0.12, t + len * 0.95);
      t += len;
    }
    glottal.gain.linearRampToValueAtTime(0, at + dur + 0.05);
    osc.connect(glottal);

    // Two vowel positions, slid between. Which vowels does not matter; that
    // they MOVE is what reads as a mouth.
    var F = [[520, 1180, 2500], [700, 1500, 2600]];
    var a = F[Math.floor(Math.random() * 2)], b = F[Math.floor(Math.random() * 2)];
    var sum = ctx.createGain(); sum.gain.value = 1;
    for (var k = 0; k < 3; k++) {
      var bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 6 - k * 1.5;
      bp.frequency.setValueAtTime(a[k], at);
      bp.frequency.linearRampToValueAtTime(b[k], at + dur);
      var fg = ctx.createGain();
      fg.gain.value = [1, 0.6, 0.25][k];
      glottal.connect(bp); bp.connect(fg); fg.connect(sum);
    }

    // Distance: a wall and some metres of air take the top off.
    var far = ctx.createBiquadFilter();
    far.type = 'lowpass'; far.frequency.value = 820; far.Q.value = 0.7;
    var out = ctx.createGain();
    out.gain.value = GAIN.voices;
    sum.connect(far); far.connect(out);
    out.connect(reverb());
    // A little direct signal so it is not pure reverb, which sounds like a cave.
    var dry = ctx.createGain(); dry.gain.value = 0.35;
    out.connect(dry); dry.connect(master);

    osc.start(at); osc.stop(at + dur + 0.2);
  }

  function voices(at) {
    var t0 = ctx.currentTime + at;
    var low = 95 + Math.random() * 45;
    utter(t0, low, 0.34 + Math.random() * 0.22);
    // The reply: shorter, higher, after the kind of gap a quick answer takes.
    utter(t0 + 0.55 + Math.random() * 0.35, low * (1.25 + Math.random() * 0.3),
          0.20 + Math.random() * 0.14);
    return 1.2;
  }

  var MOMENTS = [
    { id: 'writing',  play: function () { pen(0); paper(1.1 + Math.random()); } },
    { id: 'page',     play: function () { paper(0); pen(0.7 + Math.random() * 0.6); } },
    { id: 'asking',   play: function () { voices(0.2); paper(0.1); } },
    { id: 'room',     play: function () { pen(0); voices(0.9); paper(2.1); } },
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
