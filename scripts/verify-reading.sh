#!/usr/bin/env bash
# Prove 20260827a_stimulus_reading.sql on a throwaway PostgreSQL, against the
# REAL applied migrations rather than a paraphrase of them.
#
# What it proves:
#   1. the migration applies cleanly on top of the four applied ones
#   2. spec.frame is required and enumerated on every plot
#   3. reading is REQUIRED exactly where the renderer consumes it
#   4. reading is REFUSED everywhere else — the anti-design-switch guard
#   5. a stimulus edit cannot desynchronise a question already referencing it
#   6. the rollback restores the previous behaviour
# Synthetic placeholder content only — never real questions.
set -uo pipefail
REPO="${REPO:-/home/user/Si-Math-Ai}"
PGB=/usr/lib/postgresql/16/bin; PORT=5599; D=/var/lib/postgresql/spine
PSQL="psql -h /tmp -p $PORT -U postgres"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0
ok(){ printf '  \033[32mPASS\033[0m  %s\n' "$1"; pass=$((pass+1)); }
no(){ printf '  \033[31mFAIL\033[0m  %s\n        %s\n' "$1" "${2:-}"; fail=$((fail+1)); }
chk(){ [ "$2" = "$3" ] && ok "$1  ($2)" || no "$1" "expected [$3] got [$2]"; }

su postgres -c "$PGB/pg_ctl -D $D stop -m immediate" >/dev/null 2>&1
rm -rf "$D"; mkdir -p "$D"; chown postgres:postgres "$D"
su postgres -c "$PGB/initdb -D $D -U postgres --auth=trust" >/dev/null 2>&1
su postgres -c "$PGB/pg_ctl -D $D -o '-k /tmp -p $PORT -c listen_addresses=\"\"' -l $D/log start" >/dev/null 2>&1
sleep 2
$PSQL -tAc 'select 1' >/dev/null 2>&1 || { no "harness failed to start"; exit 1; }
ok "harness up ($($PSQL -tAc 'show server_version'))"

# The pieces production supplies that a bare cluster does not: the three
# Supabase roles, the pg_default_acl that makes the migrations' REVOKEs
# meaningful, an auth.users row, and a two-row taxonomy. Inlined so this
# harness is self-contained rather than sourcing a scratchpad file.
cat > "$TMP/setup.sql" <<'SETUPSQL'
\set ON_ERROR_STOP on
drop database if exists spine;
create database spine;
\c spine
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;
-- production's pg_default_acl, reproduced: without it the harness would prove
-- the migrations' REVOKEs unnecessary rather than proving they work.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
create schema if not exists auth;
create table auth.users (id uuid primary key);
insert into auth.users (id) values ('22222222-2222-2222-2222-222222222222');
create type user_role as enum ('user','admin','super_admin','owner');
create or replace function public.has_role_at_least(p_min user_role)
returns boolean language sql stable security definer as $$ select false $$;
revoke all on function public.has_role_at_least(user_role) from public;
create table public.taxonomy_topics (
  id text primary key, display_name text not null,
  taxonomy_version smallint not null default 1, is_active boolean not null default true);
create table public.taxonomy_subtopics (
  id text primary key, topic_id text not null references public.taxonomy_topics(id),
  display_name text not null, taxonomy_version smallint not null default 1, is_active boolean not null default true);
insert into public.taxonomy_topics (id, display_name) values ('ALGEBRA','Algebra');
insert into public.taxonomy_subtopics (id, topic_id, display_name)
  values ('ALG_006','ALGEBRA','Linear Equations & Functions');
SETUPSQL

$PSQL -q -f "$TMP/setup.sql" >/dev/null 2>&1

for m in 20260824a_question_spine 20260824b_exam_forms_insert_guard \
         20260824c_publish_exam_form_revoke_public 20260825a_exam_stimuli; do
  e=$($PSQL -d spine -v ON_ERROR_STOP=1 -q -f "$REPO/supabase/migrations/$m.sql" 2>&1 | grep -cE '^ERROR|FATAL')
  [ "$e" = "0" ] || { no "applied migration $m"; exit 1; }
done
ok "the four applied migrations replay cleanly"

# ── the PREPARED migration ────────────────────────────────────────────────
OUT=$($PSQL -d spine -v ON_ERROR_STOP=1 -q -f "$REPO/supabase/migrations/20260827a_stimulus_reading.sql" 2>&1)
if echo "$OUT" | grep -qE '^ERROR|FATAL'; then no "20260827a applies" "$OUT"; exit 1; fi
ok "20260827a applies cleanly on top of them"

