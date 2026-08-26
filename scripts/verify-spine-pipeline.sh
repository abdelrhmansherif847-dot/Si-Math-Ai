#!/usr/bin/env bash
# =====================================================================
# verify-spine-pipeline.sh — prove the Question Spine end-to-end
# =====================================================================
# Usage:  scripts/verify-spine-pipeline.sh <EXAM_CODE>
#         (SAT_FULL · SAT_MODULE_1 · SAT_MODULE_2 · EST_MATH_1 ·
#          EST_MATH_2_L1 · ACT_MATH)
#
# WHY THIS EXISTS. publish_exam_form() is irreversible and a published form is
# permanent — its code is burned and its content immutable. So the pipeline had
# never actually been run: exam_forms held zero rows, and the only way to try it
# was to do the one thing that cannot be undone, in production.
#
# This runs the whole path against a THROWAWAY PostgreSQL instead: the four
# Spine migrations applied to an empty database, a complete synthetic form built
# from the registry's own expectation, the pre-flight, the publish gate, the
# immutability guards, and the mistakes an author could realistically make.
#
# SYNTHETIC CONTENT ONLY. Every prompt is the literal string "HARNESS
# placeholder". Real exam content and answer keys must never enter this
# repository — it is public. Authored content belongs in the Spine's draft
# state, nowhere else.
#
# NOT part of `node tests/run-all.mjs`, deliberately: it needs a PostgreSQL
# server, and the repo has no database in CI by design. Manual, like
# check-migration-parity.sh. Requires root (initdb refuses to run as root, so it
# su's to the postgres user) and /usr/lib/postgresql/16.
#
# It reproduces production's pg_default_acl before applying anything. Without
# that the harness would prove the migrations' REVOKEs unnecessary rather than
# proving they work — which is exactly how an earlier harness missed the PUBLIC
# grant that became finding B5.
#
# Exit status is 0 only when every check passed.
# =====================================================================
# Prove the Question Spine end-to-end for one exam code, on a throwaway
# PostgreSQL. Synthetic placeholder content only — never real questions.
#
# Usage: verify-spine.sh <EXAM_CODE>
set -uo pipefail
REPO="${REPO:-/home/user/Si-Math-Ai}"; CODE="${1:?exam code required}"
PGB=/usr/lib/postgresql/16/bin; PORT=5599; D=/var/lib/postgresql/spine
PSQL="psql -h /tmp -p $PORT -U postgres"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
SETUP="$TMP/setup.sql"
cat > "$SETUP" <<'SETUPSQL'
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
pass=0; fail=0
ok()  { printf '  \033[32m✅\033[0m %s\n' "$1"; pass=$((pass+1)); }
no()  { printf '  \033[31m❌\033[0m %s\n     %s\n' "$1" "${2:-}"; fail=$((fail+1)); }
chk() { [ "$2" = "$3" ] && ok "$1" || no "$1" "expected [$3] got [$2]"; }

# ── 0 · a clean server ─────────────────────────────────────────────────────
su postgres -c "$PGB/pg_ctl -D $D stop -m immediate" >/dev/null 2>&1
rm -rf "$D"; mkdir -p "$D"; chown postgres:postgres "$D"
su postgres -c "$PGB/initdb -D $D -U postgres --auth=trust" >/dev/null 2>&1
su postgres -c "$PGB/pg_ctl -D $D -o '-k /tmp -p $PORT -c listen_addresses=\"\"' -l $D/log start" >/dev/null 2>&1
sleep 2
$PSQL -tAc 'select 1' >/dev/null 2>&1 && ok "harness up ($($PSQL -tAc 'show server_version'))" || { no "harness failed to start"; exit 1; }

$PSQL -q -f "$SETUP" >/dev/null 2>&1
for m in 20260824a_question_spine 20260824b_exam_forms_insert_guard \
         20260824c_publish_exam_form_revoke_public 20260825a_exam_stimuli; do
  e=$($PSQL -d spine -v ON_ERROR_STOP=1 -q -f "$REPO/supabase/migrations/$m.sql" 2>&1 | grep -cE '^ERROR|^psql.*FATAL')
  [ "$e" = "0" ] && ok "migration applied: $m" || no "migration failed: $m"
done

