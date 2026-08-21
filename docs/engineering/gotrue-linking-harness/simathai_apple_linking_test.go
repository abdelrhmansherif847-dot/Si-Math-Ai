// Si Math AI — empirical verification of Sign in with Apple account linking.
//
// NOT part of upstream GoTrue. Written to answer one question with evidence
// instead of documentation: when a Si Math AI student who already has an
// account signs in with Apple, do they keep their auth.users.id — and with it
// their credits, chat history, question records, weakness reports and focus
// plans — or do they get a second, empty account?
//
// Runs against a throwaway local Postgres with the real GoTrue schema, driving
// the real createAccountFromExternalIdentity. Production is never touched.
//
// The Apple-specific input is not invented: internal/api/provider/oidc.go
// parseAppleIDToken sets Verified: true unconditionally for every Apple email,
// including Hide My Email relays, so provider.Email{Verified: true} below is
// exactly what the Apple provider hands the linking code.
package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/supabase/auth/internal/api/provider"
	"github.com/supabase/auth/internal/models"
)

const (
	siStudentEmail = "jumana.test@icloud.com"
	siRelayEmail   = "8xk2m9qp4z@privaterelay.appleid.com"
	siApplePwd     = "test-password"
)

// appleData is what the Apple provider produces for a given address and Apple
// user id (the `sub` claim, which is stable per Apple ID per app).
func appleData(email, sub string, isPrivate bool) *provider.UserProvidedData {
	custom := map[string]any{}
	if isPrivate {
		custom["is_private_email"] = true
	}
	return &provider.UserProvidedData{
		Metadata: &provider.Claims{
			Subject:       sub,
			Email:         email,
			EmailVerified: true,
			CustomClaims:  custom,
		},
		Emails: []provider.Email{{Email: email, Primary: true, Verified: true}},
	}
}

func countUsers(ts *ExternalTestSuite) int {
	n, err := ts.API.db.Q().Where("is_anonymous = false").Count(&models.User{})
	require.NoError(ts.T(), err)
	return n
}

func providersOf(ts *ExternalTestSuite, userID string) []string {
	var ids []models.Identity
	require.NoError(ts.T(), ts.API.db.Q().Where("user_id = ?", userID).Order("provider").All(&ids))
	out := []string{}
	for _, i := range ids {
		out = append(out, i.Provider)
	}
	return out
}

func appleCallback() *http.Request {
	r := httptest.NewRequest(http.MethodGet, "/callback", nil)
	r.RemoteAddr = "192.0.2.1:1234"
	return r
}

// ── A. Existing CONFIRMED email/password user, Apple with the same address ───
func (ts *ExternalTestSuite) TestSiMathAI_A_ConfirmedUserSameEmail() {
	u, err := ts.createUser("", siStudentEmail, "Jumana", "", "")
	require.NoError(ts.T(), err)
	require.NoError(ts.T(), u.Confirm(ts.API.db))
	before := u.ID
	pwdBefore := u.EncryptedPassword

	decision, after, err := ts.API.createAccountFromExternalIdentity(
		ts.API.db, appleCallback(), appleData(siStudentEmail, "apple-sub-A", false), "apple", false)
	require.NoError(ts.T(), err)

	require.Equal(ts.T(), models.LinkAccount, decision, "A: must LINK, not create")
	require.Equal(ts.T(), before, after.ID, "A: user_id MUST be preserved")
	require.Equal(ts.T(), 1, countUsers(ts), "A: no second account")
	require.Equal(ts.T(), []string{"apple", "email"}, providersOf(ts, after.ID.String()),
		"A: both identities survive")

	reloaded, err := models.FindUserByID(ts.API.db, before)
	require.NoError(ts.T(), err)
	require.Equal(ts.T(), pwdBefore, reloaded.EncryptedPassword,
		"A: password login must still work after linking")
}

