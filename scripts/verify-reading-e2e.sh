#!/usr/bin/env bash
# END-TO-END PROOF that the render path is
#     Question + Stimulus  ->  Figure
# and not
#     Stimulus  ->  Figure
#
# It builds a real Spine database with the PREPARED migration applied, stores
# ONE exam_stimuli row referenced by TWO exam_questions rows whose `reading`
# differs, exports exactly what a client would fetch, renders both questions in
# a real browser through renderForQuestion(), and checks the figures.
#
# Then it SWAPS the two readings in the database and does it all again. If the
# figures swap while the stimulus row does not change, the figure is following
# the question — which is the whole claim.
#
# Synthetic placeholder content only; never real questions.
set -uo pipefail
REPO="${REPO:-/home/user/Si-Math-Ai}"
EVAL="${EVAL:-$REPO/scripts}"
PGB=/usr/lib/postgresql/16/bin; PORT=5599; D=/var/lib/postgresql/spine
PSQL="psql -h /tmp -p $PORT -U postgres"
export NODE_PATH="${NODE_PATH:-/opt/node22/lib/node_modules}"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0
ok(){ printf '  \033[32mPASS\033[0m  %s\n' "$1"; pass=$((pass+1)); }
no(){ printf '  \033[31mFAIL\033[0m  %s\n        %s\n' "$1" "${2:-}"; fail=$((fail+1)); }

# ── 1 · a real database ────────────────────────────────────────────────────
su postgres -c "$PGB/pg_ctl -D $D stop -m immediate" >/dev/null 2>&1
rm -rf "$D"; mkdir -p "$D"; chown postgres:postgres "$D"
su postgres -c "$PGB/initdb -D $D -U postgres --auth=trust" >/dev/null 2>&1
su postgres -c "$PGB/pg_ctl -D $D -o '-k /tmp -p $PORT -c listen_addresses=\"\"' -l $D/log start" >/dev/null 2>&1
sleep 2
sed -n "/^cat > \"\$TMP\/setup.sql\" <<'SETUPSQL'\$/,/^SETUPSQL\$/p" "$REPO/scripts/verify-reading.sh" \
  | sed '1d;$d' > "$TMP/setup.sql"
$PSQL -q -f "$TMP/setup.sql" >/dev/null 2>&1
for m in 20260824a_question_spine 20260824b_exam_forms_insert_guard \
         20260824c_publish_exam_form_revoke_public 20260825a_exam_stimuli \
         20260827a_stimulus_reading; do
  $PSQL -d spine -v ON_ERROR_STOP=1 -q -f "$REPO/supabase/migrations/$m.sql" >/dev/null 2>&1 \
    || { no "migration $m applies"; exit 1; }
done
ok "a Spine database with the PREPARED migration applied"

$PSQL -d spine -q -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<'SQL'
set role service_role;
insert into public.exam_forms (code, exam_code, title) values ('E2E','SAT','end-to-end harness');
insert into public.exam_form_sections (form_id, ordinal, variant_id, label, question_count, duration_minutes)
select id, 1, null, 'Module 1', 22, 35 from public.exam_forms where code='E2E';
insert into public.exam_stimuli (form_id, kind, label, spec)
select f.id, 'plot', 'shared-cubic', jsonb_build_object(
  'frame','graph',
  'xRange', jsonb_build_array(-0.7, 4.7), 'yRange', jsonb_build_array(-1.6, 5),
  'xLabel','x','yLabel','y',
  'curves', jsonb_build_array(jsonb_build_object('points',
    (select jsonb_agg(jsonb_build_array(round(x::numeric,2),
       round((x*x*x/3 - 2*x*x + 3*x + 1)::numeric, 3)))
       from generate_series(-0.6, 4.6, 0.2) x))))
from public.exam_forms f where f.code='E2E';
insert into public.exam_questions (section_id, ordinal, prompt, question_format, choices,
  correct_answer, explanation, difficulty, topic_id, subtopic_id, status, stimulus_id, reading)
select s.id, q.ord, q.prompt, 'mcq',
  jsonb_build_array(jsonb_build_object('id','A','text',q.a), jsonb_build_object('id','B','text',q.b),
                    jsonb_build_object('id','C','text',q.c), jsonb_build_object('id','D','text',q.d)),
  q.ans, 'HARNESS placeholder explanation.', 'medium', 'ALGEBRA', 'ALG_006', 'draft',
  (select id from public.exam_stimuli where label='shared-cubic'), q.reading
