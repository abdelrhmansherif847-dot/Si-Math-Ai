// The exam delivery state machine — the flow, not the pixels.
//
// This is the experience that previously existed only inside a generated
// preview page, where the only way to check it was to look at it. Every
// assertion below is a property of sitting the exam: what you are shown, what
// you are NOT shown, and what the machine refuses to decide on its own.
//
// The real shipped module runs against synthetic forms — no content, and none
// needed: the flow does not depend on what a question says.
import { suite } from './_assert.mjs';
import { read } from './_source.mjs';

const t = suite('exam-delivery');

const SRC = read('exam-delivery.js');
const g = {};
new Function('globalThis', SRC).call(g, g);
const D = g.SiExamDelivery;

/** A form shaped exactly like the Spine rows, with n questions per section. */
function form(opts = {}) {
  const n = opts.n || 3;
  const mk = (secKey, count, answerAt) =>
    Array.from({ length: count }, (_, i) => ({
      id: `${secKey}-q${i + 1}`, ordinal: i + 1,
      prompt: `prompt ${i + 1}`,
      format: i === 0 ? 'grid_in' : 'mcq',
      choices: i === 0 ? null : [{ id: 'A', text: 'a' }, { id: 'B', text: 'b' }],
      correctAnswer: i === 0 ? String(answerAt) : 'B',
      difficulty: 'easy', topicId: 'ALGEBRA', subtopicId: 'ALG_006',
      reading: null, stimulus: null,
    }));
  return {
    code: 'TEST-A', examCode: 'SAT_FULL', status: 'draft',
    sections: [
      { id: 's1', ordinal: 1, variantId: null, label: 'Module 1',
        questionCount: n, durationMinutes: 35, calculatorAllowed: true,
        questions: mk('s1', n, 42) },
      { id: 's2a', ordinal: 2, variantId: 'advanced', label: 'Module 2',
        questionCount: n, durationMinutes: 35, calculatorAllowed: true,
        questions: mk('s2a', n, 7) },
      { id: 's2s', ordinal: 2, variantId: 'standard', label: 'Module 2',
        questionCount: n, durationMinutes: 35, calculatorAllowed: opts.calc !== false,
        questions: mk('s2s', n, 7) },
    ],
  };
}
/** A plain three-part form with no variants — the generic case.
 *
 *  Ordinals 1, 2 and 10, deliberately: with 1/2/3 a lexicographic sort and a
 *  numeric one agree, so the ordering assertion below passed against a broken
 *  sort. It does not any more. */
function plainForm() {
  const sec = (o) => ({ id: 's' + o, ordinal: o, variantId: null, label: 'Part ' + o,
    questionCount: 2, durationMinutes: 10, calculatorAllowed: o !== 2,
    questions: [1, 2].map((i) => ({ id: `s${o}q${i}`, ordinal: i, prompt: 'p',
      format: 'mcq', choices: [{ id: 'A', text: 'a' }], correctAnswer: 'A' })) });
  return { code: 'PLAIN', examCode: 'ACT_MATH', sections: [sec(10), sec(1), sec(2)] };
}

// ───────────────────────────────────────────────────────────────────────────
t.section('the form is read in the order the exam is sat');
{
  // Sections arrive from the database in whatever order the query returns.
  const st = D.stagesOf(plainForm());
  t.is('stages run by ordinal, whatever order the rows came in',
       st.map(s => s.ordinal), [1, 2, 10]);
  const v = D.stagesOf(form());
  t.is('one stage per ordinal, not one per section row', v.map(s => s.ordinal), [1, 2]);
  t.is('the variant-bearing stage carries both options',
       v[1].options.map(o => o.variantId), ['advanced', 'standard']);
  t.is('a section key is unique once variants exist',
       [D.keyOf({ ordinal: 2, variantId: null }), D.keyOf({ ordinal: 2, variantId: 'standard' })],
       ['2', '2:standard']);
}

t.section('sitting a module');
{
  const s = D.create(form({ n: 3 }));
  const a = s.state();
  t.is('opens on the first question of the first module', [a.number, a.total, a.section.ordinal], [1, 3, 1]);
  t.is('the module is named by its label, never by its variant', a.section.label, 'Module 1');
  t.ok('the clock is running from the section duration', a.remainingSec > 2090 && a.remainingSec <= 2100);

  s.answer('42');
  t.is('a grid-in answer is kept as typed', s.state().answer, '42');
  s.answer('');
  t.is('clearing an answer removes it, it does not store an empty', s.state().answer, null);

  s.next(); s.answer('B'); s.toggleFlag();
  t.is('an answer and a flag live on the same question', [s.state().answer, s.state().flagged], ['B', true]);
  s.toggleFlag();
  t.is('flagging is a toggle', s.state().flagged, false);

  s.jump(3);
  t.is('jumping moves to that question', s.state().number, 3);
  t.ok('and is the last one', s.state().isLast);
  s.jump(99); s.jump(0);
  t.is('a jump outside the module is ignored, not clamped into a wrong screen', s.state().number, 3);
  s.next();
  t.is('next on the last question does not run off the end', s.state().number, 3);
  s.prev(); s.prev(); s.prev();
  t.is('prev on the first question does not run off the start', s.state().number, 1);
}

