#!/usr/bin/env bash
# verify-exam-form-draft.sh — load an authored form into a THROWAWAY PostgreSQL,
# run the full pre-flight against it, and draw every figure it contains.
#
#   scripts/verify-exam-form-draft.sh <content-dir> <FORM_CODE> <EXAM_CODE>
#
# ⚠️  THE CONTENT IS NOT IN THIS REPOSITORY. <content-dir> is the author's, and
#     holds payload.json and authored.json. See build-exam-form-draft.py.
#
# WHY A LOCAL DATABASE
# --------------------
# preflight-exam-form.mjs reports on rows, so the rows must exist before it can
# say anything about them — and they must NOT exist in production before the
# report has been read and accepted. A throwaway instance is the only way to
# have both. Nothing here touches production, and the script holds no
# credentials that could.
#
# WHAT IT PROVES, IN ORDER
#   1. every migration applies to a clean database, in order
#   2. the authored rows are ACCEPTED by the live constraints — which is only
#      evidence because §4 below shows the same constraints refusing malformed
#      ones
#   3. the pre-flight's structural checks come back clean, or say why not
#   4. every stimulus draws from its own row, through the shipped renderer,
#      with nothing supplied out of band
set -uo pipefail
REPO="${REPO:-$(cd "$(dirname "$0")/.." && pwd)}"
DIR="${1:?content directory required}"
FORM="${2:-DSAT-2026-A}"
EXAM="${3:-SAT_FULL}"
PGB=/usr/lib/postgresql/16/bin; PORT=${PGPORT:-5601}; D=/var/lib/postgresql/examdraft
PSQL="psql -h /tmp -p $PORT -U postgres"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

step () { printf '  %-48s' "$1"; shift; if "$@" >"$TMP/step.log" 2>&1; then echo "ok"; else
  echo "FAILED"; sed -n '1,12p' "$TMP/step.log"; exit 1; fi; }

su postgres -c "$PGB/pg_ctl -D $D stop -m immediate" >/dev/null 2>&1
rm -rf "$D"; mkdir -p "$D"; chown postgres:postgres "$D"
su postgres -c "$PGB/initdb -D $D -U postgres --auth=trust" >/dev/null 2>&1
su postgres -c "$PGB/pg_ctl -D $D -o '-k /tmp -p $PORT -c listen_addresses=\"\"' -l $D/log start" >/dev/null 2>&1
for i in $(seq 20); do $PSQL -c 'select 1' >/dev/null 2>&1 && break; sleep 0.5; done

cat > "$TMP/setup.sql" <<'SETUPSQL'
\set ON_ERROR_STOP on
drop database if exists examdraft;
create database examdraft;
\c examdraft
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;
-- production's pg_default_acl, reproduced: without it this harness would prove
-- the migrations' REVOKEs unnecessary rather than proving they work.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
create schema if not exists auth;
create table auth.users (id uuid primary key);
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
SETUPSQL

# The taxonomy comes from taxonomy.js — the SAME registry the analyzer uses,
# never a hand-written stand-in. A seed that drifted from it would let a
# question pass here on a subtopic production does not have.
node -e '
const T=require(process.argv[1]+"/taxonomy.js"), fs=require("fs");
const e=s=>"\x27"+String(s).replace(/\x27/g,"\x27\x27")+"\x27";
fs.writeFileSync(process.argv[2],
  "insert into public.taxonomy_topics (id, display_name) values\n" +
  Object.values(T.TOPICS).map(t=>"  ("+e(t.id)+","+e(t.displayName)+")").join(",\n") + ";\n" +
  "insert into public.taxonomy_subtopics (id, topic_id, display_name) values\n" +
  Object.values(T.SUBTOPICS).map(s=>"  ("+e(s.id)+","+e(s.topicId)+","+e(s.displayName)+")").join(",\n") + ";\n");
' "$REPO" "$TMP/taxonomy.sql" || { echo "taxonomy seed generation failed"; exit 1; }

echo "── harness ──"
step "throwaway database, roles, taxonomy tables" $PSQL -q -f "$TMP/setup.sql"
step "taxonomy seeded from taxonomy.js" $PSQL -d examdraft -q -v ON_ERROR_STOP=1 -f "$TMP/taxonomy.sql"
for m in 20260824a_question_spine 20260824b_exam_forms_insert_guard \
         20260824c_publish_exam_form_revoke_public 20260825a_exam_stimuli \
         20260827a_stimulus_reading 20260827b_plot_figures; do
  step "migration $m" $PSQL -d examdraft -q -v ON_ERROR_STOP=1 -f "$REPO/supabase/migrations/$m.sql"
