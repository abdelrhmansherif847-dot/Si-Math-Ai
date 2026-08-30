// The exam room's recorded ambience — levels, and the schedule that plays them.
//
// This module had no coverage at all until a request to "make the voices
// louder" turned out to be unanswerable by raising a gain. All seven clips had
// been normalised to a common PEAK, and peak is not loudness: their peaks sat
// within 0.7 dB of each other while the loudest 100 ms of each — what a
// listener actually hears — spanned 16.8 dB. Five of the seven were playing
// below -37 dBFS, which is present in the audio graph and inaudible in a room.
//
// The fix was a per-clip TRIM, and a trim is exactly the kind of number that
// rots: it is correct only for the file it was measured against. So the peak
// each trim was computed from is committed beside it, and the invariant that
// matters — no clip may reach full scale — is arithmetic these suites can
// check without decoding an mp3.
//
// Everything runs the REAL shipped module. A suite that restated the trims
// would agree with itself while the page clipped.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { suite } from './_assert.mjs';
import { read, evalSnippet, REPO } from './_source.mjs';

const t = suite('exam-ambience');

const root = {};
evalSnippet(read('exam-ambience.js'), {
  globalThis: root, window: root,
  setTimeout: () => 0, clearTimeout: () => {}, fetch: () => Promise.reject(),
}, []);
const A = root.SiExamAmbience;

const db = (x) => 20 * Math.log10(x);
const clips = A._voices;

t.section('the clips the schedule can reach');

t.ok('the module exposes its clip list', Array.isArray(clips) && clips.length > 0);
t.is('seven recordings', clips.length, 7);

// A typo'd anchor id plays nothing at all and reports no error — the loader
// simply caches a null. Nothing else would catch it.
t.ok('every clip has an asset on disk', clips.every(
  (c) => existsSync(resolve(REPO, 'assets/exam-ambience/' + c + '.mp3'))));
t.ok('every clip has a trim', clips.every((c) => typeof A.trim[c] === 'number'));
t.ok('every clip has a committed peak', clips.every((c) => typeof A.peakDbfs[c] === 'number'));

// The reverse direction: a trim for a clip nothing plays is a measurement that
// silently stopped applying to anything.
t.is('no trim without a clip', Object.keys(A.trim).filter((k) => !clips.includes(k)), []);
t.is('no peak without a clip', Object.keys(A.peakDbfs).filter((k) => !clips.includes(k)), []);

t.section('nothing clips, at the shipped level or the top of the control');

// The whole point of a trim table is that some entries are ABOVE unity —
// voice-3 is boosted 5.7 dB. That is what makes clipping a live risk here and
// not a theoretical one.
t.ok('at least one clip is boosted', clips.some((c) => A.trim[c] > 1));

const outputDb = (c, gain) => A.peakDbfs[c] + db(A.trim[c] * gain);
const shipped = clips.map((c) => ({ c, dbfs: outputDb(c, A.gains.voices) }));
const hottest = shipped.reduce((a, b) => (b.dbfs > a.dbfs ? b : a));

t.note(`hottest at the shipped gain: ${hottest.c} at ${hottest.dbfs.toFixed(2)} dBFS`);
t.ok('every clip stays under 0 dBFS as shipped', shipped.every((x) => x.dbfs < 0));
t.ok('the hottest clip keeps some headroom', hottest.dbfs <= -0.25);

const atMax = clips.map((c) => outputDb(c, A.safeMax));
t.ok('every clip stays at or under 0 dBFS at safeMax', atMax.every((x) => x <= 0.01));

// safeMax is a derived number, not a chosen one: it is the gain at which the
// hottest clip's peak reaches full scale. Asserting it is REACHED stops it
// drifting into a meaningless constant that merely happens to be safe.
t.ok('safeMax is where the hottest clip actually reaches full scale',
  Math.max(...atMax) > -0.35);
t.ok('safeMax is above the shipped gain', A.safeMax > A.gains.voices);

t.section('setGain refuses a level that would distort');

t.ok('setGain clamps at safeMax', A.setGain('voices', 99) === A.safeMax);
t.ok('setGain clamps at zero', A.setGain('voices', -3) === 0);
const restored = A.setGain('voices', 1.0);
t.is('setGain returns what it set', restored, 1.0);
t.is('an unknown layer is ignored', A.setGain('nope', 0.5), undefined);

t.section('the schedule reaches every clip, in both modules');

const m1 = A.schedule(35, 0);
const m2 = A.schedule(35, m1.nextIndex);

t.ok('module 1 has sounds', m1.length > 8);
t.is('module 2 has as many', m2.length, m1.length);
t.ok('every scheduled clip is a real clip',
  m1.concat(m2).every((e) => clips.includes(e.clip)));

