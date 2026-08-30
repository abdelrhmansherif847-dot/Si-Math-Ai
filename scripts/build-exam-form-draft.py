#!/usr/bin/env python3
"""build-exam-form-draft.py — emit the DRAFT Spine insert for an authored form.

  python3 scripts/build-exam-form-draft.py <content-dir> <FORM_CODE> <out.sql> [EXAM_CODE]

⚠️  THE CONTENT IS NOT IN THIS REPOSITORY, AND MUST NOT BE.
    This repository is public. Item text, options and answer keys live with the
    author, outside it. This script is the TOOLING: it reads two files from a
    directory you point it at and writes SQL you review before running.

      <content-dir>/payload.json    the items — prompt, format, choices, answer,
                                    explanation, difficulty, topic, subtopic,
                                    stimulus kind and raw spec
      <content-dir>/authored.json   the schema decisions — spec.frame and
                                    spec.figures[] per stimulus, reading per
                                    question, and which questions SHARE one

WHY IT MERGES TWO FILES
-----------------------
They were authored at different times. `payload.json` predates 20260827a/b, so
its specs carry no `frame` and no `figures[]` and the database will refuse
them. `authored.json` is where those decisions were taken, with a reason
recorded against each. Merging is not a convenience — it is the only way to
build a row the schema will accept.

WHY IT DEDUPLICATES
-------------------
Some stimuli are referenced by more than one question — the same figure asked
about two ways. An earlier converter inserted one stimulus row per item, which
would have duplicated them and destroyed the shared-stimulus property that
`exam_questions.reading` exists to express. Each distinct stimulus is inserted
exactly once here and every user points at it.

WHY THE SHAPE COMES FROM THE REGISTRY
------------------------------------
This script used to hard-code the DSAT: three sections named M1/M2S/M2A, 22
questions each, 35 minutes each, exam_code 'SAT_FULL', and the form title as a
string literal. None of that is a property of the TOOL — it is a property of
one exam, and EST Math 1 (one section, 50 items, 75 minutes) and ACT Math (one
section, 45 items, 50 minutes) cannot be built by a script that believes every
exam is the SAT.

So the plan is read from exam-registry.js, which already holds it, by shelling
out to node. That keeps ONE source of truth for what an exam is: a form whose
sections disagreed with the registry could otherwise be built, imported and
delivered with a timer that came from somewhere else.

SECTION TAGS are derived, not configured: ordinal, plus the first letter of the
variant when a module has variants. The DSAT therefore still yields exactly
M1, M2S and M2A, and the payload.json already authored against those keys still
builds byte-for-byte. A single-section exam yields M1.

WHY IT CHECKS THE ANSWER LETTERS
--------------------------------
20260830c widened the database to store three id sets — A-D, A-E and F-K — and
deliberately refused to learn which belongs to which exam and ordinal. The
registry owns that, and this is the last place a form can be stopped before the
rows exist. An ACT question lettered A-D would be STORABLE and wrong: the
database would take it, the page would render it, and only a student sitting
the exam would notice the letters were not the ones on the real answer sheet.

Everything lands as DRAFT. Nothing here publishes: publish_exam_form() is a
separate, irreversible act, gated on a pre-flight you have read.
"""
import io, json, sys, os, subprocess

if len(sys.argv) < 2:
    sys.exit(__doc__.strip().split('\n')[2].strip())