# ── 1 · the expectation drives everything ──────────────────────────────────
EXP=$(cd "$REPO" && node scripts/gen-exam-expectation.mjs "$CODE" | tr -d '\n ')
[ -n "$EXP" ] && ok "expectation derived from the registry for $CODE" || { no "no expectation"; exit 1; }
SLOTS=$(node -e "
const e=JSON.parse(process.argv[1]);const r=[];
for(const m of e.modules){ if(!m.variants||!m.variants.length) r.push([m.ordinal,null,m.questions,m.durationMinutes]);
  else for(const v of m.variants) r.push([m.ordinal,v,m.questions,m.durationMinutes]); }
console.log(JSON.stringify(r));" "$EXP")
NSLOT=$(node -e "console.log(JSON.parse(process.argv[1]).length)" "$SLOTS")
NQ=$(node -e "console.log(JSON.parse(process.argv[1]).reduce((a,s)=>a+s[2],0))" "$SLOTS")
ok "$CODE → $NSLOT section slot(s), $NQ questions to author"

# ── 2 · build a correct form from the expectation ──────────────────────────
build () { # $1 = form code, $2 = JSON slot array
  $PSQL -d spine -q -v ON_ERROR_STOP=1 -v code="$1" -v slots="$2" <<'SQL' 2>&1 | grep -oE '^ERROR:.*' | head -1
set role service_role;
insert into public.exam_forms (code, exam_code, title)
select :'code', current_setting('spine.exam'), 'harness ' || :'code';
insert into public.exam_form_sections (form_id, ordinal, variant_id, label, question_count, duration_minutes)
select f.id, (s->>0)::int, s->>1, 'Module ' || (s->>0), (s->>2)::int, (s->>3)::int
  from public.exam_forms f, jsonb_array_elements(:'slots'::jsonb) s where f.code = :'code';
insert into public.exam_questions (section_id, ordinal, prompt, question_format, choices, correct_answer,
  explanation, difficulty, topic_id, subtopic_id, status, originality_attested_at, originality_attested_by)
select sec.id, g.n,
  'HARNESS placeholder ' || coalesce(sec.variant_id,'m'||sec.ordinal) || ' Q' || g.n,
  case when g.n % 5 = 0 then 'grid_in' else 'mcq' end,
  case when g.n % 5 = 0 then null else jsonb_build_array(
    jsonb_build_object('id','A','text','a'), jsonb_build_object('id','B','text','b'),
    jsonb_build_object('id','C','text','c'), jsonb_build_object('id','D','text','d')) end,
  case when g.n % 5 = 0 then '42' else (array['A','B','C','D'])[1 + (g.n % 4)] end,
  'HARNESS placeholder explanation.', (array['easy','medium','hard'])[1 + (g.n % 3)],
  'ALGEBRA', 'ALG_006', 'approved', now(), '22222222-2222-2222-2222-222222222222'
from public.exam_form_sections sec
join public.exam_forms f on f.id = sec.form_id and f.code = :'code'
cross join lateral generate_series(1, sec.question_count) g(n);
SQL
}
$PSQL -d spine -q -c "alter database spine set spine.exam = '$CODE'" >/dev/null 2>&1
err=$(build GOOD-FORM "$SLOTS"); [ -z "$err" ] && ok "built a complete $CODE form" || no "build failed" "$err"
got=$($PSQL -d spine -tAc "select count(*) from public.exam_questions")
chk "authored $NQ questions" "$got" "$NQ"

# ── 3 · pre-flight refuses a draft, accepts a reviewed form ────────────────
pf () { (cd "$REPO" && node scripts/preflight-exam-form.mjs "$1" "$CODE" > "$TMP/p.sql") && \
        $PSQL -d spine -tA -F'|' -f "$TMP/p.sql" 2>&1; }
first=$(pf GOOD-FORM | head -1)
case "$first" in ERROR\|form-status*) ok "pre-flight refuses a draft form (must be 'review')";;
                 *) no "pre-flight did not refuse a draft" "$first";; esac
$PSQL -d spine -q -c "set role service_role; update public.exam_forms set status='review' where code='GOOD-FORM'" >/dev/null 2>&1
first=$(pf GOOD-FORM | head -1)
case "$first" in OK\|eligible*) ok "pre-flight reports the reviewed form eligible";;
                 *) no "pre-flight did not report eligible" "$first";; esac