// The anchors were each asked for at a named minute, in EVERY module. Made
// relative to the chain they would land somewhere different in every module and
// every session, so they stay times — and a time is checkable.
const anchorsOf = (m) => m.filter((e) => ['voice-5', 'voice-6', 'voice-7'].includes(e.clip))
  .map((e) => e.clock + ' ' + e.clip);
t.is('module 1 anchors keep their minute', anchorsOf(m1),
  ['10:00 voice-5', '20:00 voice-6', '32:00 voice-7']);
t.is('module 2 anchors keep their minute', anchorsOf(m2),
  ['10:00 voice-5', '20:00 voice-6', '32:00 voice-7']);
t.ok('every anchor is marked fixed',
  m1.filter((e) => ['voice-5', 'voice-6', 'voice-7'].includes(e.clip)).every((e) => e.fixed));

// The rotation is continuous across the boundary, by explicit instruction.
t.ok('module 2 does not restart the rotation', m1[0].clip !== m2[0].clip);

// Every clip must actually be heard. A trim on a clip the schedule never
// reaches is dead weight, and a recording that never plays is a bug the
// listener discovers instead of the suite.
const heard = new Set(m1.concat(m2).map((e) => e.clip));
t.is('all seven are heard within two modules', clips.filter((c) => !heard.has(c)), []);

t.section('no sound can be cut short');

// This is the point of the chain. The gap is measured from the END of one
// sound to the START of the next, so a sound cannot be overtaken however long
// it runs. Asserting it on the simulated timetable is the whole guarantee:
// nothing else in the module can truncate a source — start() is called with no
// duration and stop() is never called.
const overlaps = (m) => m.slice(1).filter((e, i) => e.at < m[i].endsAt)
  .map((e) => e.clock + ' ' + e.clip);
t.is('module 1 never starts a sound before the last one ends', overlaps(m1), []);
t.is('module 2 never starts a sound before the last one ends', overlaps(m2), []);

t.ok('every clip has a committed duration', clips.every((c) => A.durations[c] > 0));
t.is('no duration without a clip', Object.keys(A.durations).filter((k) => !clips.includes(k)), []);

// A free event is a full gap after the previous sound ENDED, to the hundredth.
// Fixed events are exempt: they keep their minute, which is what makes them
// fixed, and the planner still refuses to place one on top of a playing sound.
const freeGaps = (m) => m.slice(1).filter((e) => !e.fixed)
  .map((e, i) => +(e.at - m[m.indexOf(e) - 1].endsAt).toFixed(2));
t.is('every free gap is exactly the configured gap',
  [...new Set(freeGaps(m1).concat(freeGaps(m2)))], [180]);

// Even a fixed event, which may come sooner than a full gap, leaves real
// silence. This used to be a comfortable margin — 57s against a 3s clip —
// and the 2026-08-30 switch to full-length recordings spent most of it. The
// two assertions that stood here asserted the OLD margin (a gap five and ten
// times the longest clip) and both went red, correctly: they described
// three-second excerpts, not recordings.
const allGaps = (m) => m.slice(1).map((e, i) => e.at - m[i].endsAt);
const longest = Math.max(...clips.map((c) => A.durations[c]));
const tightest = Math.min(...allGaps(m1), ...allGaps(m2));
t.note(`longest clip ${longest.toFixed(2)}s · tightest gap ${tightest.toFixed(1)}s`);

// A free event always gets its full gap of silence, so the gap must clear the
// longest recording outright.
t.ok('the gap exceeds the longest recording', 180 > longest);

// THE BINDING CONSTRAINT IS NOW THE 33:00/34:00 CLUSTER. Those two fixed
// points are 60 seconds apart by explicit instruction, so the longest
// recording has to fit inside a minute with silence left over. At 35.34s it
// does, with 24.7s spare — but a 55-second recording added later would
// overlap, and the no-overlap checks above would only catch it if it happened
// to land in that pair. This says the real limit out loud.
const fixedTimes = A.fixedPoints().map((f) => f.at);
const closestFixed = Math.min(...fixedTimes.slice(1).map((t2, i) => t2 - fixedTimes[i]));
t.note(`closest two fixed points: ${closestFixed}s apart`);
t.ok('the longest recording fits between the closest fixed points',
  longest < closestFixed);
t.ok('and leaves at least ten seconds of silence there',
  closestFixed - longest >= 10);

// Nothing may run past the end of a module — a sound still playing when the
// timer hits zero is cut by the module ending, which is the one truncation
// the chain cannot prevent.
t.ok('module 1 finishes before the module does', m1[m1.length - 1].endsAt < 2100);
t.ok('module 2 finishes before the module does', m2[m2.length - 1].endsAt < 2100);

t.section('the gap setter cannot be poisoned');

t.is('gapSeconds() reports the gap', A.gapSeconds(), 180);
t.is('gapSeconds(undefined) does not set NaN', A.gapSeconds(undefined), 180);
t.ok('a NaN gap would have stopped the layer dead',
  A.schedule(35, 0).length > 0);

t.done();
