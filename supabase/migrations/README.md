# Migrations — read this before running `supabase db push`

**`supabase db push` does not work on this project, and never has.** That is not
a bug introduced by any recent change; it is a structural property of how this
repository and this database have always related to each other. Attempting it
fails like this:

```
Remote migration versions not found in local migrations directory.
  supabase migration repair --status reverted 20260608214251 20260609004913 ... (≈100 versions)
```

## Why

The Supabase CLI keys migrations on the numeric prefix of the filename and
records applied versions in `supabase_migrations.schema_migrations`. For push to
work, those two sets must correspond. Here they cannot:

| | Version format | Count | Example |
|---|---|---|---|
| Files in this directory | **8 digits** — a date | 40 | `20260614_weakness_report_severity.sql` → `20260614` |
| Rows in the remote history | **14 digits** — a timestamp | ~100 | `20260608214251` |

The two sets are disjoint *by construction*: an 8-character version can never
equal a 14-character one. So the CLI sees 40 local migrations it believes are
unapplied, and ~100 remote versions with no local file, and refuses to proceed.

The cause is simply that migrations here have always been applied through the
Dashboard SQL Editor or a direct SQL call (see `DEPLOY.md` §2, "Option B —
Dashboard SQL Editor"), with the file in this directory kept as the reviewable
record of what was run. The remote history was written by those applications
with real timestamps; the filenames were chosen by hand, by date. Both are
internally consistent. They were just never the same system.

## What this means in practice

The files here are **documentation of applied schema changes**, not a
CLI-managed migration chain. They are still authoritative for review, for
understanding intent, and for reconstructing the schema — but the database, not
this directory, is the source of truth for what is currently applied.

Verify applied state with SQL, never by reading filenames:

```bash
psql "$SUPABASE_DB_URL" -f scripts/verify-security-sql.sql   # every row must read PASS
```

## Applying a new migration

1. Get owner approval (CLAUDE.md §3 — every migration, individually).
2. Apply it: Dashboard SQL Editor, or `supabase db execute --file <path>`.
3. Commit the file here with a date prefix matching its siblings.
4. Verify with `scripts/verify-security-sql.sql`, or a query specific to the
   change. `DEPLOY.md` §3 requires this before any dependent code ships.

Migrations written but not yet approved live in `supabase/migrations-pending/`,
deliberately outside the CLI's path.

## If you want `db push` to work in future

This is a real and worthwhile cleanup, but it is a deliberate operation on its
own — **not something to bundle into a feature or security deploy**, because it
rewrites the migration history of a live database.

The safe route is `supabase db pull`, which snapshots the current remote schema
into a single baseline migration and reconciles the history table so the two
sides agree from that point on. Existing files here would be superseded by that
baseline and should be moved to `docs/` or an `archive/` directory rather than
deleted, since audit documents reference them by name.

Do **not** take the CLI's suggested shortcut of
`supabase migration repair --status reverted <100 versions>`. Those migrations
genuinely were applied; marking them reverted records a falsehood in the history
table, and a later `db push` would then try to re-apply schema changes that are
already live.