// ── B. Existing UNCONFIRMED user (the three locked-out iCloud students) ──────
func (ts *ExternalTestSuite) TestSiMathAI_B_UnconfirmedUserSameEmail() {
	u, err := ts.createUser("", siStudentEmail, "Jumana", "", "")
	require.NoError(ts.T(), err)
	before := u.ID
	require.False(ts.T(), u.IsConfirmed(), "B: precondition — the account is unconfirmed")
	require.NotNil(ts.T(), u.EncryptedPassword, "B: precondition — it has a password")

	decision, after, err := ts.API.createAccountFromExternalIdentity(
		ts.API.db, appleCallback(), appleData(siStudentEmail, "apple-sub-B", false), "apple", false)
	require.NoError(ts.T(), err)

	require.Equal(ts.T(), models.LinkAccount, decision, "B: must LINK, not create")
	require.Equal(ts.T(), before, after.ID, "B: user_id MUST be preserved — this is the whole account")
	require.Equal(ts.T(), 1, countUsers(ts), "B: no second account")

	reloaded, err := models.FindUserByID(ts.API.db, before)
	require.NoError(ts.T(), err)
	require.True(ts.T(), reloaded.IsConfirmed(), "B: linking confirms the account")

	// The three findings that matter operationally. RemoveUnconfirmedIdentities
	// runs because the account was unconfirmed, and it is destructive to the
	// password login even though it preserves the account itself.
	require.Equal(ts.T(), []string{"apple"}, providersOf(ts, before.String()),
		"B: the email identity is DESTROYED")
	require.Nil(ts.T(), reloaded.EncryptedPassword,
		"B: the password is WIPED — the student becomes Apple-only")
	require.Nil(ts.T(), reloaded.UserMetaData["full_name"],
		"B: user_metadata is OVERWRITTEN by Apple's, which carries no name")
}

// ── C. Existing user, Apple with Hide My Email ───────────────────────────────
func (ts *ExternalTestSuite) TestSiMathAI_C_HideMyEmailForksAccount() {
	u, err := ts.createUser("", siStudentEmail, "Jumana", "", "")
	require.NoError(ts.T(), err)
	require.NoError(ts.T(), u.Confirm(ts.API.db))
	before := u.ID

	decision, after, err := ts.API.createAccountFromExternalIdentity(
		ts.API.db, appleCallback(), appleData(siRelayEmail, "apple-sub-C", true), "apple", false)
	require.NoError(ts.T(), err)

	require.Equal(ts.T(), models.CreateAccount, decision, "C: Supabase CREATES a second account")
	require.NotEqual(ts.T(), before, after.ID, "C: the user_id is DIFFERENT — the account is forked")
	require.Equal(ts.T(), 2, countUsers(ts), "C: two accounts now exist")

	// The original is intact — nothing is destroyed, it is simply orphaned from
	// the identity the student is now signed in as.
	orig, err := models.FindUserByID(ts.API.db, before)
	require.NoError(ts.T(), err)
	require.Equal(ts.T(), siStudentEmail, orig.GetEmail())
	require.Equal(ts.T(), []string{"email"}, providersOf(ts, before.String()))

	// TIMING — the claim under review. The second user row is committed by
	// createAccountFromExternalIdentity itself, inside the /callback request,
	// before GoTrue issues its redirect. Any browser-side guard necessarily runs
	// after this point.
	forked, err := models.FindUserByID(ts.API.db, after.ID)
	require.NoError(ts.T(), err)
	require.Equal(ts.T(), siRelayEmail, forked.GetEmail(),
		"C: the forked user is already persisted when the callback returns")
}

// ── D + E. New Apple user, then the same Apple user returning ────────────────
func (ts *ExternalTestSuite) TestSiMathAI_DE_NewThenReturningAppleUser() {
	require.Equal(ts.T(), 0, countUsers(ts), "D: precondition — no accounts")

	decision, created, err := ts.API.createAccountFromExternalIdentity(
		ts.API.db, appleCallback(), appleData("new.student@icloud.com", "apple-sub-D", false), "apple", false)
	require.NoError(ts.T(), err)
	require.Equal(ts.T(), models.CreateAccount, decision, "D: a genuinely new student gets a new account")
	require.Equal(ts.T(), 1, countUsers(ts))
	require.True(ts.T(), created.IsConfirmed(), "D: Apple's verified email confirms the account immediately")

	// E — same Apple `sub`, second sign-in.
	decision, returning, err := ts.API.createAccountFromExternalIdentity(
		ts.API.db, appleCallback(), appleData("new.student@icloud.com", "apple-sub-D", false), "apple", false)
	require.NoError(ts.T(), err)
	require.Equal(ts.T(), models.AccountExists, decision, "E: recognised, nothing created")
	require.Equal(ts.T(), created.ID, returning.ID, "E: user_id preserved on every return")
	require.Equal(ts.T(), 1, countUsers(ts), "E: still exactly one account")
}

// ── F. Would a browser-side guard have prevented C? ──────────────────────────
// Answering the review question directly rather than by argument: run the
// identical relay sign-in and count rows at the only moment browser code could
// possibly act — after the callback has returned.
func (ts *ExternalTestSuite) TestSiMathAI_F_GuardCannotPreventCreation() {
	_, err := ts.createUser("", siStudentEmail, "Jumana", "", "")
	require.NoError(ts.T(), err)
	require.Equal(ts.T(), 1, countUsers(ts))

	_, _, err = ts.API.createAccountFromExternalIdentity(
		ts.API.db, appleCallback(), appleData(siRelayEmail, "apple-sub-F", true), "apple", false)
	require.NoError(ts.T(), err)

	require.Equal(ts.T(), 2, countUsers(ts),
		"F: the second account is already committed before any browser code runs — "+
			"a client-side guard can prevent its USE, never its CREATION")
}