DIR  = sys.argv[1]
FORM = sys.argv[2] if len(sys.argv) > 2 else 'DSAT-2026-A'
OUT  = sys.argv[3] if len(sys.argv) > 3 else 'exam-form-draft.sql'
EXAM = sys.argv[4] if len(sys.argv) > 4 else 'SAT_FULL'
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def registry(exam):
    """The exam's shape, straight out of exam-registry.js.

    Shelling out to node rather than restating the plan here is the whole
    point: a second description of what an exam is would be free to disagree
    with the one the timer and the delivery engine read.
    """
    js = '''
      const fs = require('fs'), vm = require('vm');
      const g = {}; g.globalThis = g; vm.createContext(g);
      vm.runInContext(fs.readFileSync(%s, 'utf8'), g);
      const R = g.SiExamRegistry, code = %s;
      const e = R.get(code);
      if (!e) { console.error('unknown exam ' + code); process.exit(2); }
      if (!e.modules) { console.error(code + ' is dynamic and holds no form'); process.exit(2); }
      const sections = [];
      e.modules.forEach((m) => {
        const vs = m.variants && m.variants.length ? m.variants : [null];
        vs.forEach((v) => sections.push({
          tag: 'M' + m.ordinal + (v ? v.id[0].toUpperCase() : ''),
          ordinal: m.ordinal,
          variantId: v ? v.id : null,
          label: m.label,
          questionCount: m.questions,
          durationMinutes: m.durationMinutes,
          calculatorAllowed: e.calculator.allowed,
        }));
      });
      const conv = R.answerConvention(code);
      console.log(JSON.stringify({
        examCode: code, displayName: e.displayName, sections: sections,
        gridInAllowed: R.gridInAllowed(code),
        letters: sections.length === 1
          ? Object.fromEntries(Array.from({ length: e.modules[0].questions },
              (_, i) => [i + 1, R.choiceIdsFor(code, i + 1)]))
          : null,
        convention: conv ? conv.id : null,
      }));
    ''' % (json.dumps(os.path.join(REPO, 'exam-registry.js')), json.dumps(exam))
    out = subprocess.run(['node', '-e', js], capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit('registry: ' + (out.stderr.strip() or 'failed to read the exam plan'))
    return json.loads(out.stdout)


PLAN = registry(EXAM)

P = json.load(io.open(os.path.join(DIR, 'payload.json'), encoding='utf-8'))
D = json.load(io.open(os.path.join(DIR, 'authored.json'), encoding='utf-8'))

items    = {'%s:%s' % (x['s'], x['o']): x for x in P}
stimuli  = {s['key']: s for s in D['stimuli']}
readings = {q['key']: q.get('reading') for q in D['questions']}
owner    = {}                                    # question key -> stimulus key
for s in D['stimuli']:
    for k in s['used_by']:
        owner[k] = s['key']


def q(s):
    return 'null' if s is None else "'" + str(s).replace("'", "''") + "'"
def j(o):
    return q(json.dumps(o, ensure_ascii=False)) + '::jsonb'

# ── every reference resolves, before a line of SQL is written ───────────────
for key in items:
    if key in owner:
        assert owner[key] in stimuli, key + ' references an unknown stimulus'
    assert key in readings, key + ' has no authored reading decision'
for s in stimuli.values():
    for k in s['used_by']:
        assert k in items, s['key'] + ' is used by an unknown question ' + k

TITLE = D.get('title') or ('%s — Si Math AI %s' % (PLAN['displayName'], FORM))

out = ['-- DRAFT insert for %s (%s). Nothing here publishes.' % (FORM, EXAM),
       '-- Section plan read from exam-registry.js, not restated here.',
       'begin;',
       'set local role service_role;',
       "insert into public.exam_forms (code, exam_code, title) values (%s, %s, %s);"
       % (q(FORM), q(EXAM), q(TITLE))]

for sec in PLAN['sections']:
    out.append(
        'insert into public.exam_form_sections '
        '(form_id, ordinal, variant_id, label, question_count, duration_minutes, calculator_allowed)\n'
        '  select id, %d, %s, %s, %d, %d, %s from public.exam_forms where code=%s;'
        % (sec['ordinal'], q(sec['variantId']), q(sec['label']),
           sec['questionCount'], sec['durationMinutes'],
           'true' if sec['calculatorAllowed'] else 'false', q(FORM)))

# ── stimuli: each distinct row once, labelled by its authored key ───────────
for key in sorted(stimuli):
    s = stimuli[key]
    out.append(
        'insert into public.exam_stimuli (form_id, kind, label, spec)\n'
        '  select f.id, %s, %s, %s from public.exam_forms f where f.code=%s;'
        % (q(s['kind']), q(key), j(s['spec']), q(FORM)))

def stim_ref(key):
    return ('(select st.id from public.exam_stimuli st '
            'join public.exam_forms f on f.id=st.form_id '
            'where f.code=%s and st.label=%s)' % (q(FORM), q(key)))

for sec in PLAN['sections']:
    tag = sec['tag']
    keys = sorted((k for k in items if k.startswith(tag + ':')),
                  key=lambda k: int(k.split(':')[1]))
    assert len(keys) == sec['questionCount'], \
        '%s has %d items, expected %d' % (tag, len(keys), sec['questionCount'])
    sect = ('(select s.id from public.exam_form_sections s '
            'join public.exam_forms f on f.id=s.form_id '
            'where f.code=%s and s.ordinal=%d and s.variant_id is not distinct from %s)'
            % (q(FORM), sec['ordinal'], q(sec['variantId'])))
    for key in keys:
        it = items[key]
        # ── the answer sheet, checked before the row exists ──────────────────
        # 20260830c will accept any of its three id sets; only the registry
        # knows which one this exam wants on this ordinal, and this is the last
        # moment a wrong one can be stopped.
        if it['f'] == 'grid_in':
            assert PLAN['gridInAllowed'], \
                '%s is a grid-in, and %s permits no student-produced responses' % (key, EXAM)
        elif it['f'] == 'mcq':
            want = (PLAN['letters'] or {}).get(str(it['o']))
            got = [c['id'] for c in (it.get('c') or [])]
            if want is not None:
                assert got == want, \
                    '%s is lettered %s; %s question %d must be %s' \
                    % (key, ''.join(got) or '(none)', EXAM, it['o'], ''.join(want))
            assert it['a'] in got, \
                '%s answers %r, which is not one of its own options %s' \
                % (key, it['a'], ''.join(got))
        out.append(
            'insert into public.exam_questions (section_id, ordinal, prompt, question_format, '
            'choices, correct_answer, explanation, difficulty, topic_id, subtopic_id, '
            'stimulus_id, reading) values (\n  %s, %d, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);'
            % (sect, it['o'], q(it['p']), q(it['f']),
               j(it['c']) if it.get('c') else 'null',
               q(it['a']), q(it.get('e')), q(it.get('d')), q(it['t']), q(it.get('u')),
               stim_ref(owner[key]) if key in owner else 'null',
               q(readings.get(key))))

out.append('commit;')
io.open(OUT, 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('%s: %s / %s — %d stimuli, %d questions across %d section(s), %d shared'
      % (OUT, FORM, EXAM, len(stimuli), len(items), len(PLAN['sections']),
         sum(1 for s in stimuli.values() if len(s['used_by']) > 1)))