t.section('the navigator gets the four states it draws');
{
  const s = D.create(form({ n: 3 }));
  s.answer('42'); s.next(); s.toggleFlag();
  const ns = s.navStates();
  t.is('answered, flagged, and not-seen — keyed 1..n as exam-chrome expects',
       [ns[1], ns[2], ns[3]], ['answered', 'flagged', 'unseen']);
  // A flag OUTRANKS an answer: a student who flagged a question they answered
  // is telling you they want to come back, and the grid has to say so.
  s.answer('B');
  t.is('a flagged question stays flagged even once answered', s.navStates()[2], 'flagged');
}

t.section('what the break screen is NOT allowed to know');
{
  const s = D.create(form({ n: 3 }));
  s.answer('42'); s.next(); s.answer('B'); s.next(); s.answer('B');
  s.finishSection();
  const br = s.state();
  t.is('the module ends in a break, not in results', br.phase, 'BREAK');
  // The whole point. On test day a student learns neither their score nor
  // which Module 2 they were given; the machine withholds it rather than
  // trusting every screen to remember not to print it.
  t.is('the break screen is given no score at all', br.results, []);
  s.beginNextSection();
  t.is('and the next module is named "Module 2" whichever one it is',
       s.state().section.label, 'Module 2');
  s.answer('7'); s.next(); s.answer('B'); s.next(); s.answer('B');
  s.finishSection();
  const done = s.state();
  t.is('only when the exam is over do results appear', done.phase, 'DONE');
  t.is('and then there is one per module sat', done.results.length, 2);
  t.is('scored on the answers given', done.results.map(r => r.correct), [3, 3]);
}

t.section('routing is the caller’s decision, and the machine says when it was not made');
{
  const seen = [];
  const routed = D.create(form({ n: 3 }), {
    route: (prev, stage) => { seen.push([prev && prev.correct, stage.ordinal]); return 'advanced'; },
  });
  routed.finishSection(); routed.beginNextSection();
  t.is('route() is called with the previous result and the stage it is filling',
       seen, [[0, 2]]);
  t.is('and the variant it names is the one sat', routed.state().section.variantId, 'advanced');
  t.ok('a chosen route is marked chosen', routed.state().routeChosen);

  // NO THRESHOLD IS INVENTED. exam-registry.js says routing is adaptive-READY
  // and inert because no cut score has been set; a default here would bury that
  // standard-setting decision in a state machine.
  const unrouted = D.create(form({ n: 3 }));
  unrouted.finishSection(); unrouted.beginNextSection();
  t.ok('with no route supplied the session says so, loudly', unrouted.state().routeChosen === false);
  t.ok('and still delivers a complete module rather than stalling',
       unrouted.state().total === 3 && unrouted.state().phase === 'MODULE');

  const bogus = D.create(form({ n: 3 }), { route: () => 'nonexistent' });
  bogus.finishSection(); bogus.beginNextSection();
  t.ok('a variant the form does not have falls back rather than throwing mid-exam',
       bogus.state().section.variantId === 'advanced');
}

t.section('the clock ends a module the same way the student does');
{
  let t0 = 1000;
  const s = D.create(form({ n: 3 }), { now: () => t0 });
  t.is('the timer counts the section duration', s.state().remainingSec, 2100);
  t0 += 2100 * 1000;
  t.is('and reaches zero, never below', s.state().remainingSec, 0);
  s.expire();
  t.is('expiry ends the module exactly as finishing does — no penalty', s.state().phase, 'BREAK');
}

t.section('per-section calculator policy travels with the section');
{
  const s = D.create(plainForm());
  t.ok('part 1 allows a calculator', s.state().section.calculatorAllowed === true);
  s.finishSection(); s.beginNextSection();
  t.ok('part 2 does not — the section carries its own policy',
       s.state().section.calculatorAllowed === false);
  // Absent means allowed: the column is NOT NULL DEFAULT true in the schema, so
  // a section that says nothing is a section that permits one.
  const noField = D.create({ code: 'X', sections: [{ id: 'a', ordinal: 1, label: 'M', questionCount: 1,
    durationMinutes: 5, questions: [{ id: 'q', ordinal: 1, prompt: 'p', format: 'mcq',
      choices: [{ id: 'A', text: 'a' }], correctAnswer: 'A' }] }] });
  t.ok('a section with no policy field permits one, matching the column default',
       noField.state().section.calculatorAllowed === true);
}

t.section('marking, for review only');
{
  const s = D.create(form({ n: 3 }), { route: () => 'standard' });
  s.answer(' 42 ');              // whitespace a student typed
  s.next(); s.answer('A');       // wrong
  s.finishSection(); s.beginNextSection();
  s.answer('7');
  const rows = s.review();
  t.is('only modules actually sat are marked', [...new Set(rows.map(r => r.sectionKey))], ['1', '2:standard']);
  t.ok('a grid-in answer is marked on its trimmed value, not on stray spaces',
       rows.find(r => r.sectionKey === '1' && r.ordinal === 1).correct === true);
  t.ok('a wrong choice is marked wrong', rows.find(r => r.ordinal === 2).correct === false);
  t.ok('an unanswered question is not credited',
       rows.find(r => r.sectionKey === '1' && r.ordinal === 3).given === null
    && rows.find(r => r.sectionKey === '1' && r.ordinal === 3).correct === false);
  t.ok('the module a routing decision did not choose is never marked',
       !rows.some(r => r.sectionKey === '2:advanced'));
}

t.section('a form with no sections is refused, not half-delivered');
{
  let threw = false;
  try { D.create({ code: 'EMPTY', sections: [] }); } catch { threw = true; }
  t.ok('an empty form throws at creation rather than showing a blank exam', threw);
}

t.done();