Q="$PSQL -d spine -tA"

# ── a form, a section, and a stimulus factory ─────────────────────────────
$PSQL -d spine -q >/dev/null 2>&1 <<'SQL'
set role service_role;
insert into public.exam_forms (code, exam_code, title) values ('RD','SAT','reading harness');
insert into public.exam_form_sections (form_id, ordinal, variant_id, label, question_count, duration_minutes)
select id, 1, null, 'Module 1', 22, 35 from public.exam_forms where code='RD';
SQL

mkstim () { # $1 alias, $2 kind, $3 spec-or-NULL  → prints 'ok' or 'refused'
  $PSQL -d spine -tA -v ON_ERROR_STOP=1 -c "set role service_role;
    insert into public.exam_stimuli (form_id, kind, label, spec)
    select f.id, '$2', '$1', $3 from public.exam_forms f where f.code='RD'" \
    >/dev/null 2>&1 && echo ok || echo refused
}
mkq () { # $1 ordinal, $2 stimulus-label-or-NULL, $3 reading-or-NULL → ok|refused
  local sref="null" ; [ "$2" != "NULL" ] && sref="(select id from public.exam_stimuli where label='$2')"
  local r="null"    ; [ "$3" != "NULL" ] && r="'$3'"
  $PSQL -d spine -tA -v ON_ERROR_STOP=1 -c "set role service_role;
    insert into public.exam_questions (section_id, ordinal, prompt, question_format, choices,
      correct_answer, explanation, difficulty, topic_id, subtopic_id, status, stimulus_id, reading)
    select s.id, $1, 'HARNESS placeholder', 'mcq',
      jsonb_build_array(jsonb_build_object('id','A','text','a'),jsonb_build_object('id','B','text','b'),
                        jsonb_build_object('id','C','text','c'),jsonb_build_object('id','D','text','d')),
      'A', 'harness placeholder explanation', 'medium', 'ALGEBRA', 'ALG_006', 'draft', $sref, $r
      from public.exam_form_sections s
      join public.exam_forms f on f.id = s.form_id where f.code='RD'" >/dev/null 2>&1 && echo ok || echo refused
}

PLOT='{"frame":"%s","xRange":[0,5],"yRange":[0,5],"curves":[{"points":[[0,0],[1,1]]}]}'
CHART='{"chartType":"bar","categories":["a","b"],"series":[{"name":"s","values":[1,2]}]}'
NL='{"min":-3,"max":3,"segments":[{"from":-1,"to":2,"fromClosed":true,"toClosed":false}]}'
TBL='{"headers":["a","b"],"rows":[["1","2"]]}'

echo; echo "── 2 · spec.frame is required and enumerated on every plot"
chk "a plot without frame is refused" \
    "$(mkstim p-noframe plot "'{\"xRange\":[0,5],\"yRange\":[0,5],\"curves\":[{\"points\":[[0,0],[1,1]]}]}'::jsonb")" refused
chk "a plot with frame='wobbly' is refused" \
    "$(mkstim p-bad plot "'$(printf "$PLOT" wobbly)'::jsonb")" refused
for fr in plane graph data; do
  chk "a plot with frame='$fr' is accepted" "$(mkstim "p-$fr" plot "'$(printf "$PLOT" $fr)'::jsonb")" ok
done
chk "a chart still needs no frame" "$(mkstim c1 chart "'$CHART'::jsonb")" ok
chk "a number line still needs no frame" "$(mkstim n1 number_line "'$NL'::jsonb")" ok
chk "a table still needs no frame" "$(mkstim t1 table "'$TBL'::jsonb")" ok

echo; echo "── 3 · reading is REQUIRED exactly where the renderer consumes it"
chk "plot frame=graph, reading omitted  → refused" "$(mkq 1 p-graph NULL)"  refused
chk "plot frame=graph, reading=value    → stored"  "$(mkq 1 p-graph value)" ok
chk "plot frame=data,  reading omitted  → refused" "$(mkq 2 p-data NULL)"   refused
chk "plot frame=data,  reading=shape    → stored"  "$(mkq 2 p-data shape)"  ok
chk "chart,            reading omitted  → refused" "$(mkq 3 c1 NULL)"       refused
chk "chart,            reading=value    → stored"  "$(mkq 3 c1 value)"      ok

