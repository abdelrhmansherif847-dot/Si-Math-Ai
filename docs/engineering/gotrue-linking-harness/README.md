# GoTrue identity-linking harness

Reproduces the five Sign in with Apple linking tests in
`docs/engineering/apple-signin-audit.md` §3 against the **real** Supabase Auth
(GoTrue) source and a **real** Postgres, on a throwaway local database.
Production is never contacted.

This exists because the Apple linking behaviour was originally taken from
Supabase's documentation, and documentation is not evidence. The one case that
matters most — Hide My Email — is not described in those docs at all.

## Why this and not a Supabase branch

A Supabase branch is a real, billable project, and end-to-end Apple OAuth also
needs a paid Apple Developer account and real Apple IDs, neither of which existed
at audit time. Running GoTrue's own code against its own schema tests the exact
decision function the hosted service runs, needs no credentials, and costs
nothing. What it does **not** cover is Apple's side of the round trip: the ID
token, the consent screen, and the form-post callback. Those are covered by the
production test plan in the audit, §6.

## Running it

```bash
git clone --depth 1 https://github.com/supabase/auth /tmp/gotrue
cp simathai_apple_linking_test.go /tmp/gotrue/internal/api/

# Throwaway Postgres (any 15/16 server; a container works too)
PGDATA=/var/lib/postgresql/gotrue-test
sudo -u postgres /usr/lib/postgresql/16/bin/initdb -D $PGDATA -U postgres \
     --auth-local=trust --auth-host=trust
sudo -u postgres /usr/lib/postgresql/16/bin/pg_ctl -D $PGDATA \
     -o "-p 5432 -c listen_addresses=127.0.0.1 -k /tmp" -l /tmp/pg.log start

cd /tmp/gotrue
psql -h 127.0.0.1 -U postgres -f hack/init_postgres.sql
bash hack/migrate.sh postgres
go test ./internal/api/ -run 'TestExternal/TestSiMathAI' -v -count=1
```

Tear down with `pg_ctl -D $PGDATA stop` and delete `$PGDATA`.

## Verifying the tests are not vacuous

`docs/roadmap/verification-framework-audit.md`: a green check is only evidence if
it could have gone red. Invert the two headline assertions and confirm both fail:

```bash
sed -i 's|models.CreateAccount, decision, "C:|models.LinkAccount, decision, "C:|' \
    internal/api/simathai_apple_linking_test.go
sed -i 's|require.Nil(ts.T(), reloaded.EncryptedPassword,|require.NotNil(ts.T(), reloaded.EncryptedPassword,|' \
    internal/api/simathai_apple_linking_test.go
go test ./internal/api/ -run 'TestExternal/TestSiMathAI' -count=1   # must FAIL
```

Both were confirmed to fail on 2026-08-21 (case C reported `expected: 2,
actual: 1` on the decision constant; case B reported `Expected value not to be
nil` on the wiped password). Restore the file afterwards.

## Source lines the audit rests on

Pinned here so a future GoTrue version can be diffed against what was read:

| Fact | Location (commit `bc32168`) |
|---|---|
| Apple emails are **always** treated as verified, relays included | `internal/api/provider/oidc.go` — `parseAppleIDToken`, `Verified: true` |
| The linking decision itself | `internal/models/linking.go` — `DetermineAccountLinking` |
| Only **verified** emails are candidates for linking | same file — `verifiedEmails` filter |
| Unconfirmed users still match, and still link | same file — `similarUsers` query filters on `is_sso_user = false` only |
| The second user row is written here | `internal/api/external.go` — `CreateAccount` branch, `a.signupNewUser(tx, user)` |
| Password wipe + identity destruction on an unconfirmed user | `internal/models/user.go` — `RemoveUnconfirmedIdentities` |
| Supabase sends `text/html` only, with no plain-text part | `internal/mailer/mailmeclient/mailmeclient.go` — `SetBody("text/html", body)` |