done
step "generate the DRAFT insert" python3 "$REPO/scripts/build-exam-form-draft.py" "$DIR" "$FORM" "$TMP/draft.sql"
step "load it ($FORM, draft)" $PSQL -d examdraft -q -v ON_ERROR_STOP=1 -f "$TMP/draft.sql"

echo
echo "── what landed ──"
$PSQL -d examdraft -q -c "
select (select count(*) from public.exam_forms)         as forms,
       (select count(*) from public.exam_form_sections) as sections,
       (select count(*) from public.exam_questions)     as questions,
       (select count(*) from public.exam_stimuli)       as stimuli,
       (select count(*) from public.exam_questions where stimulus_id is not null) as with_stimulus,
       (select count(*) from public.exam_questions where reading is not null)     as with_reading,
       (select status from public.exam_forms where code='$FORM')                  as status;"

echo "── the constraints could have refused this (each line must say 'refused') ──"
F="(select id from public.exam_forms where code='$FORM')"
try () { printf '  %-50s' "$1"; shift
  if echo "$*" | $PSQL -d examdraft -q -t -A -v ON_ERROR_STOP=1 >/dev/null 2>&1
  then echo "ACCEPTED ← guard not working"; else echo "refused"; fi; }
try "a plot with no figures[]" "set role service_role; insert into public.exam_stimuli (form_id,kind,label,spec) values ($F,'plot','_BAD1','{\"frame\":\"plane\",\"xRange\":[0,4],\"yRange\":[0,4],\"curves\":[{\"points\":[[0,0],[1,1]]}]}'::jsonb);"
try "a plot with no frame"     "set role service_role; insert into public.exam_stimuli (form_id,kind,label,spec) values ($F,'plot','_BAD2','{\"xRange\":[0,4],\"yRange\":[0,4],\"curves\":[{\"points\":[[0,0],[1,1]]}],\"figures\":[{\"mode\":\"curve\"}]}'::jsonb);"
try "a figure mode its frame forbids" "set role service_role; insert into public.exam_stimuli (form_id,kind,label,spec) values ($F,'plot','_BAD3','{\"frame\":\"plane\",\"xRange\":[0,4],\"yRange\":[0,4],\"curves\":[{\"points\":[[0,0],[1,1]]}],\"figures\":[{\"mode\":\"scatter\"}]}'::jsonb);"
try "a reading where nothing renders by it" "set role service_role; update public.exam_questions set reading='value' where stimulus_id in (select id from public.exam_stimuli where kind='table') and reading is null;"
try "clearing a reading a figure depends on" "set role service_role; update public.exam_questions set reading=null where reading is not null;"

echo
echo "── pre-flight ($FORM / $EXAM) ──"
node "$REPO/scripts/preflight-exam-form.mjs" "$FORM" "$EXAM" > "$TMP/preflight.sql" || exit 1
$PSQL -d examdraft -q -f "$TMP/preflight.sql" > "$TMP/preflight.out" 2>&1
sed -n '1,4p' "$TMP/preflight.out"
grep -E "^ (ERROR|WARNING|OK)" "$TMP/preflight.out" \
  | awk -F'|' '{gsub(/ /,"",$1); gsub(/^ | $/,"",$2); print $1"  "$2}' | sort | uniq -c | sort -rn \
  | sed 's/^/  /'
# The full report goes to the CONTENT directory, never into this repository:
# it names questions by ordinal and would be one more thing to keep out of a
# public tree by remembering to.
cp "$TMP/preflight.out" "$DIR/preflight.out" 2>/dev/null \
  && echo "  full report: $DIR/preflight.out"

echo
echo "── every figure draws from its own row ──"
$PSQL -d examdraft -q -t -A -c "
select coalesce(json_agg(row_to_json(r)), '[]'::json) from (
  select q.id::text as qid, s.ordinal as section, s.variant_id, q.ordinal, q.reading,
         st.id::text as sid, st.kind, st.spec
    from public.exam_questions q
    join public.exam_form_sections s on s.id = q.section_id
    join public.exam_stimuli st on st.id = q.stimulus_id
   order by s.ordinal, s.variant_id nulls first, q.ordinal) r;" > "$TMP/rows.json"
node "$REPO/scripts/check-exam-form-renders.mjs" "$TMP/rows.json" | sed 's/^/  /'