echo; echo "── 4 · and REFUSED everywhere else — the anti-design-switch guard"
chk "plot frame=plane, reading=value    → refused" "$(mkq 4 p-plane value)" refused
chk "plot frame=plane, reading omitted  → stored"  "$(mkq 4 p-plane NULL)"  ok
chk "number line,      reading=shape    → refused" "$(mkq 5 n1 shape)"      refused
chk "number line,      reading omitted  → stored"  "$(mkq 5 n1 NULL)"       ok
chk "table,            reading=value    → refused" "$(mkq 6 t1 value)"      refused
chk "no stimulus,      reading=shape    → refused" "$(mkq 7 NULL shape)"    refused
chk "no stimulus,      reading omitted  → stored"  "$(mkq 7 NULL NULL)"     ok
chk "reading='sideways' is refused by the CHECK" "$(mkq 8 p-graph sideways)" refused

setframe () { # $1 stimulus label, $2 new frame → ok|refused
  $PSQL -d spine -tA -v ON_ERROR_STOP=1 \
    -c "set role service_role" \
    -c "update public.exam_stimuli set spec = jsonb_set(spec, '{frame}', to_jsonb('$2'::text)) where label = '$1'" \
    >/dev/null 2>&1 && echo ok || echo refused
}

echo; echo "── 5 · a stimulus cannot change out from under a question"
chk "frame plane→graph, under a question with NO reading  → refused" "$(setframe p-plane graph)" refused
chk "frame graph→data,  under a question that HAS one     → allowed" "$(setframe p-graph data)"  ok
chk "frame data→plane,  under a question that HAS one     → refused" "$(setframe p-graph plane)" refused

echo; echo "── 6 · nothing is left ambiguous"
AMB=$($Q -q -c "set role service_role" -c "
  select count(*) from public.exam_questions q
    left join public.exam_stimuli st on st.id = q.stimulus_id
   where st.id is not null
     and public.exam_stimulus_needs_reading(st.kind, st.spec)
     and q.reading is null")
chk "no stored question consumes reading without having one" "$AMB" 0
UNU=$($Q -q -c "set role service_role" -c "
  select count(*) from public.exam_questions q
    left join public.exam_stimuli st on st.id = q.stimulus_id
   where q.reading is not null
     and (st.id is null or not public.exam_stimulus_needs_reading(st.kind, st.spec))")
chk "no stored question carries a reading nothing reads" "$UNU" 0

echo; echo "── 7 · the guards are not decorative"
$PSQL -d spine -q -c "drop trigger exam_questions_reading_applies on public.exam_questions" >/dev/null 2>&1
chk "with the trigger dropped, a missing reading IS stored" "$(mkq 21 p-data NULL)"  ok
chk "with the trigger dropped, a meaningless reading IS stored" "$(mkq 22 t1 value)" ok
$PSQL -d spine -q -c "create trigger exam_questions_reading_applies
  before insert or update of reading, stimulus_id on public.exam_questions
  for each row execute function public.exam_question_reading_applies()" >/dev/null 2>&1
chk "and with it restored, both are refused again (a)" "$(mkq 23 p-data NULL)"  refused
chk "and with it restored, both are refused again (b)" "$(mkq 24 t1 value)"     refused

echo; echo "── 8 · the rollback reverses it"
$PSQL -d spine -q -c "delete from public.exam_questions where reading is not null" >/dev/null 2>&1
RB=$($PSQL -d spine -v ON_ERROR_STOP=1 -q -f "$REPO/supabase/migrations/20260827a_stimulus_reading_rollback.sql" 2>&1)
if echo "$RB" | grep -qE '^ERROR|FATAL'; then no "rollback runs" "$RB"; else ok "rollback runs"; fi
COL=$($Q -q -c "select count(*) from information_schema.columns
             where table_schema='public' and table_name='exam_questions' and column_name='reading'")
chk "the reading column is gone" "$COL" 0
TRG=$($Q -q -c "select count(*) from pg_trigger
             where tgname in ('exam_questions_reading_applies','exam_stimuli_reading_still_valid')")
chk "both triggers are gone" "$TRG" 0

echo
printf '%s\n' "──────────────────────────────────────────────"
[ "$fail" = "0" ] && printf '  \033[32mALL %d CHECKS PASSED\033[0m\n' "$pass" \
                  || printf '  \033[31m%d FAILED\033[0m, %d passed\n' "$fail" "$pass"
exit $([ "$fail" = "0" ] && echo 0 || echo 1)