// ── G. Phase 2: linkIdentity() from Settings, with Hide My Email ─────────────
// The claim Phase 2 rests on: a student who is ALREADY SIGNED IN and links Apple
// from Settings keeps their user_id even when Apple hides the address. Verified
// rather than assumed, because the same assumption was wrong for the login-page
// flow (case C).
//
// linkIdentityToUser (internal/api/identity.go) attaches the new identity to
// getTargetUser(ctx) — the authenticated user — and never consults the email for
// matching. The email is touched only when the target user has none at all
// (anonymous users), which is not our case.
func (ts *ExternalTestSuite) TestSiMathAI_G_SettingsLinkSurvivesHideMyEmail() {
	u, err := ts.createUser("", siStudentEmail, "Jumana", "", "")
	require.NoError(ts.T(), err)
	require.NoError(ts.T(), u.Confirm(ts.API.db))
	before := u.ID

	// The student is signed in: their user is the target of the link request.
	r := appleCallback().WithContext(withTargetUser(appleCallback().Context(), u))

	linked, err := ts.API.linkIdentityToUser(r, r.Context(), ts.API.db,
		appleData(siRelayEmail, "apple-sub-G", true), "apple")
	require.NoError(ts.T(), err)

	require.Equal(ts.T(), before, linked.ID, "G: user_id preserved despite Hide My Email")
	require.Equal(ts.T(), 1, countUsers(ts), "G: NO second account is created")
	require.Equal(ts.T(), []string{"apple", "email"}, providersOf(ts, before.String()),
		"G: Apple is added alongside the existing email identity")

	reloaded, err := models.FindUserByID(ts.API.db, before)
	require.NoError(ts.T(), err)
	require.Equal(ts.T(), siStudentEmail, reloaded.GetEmail(),
		"G: the account email is NOT replaced by the relay address")
	require.NotNil(ts.T(), reloaded.EncryptedPassword,
		"G: the password is NOT wiped — unlike the unconfirmed-link path in case B")
}

// ── H. The ordering constraint Phase 2 implies ───────────────────────────────
// If a student has ALREADY forked via the login button, the same Apple sub is
// bound to the orphan, and linking from Settings is refused rather than silently
// moved. Nothing is corrupted — but it means Settings-linking must ship BEFORE
// the public button, not after.
func (ts *ExternalTestSuite) TestSiMathAI_H_AlreadyForkedRefusesSettingsLink() {
	real, err := ts.createUser("", siStudentEmail, "Jumana", "", "")
	require.NoError(ts.T(), err)
	require.NoError(ts.T(), real.Confirm(ts.API.db))

	// The fork happens first, via the login-page button.
	_, orphan, err := ts.API.createAccountFromExternalIdentity(
		ts.API.db, appleCallback(), appleData(siRelayEmail, "apple-sub-H", true), "apple", false)
	require.NoError(ts.T(), err)
	require.NotEqual(ts.T(), real.ID, orphan.ID)
	require.Equal(ts.T(), 2, countUsers(ts))

	// Now they try to link the same Apple ID from Settings on their real account.
	r := appleCallback().WithContext(withTargetUser(appleCallback().Context(), real))
	_, err = ts.API.linkIdentityToUser(r, r.Context(), ts.API.db,
		appleData(siRelayEmail, "apple-sub-H", true), "apple")

	require.Error(ts.T(), err, "H: refused — the Apple identity belongs to the orphan")
	require.Contains(ts.T(), err.Error(), "already linked")
	require.Equal(ts.T(), 2, countUsers(ts), "H: refusal changes nothing")
	require.Equal(ts.T(), []string{"email"}, providersOf(ts, real.ID.String()),
		"H: the real account is untouched by the failed attempt")
}

// Sanity: the suite is wired to a real database and these checks could fail.
func TestSiMathAILinkingHarness(t *testing.T) {
	api, config, err := setupAPIForTest()
	require.NoError(t, err)
	defer api.db.Close()
	require.NotNil(t, config)
	require.NoError(t, models.TruncateAll(api.db))
	var n int
	n, err = api.db.Q().Count(&models.User{})
	require.NoError(t, err)
	require.Equal(t, 0, n, "harness talks to a real, empty auth.users")
}
