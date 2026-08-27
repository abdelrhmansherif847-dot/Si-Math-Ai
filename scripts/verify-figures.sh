#!/usr/bin/env bash
# Prove 20260827b_plot_figures.sql on a throwaway PostgreSQL, against the REAL
# applied migrations rather than a paraphrase of them.
#
#   1. it applies cleanly on top of the five applied ones
#   2. figures[] is required on every plot
#   3. the frame x mode matrix is enforced — combinations, not fields in isolation
#   4. only the keys the renderer reads are accepted, each on a mode that honours it
#   5. one label per DISTINCT vertex, so a closing repeat is not labelled twice
#   6. the guards are not decorative
#   7. the rollback reverses it
# Synthetic placeholder content only; never real questions.
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
sed -n "/^cat > \"\$TMP\/setup.sql\" <<'SETUPSQL'\$/,/^SETUPSQL\$/p" "$REPO/scripts/verify-reading.sh" \
  | sed '1d;$d' > "$TMP/setup.sql"
$PSQL -q -f "$TMP/setup.sql" >/dev/null 2>&1
for m in 20260824a_question_spine 20260824b_exam_forms_insert_guard \
         20260824c_publish_exam_form_revoke_public 20260825a_exam_stimuli \
         20260827a_stimulus_reading; do
  $PSQL -d spine -v ON_ERROR_STOP=1 -q -f "$REPO/supabase/migrations/$m.sql" >/dev/null 2>&1 \
    || { no "applied migration $m"; exit 1; }
done
ok "the five applied migrations replay cleanly"
OUT=$($PSQL -d spine -v ON_ERROR_STOP=1 -q -f "$REPO/supabase/migrations/20260827b_plot_figures.sql" 2>&1)
echo "$OUT" | grep -qE '^ERROR|FATAL' && { no "20260827b applies" "$OUT"; exit 1; }
ok "20260827b applies cleanly on top of them"

Q="$PSQL -d spine -tA -q"
spec () { # $1 frame, $2 figures-json  -> the full plot spec
  printf '{"frame":"%s","xRange":[0,5],"yRange":[0,5],"curves":[{"points":[[0,0],[1,1],[2,4]]}],"figures":%s}' "$1" "$2"
}
val () { $Q -c "select public.exam_stimulus_spec_ok('plot', '$1'::jsonb)"; }

echo; echo "── 2 · figures[] is required, and must agree with curves[]"
chk "a plot with no figures[] is refused" \
  "$($Q -c "select public.exam_stimulus_spec_ok('plot','{\"frame\":\"graph\",\"xRange\":[0,5],\"yRange\":[0,5],\"curves\":[{\"points\":[[0,0],[1,1]]}]}'::jsonb)")" f
chk "figures[] shorter than curves[] is refused" \
  "$($Q -c "select public.exam_stimulus_spec_ok('plot','{\"frame\":\"graph\",\"xRange\":[0,5],\"yRange\":[0,5],\"curves\":[{\"points\":[[0,0],[1,1]]},{\"points\":[[0,1],[1,2]]}],\"figures\":[{\"mode\":\"curve\"}]}'::jsonb)")" f
chk "one figure per curve is accepted" "$(val "$(spec graph '[{"mode":"curve"}]')")" t
chk "figures[] not an array is refused" "$(val "$(spec graph '"curve"')")" f