from public.exam_form_sections s
join public.exam_forms f on f.id = s.form_id and f.code='E2E'
cross join (values
  (14,'The graph of y = f(x) is shown in the xy-plane. How many turning points does the graph have?',
      'One','Two','Three','Four','B','shape'),
  (15,'The graph of y = f(x) is shown in the xy-plane. What is the value of f(3)?',
      '0','1','2','3','B','value')
) as q(ord, prompt, a, b, c, d, ans, reading);
SQL
N=$($PSQL -d spine -tA -q -c "set role service_role" -c \
    "select count(distinct stimulus_id) || '/' || count(*) from public.exam_questions")
[ "$N" = "1/2" ] && ok "one stimulus, two questions ($N)" || { no "fixture" "got $N"; exit 1; }

# ── 2 · export exactly what a client fetches ───────────────────────────────
dump () {
  $PSQL -d spine -tA -q -c "set role service_role" -c "
    select jsonb_pretty(jsonb_agg(row order by row->>'ordinal')) from (
      select jsonb_build_object('id', q.id, 'ordinal', q.ordinal, 'prompt', q.prompt,
        'choices', q.choices, 'reading', q.reading,
        'stimulus', jsonb_build_object('id', st.id, 'kind', st.kind, 'spec', st.spec)) as row
      from public.exam_questions q join public.exam_stimuli st on st.id = q.stimulus_id
      order by q.ordinal) t;" > "$1"
}
run () { # $1 payload, $2 page, $3 label
  ( cd "$EVAL" && python3 build-reading-e2e.py "$1" "$2" >/dev/null && node check-reading-e2e.cjs "$2" "$3" ) 
}

dump "$TMP/a.json"
if run "$TMP/a.json" "e2e-preview.html" original > "$TMP/a.log" 2>&1; then
  ok "original: $(grep -c '^PASS' "$TMP/a.log") browser checks"
else no "original render" "$(grep '^FAIL' "$TMP/a.log" | head -3)"; fi

# ── 3 · swap the readings IN THE DATABASE ──────────────────────────────────
$PSQL -d spine -q -c "set role service_role" -c "
  update public.exam_questions
     set reading = case reading when 'shape' then 'value' else 'shape' end
   where stimulus_id = (select id from public.exam_stimuli where label='shared-cubic')" >/dev/null 2>&1
ok "readings swapped in the database"

dump "$TMP/b.json"
SAME=$(python3 - "$TMP/a.json" "$TMP/b.json" <<'PY'
import json,sys
a=json.load(open(sys.argv[1])); b=json.load(open(sys.argv[2]))
same = (a[0]['stimulus']['id']==b[0]['stimulus']['id']
        and json.dumps(a[0]['stimulus']['spec'],sort_keys=True)
         == json.dumps(b[0]['stimulus']['spec'],sort_keys=True))
swapped = {q['ordinal']:q['reading'] for q in a} != {q['ordinal']:q['reading'] for q in b}
print('yes' if same and swapped else 'no')
PY
)
[ "$SAME" = "yes" ] && ok "the stimulus row is unchanged; only the questions moved" \
                    || no "the swap changed the stimulus too"

if run "$TMP/b.json" "e2e-preview-swapped.html" swapped > "$TMP/b.log" 2>&1; then
  ok "swapped: $(grep -c '^PASS' "$TMP/b.log") browser checks"
else no "swapped render" "$(grep '^FAIL' "$TMP/b.log" | head -3)"; fi

# ── 4 · THE CLAIM: the grid followed the question, not the stimulus ────────
VERDICT=$(python3 - "$EVAL/shots4/original.json" "$EVAL/shots4/swapped.json" <<'PY'
import json,sys
a=json.load(open(sys.argv[1])); b=json.load(open(sys.argv[2]))
lines=[]
for k in sorted(a, key=int):
    lines.append("Q%s: %s/%s -> %s/%s" % (k, a[k]['reading'], 'grid' if a[k]['grid'] else 'none',
                                          b[k]['reading'], 'grid' if b[k]['grid'] else 'none'))
follows = all(v['grid'] == (v['reading']=='value') for d in (a,b) for v in d.values())
moved   = any(a[k]['grid'] != b[k]['grid'] for k in a)
print(('FOLLOWS' if follows and moved else 'BROKEN') + ' | ' + ' ; '.join(lines))
PY
)
case "$VERDICT" in
  FOLLOWS*) ok "the grid follows the QUESTION's reading  ${VERDICT#FOLLOWS | }" ;;
  *)        no "the grid did not follow the question" "$VERDICT" ;;
esac

echo
printf '%s\n' "──────────────────────────────────────────────"
[ "$fail" = "0" ] && printf '  \033[32mALL %d STAGES PASSED\033[0m\n' "$pass" \
                  || printf '  \033[31m%d FAILED\033[0m, %d passed\n' "$fail" "$pass"
exit $([ "$fail" = "0" ] && echo 0 || echo 1)
