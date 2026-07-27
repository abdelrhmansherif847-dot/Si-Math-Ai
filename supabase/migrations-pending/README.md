# Pending migrations — NOT applied, NOT on the CLI's migration path

Migrations in this directory are written and reviewed but **not approved for
application** (CLAUDE.md §3 requires per-migration owner approval).

They live here rather than in `supabase/migrations/` for a concrete reason: the
Supabase CLI treats every `.sql` file under `supabase/migrations/` as part of
the migration chain. A `PENDING_`-prefixed file there produced

```
Skipping migration PENDING_..._sec08_rpc_grant_hygiene.sql...
  (file name must match pattern "<timestamp>_name.sql")
```

on every `supabase db push`. The warning was harmless — the file was skipped,
which is what the prefix was for — but a non-migration sitting in the migration
directory is noise in exactly the place where noise is dangerous, and the next
person to add a `PENDING_` file might not be so lucky about it being skipped
rather than applied.

## To approve and apply one

1. Review it.
2. Move it into `supabase/migrations/` (drop nothing, keep the date prefix so it
   matches the sibling files).
3. Apply it by the route this project actually uses — Dashboard SQL Editor or
   `supabase db execute` — see `docs/supabase-migrations.md` for why
   `supabase db push` does not work on this project.
4. Verify with `scripts/verify-security-sql.sql`.