# ── 4 · the gate publishes it, and stores the real structure ───────────────
pub () { $PSQL -d spine -tA -v exp="$EXP" -v code="$1" <<'SQL' 2>&1 | grep -oE '^ERROR:.*' | head -1
set role service_role;
select public.publish_exam_form((select id from public.exam_forms where code=:'code'), :'exp'::jsonb);
SQL
}
err=$(pub GOOD-FORM); [ -z "$err" ] && ok "publish_exam_form() accepted the form" || no "publish refused a valid form" "$err"
chk "form reached status=published" "$($PSQL -d spine -tAc "select status from public.exam_forms where code='GOOD-FORM'")" "published"
chk "published_at was stamped"      "$($PSQL -d spine -tAc "select (published_at is not null) from public.exam_forms where code='GOOD-FORM'")" "t"
# NO fallback on this one. An earlier version ended in `|| echo "$NSLOT"`,
# which made it pass while its SQL was erroring — a check that could not go red,
# which docs/roadmap/verification-framework-audit.md exists to forbid.
chk "published_structure captured every slot" \
  "$($PSQL -d spine -tAc "select coalesce(sum(case
        when jsonb_array_length(coalesce(m->'variants','[]'::jsonb)) = 0 then 1
        else jsonb_array_length(m->'variants') end), 0)
     from public.exam_forms f, jsonb_array_elements(f.published_structure->'modules') m
    where f.code = 'GOOD-FORM'")" "$NSLOT"

# ── 5 · a published form is immutable, in all four directions ─────────────
imm () { m=$($PSQL -d spine -q -c "set role service_role; $2" 2>&1 | grep -oE '^ERROR:.*' | head -1)
         [ -n "$m" ] && ok "refused: $1" || no "ALLOWED (must be refused): $1"; }
imm "revert a published form to draft" "update public.exam_forms set status='draft' where code='GOOD-FORM'"
imm "delete a published form"          "delete from public.exam_forms where code='GOOD-FORM'"
imm "edit a published question"        "update public.exam_questions set prompt='tampered' where ordinal=1"
imm "add a section to a published form" \
    "insert into public.exam_form_sections (form_id, ordinal, variant_id, label, question_count, duration_minutes)
     select id, 99, null, 'sneaked in', 22, 35 from public.exam_forms where code='GOOD-FORM'"

# ── 6 · the mistakes an author could actually make ────────────────────────
bad () { # $1 label, $2 form code, $3 slots json
  build "$2" "$3" >/dev/null
  $PSQL -d spine -q -c "set role service_role; update public.exam_forms set status='review' where code='$2'" >/dev/null 2>&1
  e=$(pub "$2"); [ -n "$e" ] && ok "gate refuses: $1" || no "GATE ACCEPTED a malformed form: $1"
  s=$($PSQL -d spine -tAc "select status from public.exam_forms where code='$2'")
  [ "$s" != "published" ] || no "malformed form reached published: $1"
}
DROP1=$(node -e "const s=JSON.parse(process.argv[1]);s.pop();console.log(JSON.stringify(s))" "$SLOTS")
bad "a section slot never authored" DROP-SLOT "$DROP1"
if [ "$NSLOT" -gt 1 ]; then
  RENAME=$(node -e "const s=JSON.parse(process.argv[1]);const i=s.findIndex(x=>x[1]);if(i>=0)s[i][1]='mislabelled';console.log(JSON.stringify(s))" "$SLOTS")
  [ "$RENAME" != "$SLOTS" ] && bad "a variant named something the registry does not allow" WRONG-VARIANT "$RENAME"
fi
SHORT=$(node -e "const s=JSON.parse(process.argv[1]);s[0][2]=s[0][2]-1;console.log(JSON.stringify(s))" "$SLOTS")
bad "a section one question short" SHORT-SECTION "$SHORT"

printf '\n  %s — %d passed, %d failed\n' "$CODE" "$pass" "$fail"
su postgres -c "$PGB/pg_ctl -D $D stop -m immediate" >/dev/null 2>&1
[ "$fail" -eq 0 ]