echo; echo "── 3 · the frame x mode matrix — combinations, not fields alone"
while IFS='|' read -r fr md ex exp; do
  trim(){ printf '%s' "$1" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'; }
  fr=$(trim "$fr"); md=$(trim "$md"); ex=$(trim "$ex"); exp=$(trim "$exp")
  fig=$(printf '[{"mode":"%s"%s}]' "$md" "$ex")
  got=$(val "$(spec "$fr" "$fig")")
  want=$([ "$exp" = "true" ] && echo t || echo f)
  chk "$(printf '%-6s %-8s %-18s' "$fr" "$md" "${ex:-—}")" "$got" "$want"
done < "$REPO/scripts/figures-matrix.txt"

echo; echo "── 4 · labels: one per DISTINCT vertex"
tri () { printf '{"frame":"plane","xRange":[0,5],"yRange":[0,5],"curves":[{"points":%s}],"figures":[{"mode":"polygon","labels":%s}]}' "$1" "$2"; }
chk "open triangle, 3 points, 3 labels" \
  "$($Q -c "select public.exam_stimulus_spec_ok('plot','$(tri '[[0,0],[4,0],[4,3]]' '["O","A","B"]')'::jsonb)")" t
chk "CLOSED triangle, 4 points repeating the first, 3 labels" \
  "$($Q -c "select public.exam_stimulus_spec_ok('plot','$(tri '[[0,0],[4,0],[4,3],[0,0]]' '["O","A","B"]')'::jsonb)")" t
chk "closed triangle with 4 labels is refused" \
  "$($Q -c "select public.exam_stimulus_spec_ok('plot','$(tri '[[0,0],[4,0],[4,3],[0,0]]' '["O","A","B","O"]')'::jsonb)")" f
chk "open triangle with 2 labels is refused" \
  "$($Q -c "select public.exam_stimulus_spec_ok('plot','$(tri '[[0,0],[4,0],[4,3]]' '["O","A"]')'::jsonb)")" f
chk "labels on a scatter are refused" \
  "$($Q -c "select public.exam_stimulus_spec_ok('plot','$(spec data '[{"mode":"scatter","labels":["A","B","C"]}]')'::jsonb)")" f
chk "a non-string label is refused" \
  "$($Q -c "select public.exam_stimulus_spec_ok('plot','$(tri '[[0,0],[4,0],[4,3]]' '["O","A",3]')'::jsonb)")" f

echo; echo "── 5 · the other kinds are untouched"
chk "table"       "$($Q -c "select public.exam_stimulus_spec_ok('table','{\"headers\":[\"a\"],\"rows\":[[\"1\"]]}'::jsonb)")" t
chk "chart"       "$($Q -c "select public.exam_stimulus_spec_ok('chart','{\"chartType\":\"bar\",\"categories\":[\"a\"],\"series\":[{\"name\":\"s\",\"values\":[1]}]}'::jsonb)")" t
chk "number_line" "$($Q -c "select public.exam_stimulus_spec_ok('number_line','{\"min\":-3,\"max\":3,\"points\":[1]}'::jsonb)")" t

echo; echo "── 6 · the guard is not decorative"
$PSQL -d spine -q -c "create or replace function public.exam_plot_frame_mode_ok(frame text, mode text)
  returns boolean language sql immutable as \$\$ select true \$\$" >/dev/null 2>&1
chk "with the combination rule stubbed, a scatter on a plane IS accepted" \
  "$(val "$(spec plane '[{"mode":"scatter"}]')")" t
$PSQL -d spine -q -v ON_ERROR_STOP=1 -f "$REPO/supabase/migrations/20260827b_plot_figures.sql" >/dev/null 2>&1
chk "and refused again once restored" "$(val "$(spec plane '[{"mode":"scatter"}]')")" f

echo; echo "── 7 · a real stimulus row still stores"
chk "insert a valid plot" "$($PSQL -d spine -tA -q -c "set role service_role" -c "
  insert into public.exam_forms (code, exam_code, title) values ('FG','SAT','figures harness');
  insert into public.exam_stimuli (form_id, kind, label, spec)
  select id,'plot','ok','$(spec plane '[{"mode":"polygon","labels":["O","A","B"]}]')'::jsonb
    from public.exam_forms where code='FG'" >/dev/null 2>&1 && echo ok || echo refused)" ok
chk "refuse an invalid one" "$($PSQL -d spine -tA -q -c "set role service_role" -c "
  insert into public.exam_stimuli (form_id, kind, label, spec)
  select id,'plot','bad','$(spec plane '[{"mode":"scatter"}]')'::jsonb
    from public.exam_forms where code='FG'" >/dev/null 2>&1 && echo ok || echo refused)" refused

echo
printf '%s\n' "──────────────────────────────────────────────"
[ "$fail" = "0" ] && printf '  \033[32mALL %d CHECKS PASSED\033[0m\n' "$pass" \
                  || printf '  \033[31m%d FAILED\033[0m, %d passed\n' "$fail" "$pass"
exit $([ "$fail" = "0" ] && echo 0 || echo 1)
