#!/usr/bin/env python3
"""build-exam-form-draft.py — emit the DRAFT Spine insert for an authored form.

  python3 scripts/build-exam-form-draft.py <content-dir> <FORM_CODE> <out.sql>

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

Everything lands as DRAFT. Nothing here publishes: publish_exam_form() is a
separate, irreversible act, gated on a pre-flight you have read.
"""
import io, json, sys, os

if len(sys.argv) < 2:
    sys.exit(__doc__.strip().split('\n')[2].strip())
DIR  = sys.argv[1]
FORM = sys.argv[2] if len(sys.argv) > 2 else 'DSAT-2026-A'
OUT  = sys.argv[3] if len(sys.argv) > 3 else 'exam-form-draft.sql'

P = json.load(io.open(os.path.join(DIR, 'payload.json'), encoding='utf-8'))
D = json.load(io.open(os.path.join(DIR, 'authored.json'), encoding='utf-8'))

items    = {'%s:%s' % (x['s'], x['o']): x for x in P}
stimuli  = {s['key']: s for s in D['stimuli']}
readings = {q['key']: q.get('reading') for q in D['questions']}
owner    = {}                                    # question key -> stimulus key
for s in D['stimuli']:
    for k in s['used_by']:
        owner[k] = s['key']

SECTIONS = [('M1',  1, 'null',        'Module 1'),
            ('M2S', 2, "'standard'",  'Module 2'),
            ('M2A', 2, "'advanced'",  'Module 2')]

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

out = ['-- DRAFT insert for %s. Nothing here publishes.' % FORM,
       'begin;',
       'set local role service_role;',
       "insert into public.exam_forms (code, exam_code, title) values "
       "(%s, 'SAT_FULL', 'Digital SAT Math — Si Math AI form A');" % q(FORM)]

for _, ordn, var, label in SECTIONS:
    out.append(
        'insert into public.exam_form_sections '
        '(form_id, ordinal, variant_id, label, question_count, duration_minutes, calculator_allowed)\n'
        '  select id, %d, %s, %s, 22, 35, true from public.exam_forms where code=%s;'
        % (ordn, var, q(label), q(FORM)))

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

for tag, ordn, var, _ in SECTIONS:
    keys = sorted((k for k in items if k.startswith(tag + ':')),
                  key=lambda k: int(k.split(':')[1]))
    assert len(keys) == 22, '%s has %d items, expected 22' % (tag, len(keys))
    sect = ('(select s.id from public.exam_form_sections s '
            'join public.exam_forms f on f.id=s.form_id '
            'where f.code=%s and s.ordinal=%d and s.variant_id is not distinct from %s)'
            % (q(FORM), ordn, var))
    for key in keys:
        it = items[key]
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
print('%s: %d stimuli, %d questions, %d shared'
      % (OUT, len(stimuli), len(items),
         sum(1 for s in stimuli.values() if len(s['used_by']) > 1)))
