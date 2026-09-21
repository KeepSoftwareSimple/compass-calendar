# Auth Acceptance

This runbook covers the auth UX that is currently implemented in Compass.

## Scope

Use this guide to manually validate:

- email/password sign up
- email/password log in
- forgot password and reset password
- Google sign in from a logged-out state
- password-only Compass usage before Google is connected
- explicit "Connect Google Calendar" from an authenticated password session
- session-expired re-auth
- logout and gate persistence

Do not use this guide to validate these flows yet:

- email verification completion
- passive same-email Google/password auto-linking by email while logged out

## Setup

1. Install dependencies with `bun install`.
2. Copy `compass.example.yaml` to `compass.yaml` at the repo root if you are running the backend locally.
3. Start the web app with `bun run dev:web`.
4. Start the backend if you need live auth or password reset delivery.
5. Use a fresh browser profile or clear app cookies and local storage before each scenario unless the scenario explicitly depends on persisted auth state. TIP: You can use the CLI's delete command to do this for you.

Helpful notes:

- Password reset requires backend support. If email delivery is not configured in your local environment, validate the flow in an environment where reset emails are delivered, or use backend logs in `test` where reset links are logged instead of sent.
- For "connect Google later" scenarios, start from a password-authenticated
  session. Do not sign out before connecting Google.

## Scenario 1: Gate And Entry Points

### UX

The auth modal can be opened from an `?auth=` URL or, after a user has authenticated once, from persisted local auth state.

### Steps

1. Open `/day` in a fresh browser profile.
2. Confirm the logged-out account icon is not visible.
3. Open `/day?auth=login`.
4. Confirm the auth modal opens in the login view.
5. Repeat with `/day?auth=signup` and `/day?auth=forgot`.
6. Confirm each URL opens the matching modal view.
7. Close the modal.
8. Sign up or log in once, then log out and reload `/day`.
9. Confirm the logged-out account icon and auth command-palette entries are now visible without needing `?auth=`.

### Expected Results

- `?auth=login` opens the login view.
- `?auth=signup` opens the sign-up view.
- `?auth=forgot` opens the forgot-password view.
- After a successful auth, logout does not remove the local auth gate state.

## Scenario 2: Email/Password Sign Up

### UX

The sign-up form should collect name, email, and password, create a session, close the modal, and leave the user in an authenticated app state.

### Steps

1. Open `/day?auth=signup`.
2. Enter a new name, a new email address, and a valid password.
3. Submit the form.
4. Wait for the modal to close.
5. Refresh the page.

### Expected Results

- The sign-up request succeeds without redirecting away from the app shell.
- The modal closes after success.
- The user stays authenticated after refresh.
- The logged-out account icon no longer appears.

## Scenario 3: Email/Password Log In

### UX

Existing password users should be able to log in from the modal. Invalid credentials should stay in the modal and show an inline error.

### Steps

1. Log out.
2. Open the login modal.
3. Attempt to log in with the correct email and an incorrect password.
4. Confirm the form stays open.
5. Log in again with the correct password.

### Expected Results

- Invalid credentials show `Incorrect email or password.` inline.
- The modal remains open after a failed login.
- A successful login closes the modal and restores the authenticated session.

## Scenario 4: Forgot Password And Reset Password

### UX

The forgot-password flow should avoid leaking whether an email exists. The reset flow should accept a valid token, reject an invalid or expired token, and return the user to login with a success message after a password change.

### Steps

1. Open the login modal and select `Forgot password`.
2. Submit the form with an existing account email.
3. Confirm the success state says a reset link will be sent if the account exists.
4. Repeat the same step with a fake email address.
5. Confirm the same success state is shown.
6. Retrieve the reset link from delivered email or backend logs.
7. Open the rewritten Compass link, which should look like `/day?auth=reset&token=...`.
8. Enter a new password and submit.
9. Confirm the modal returns to login with the success message `Password reset successful. Log in with your new password.`
10. Try the old password and confirm it fails.
11. Try the new password and confirm it succeeds.
12. Tamper with the token or reuse an expired token and repeat the reset flow.

### Expected Results

- Forgot-password success copy is generic for both real and fake emails.
- The reset link lands in the reset-password modal.
- Successful reset returns the user to login with the post-reset success state.
- Invalid or expired tokens show `This reset link is invalid or expired. Request a new one.`

## Scenario 5: Google Sign In From Logged-Out State

### UX

The auth modal should still allow Google sign in from a logged-out state. A successful Google redirect flow should authenticate the user and return to Compass.

### Steps

1. Open the auth modal from `/day?auth=login`.
2. Select `Continue with Google`.
3. Complete the Google authorization redirect with the intended Google account.
4. Log out.
5. Start Google sign in again, but cancel at Google before finishing.

### Expected Results

- The Google authorization redirect returns to Compass through `/auth/google/callback`.
- A successful Google sign-in authenticates the user and returns them to the saved app path.
- A canceled Google redirect returns to Compass and shows a recoverable auth error.

## Scenario 6: Password-Only Compass Usage Before Google Connect

### UX

Password-authenticated users should be able to use Compass event CRUD without an existing Google connection. The app should keep prompting them to connect Google later rather than blocking basic usage.

### Steps

1. Sign up or log in with email/password.
2. Do not connect Google.
3. Create a normal event in Compass.
4. Edit the event.
5. Delete the event.
6. Inspect the sidebar Google action.

### Expected Results

- Event create, edit, and delete all work without Google already connected.
- The sidebar still shows `Connect Google Calendar` rather than a healthy connected state.

## Scenario 7: Connect Google Later From A Password Session

### UX

An already-authenticated password user should be able to connect Google from inside the app without being kicked into a duplicate or empty account. Existing Compass data should remain visible after connect.

### Steps

1. Sign up or log in with email/password and stay signed in.
2. Create at least one Compass event before connecting Google.
3. In the sidebar, select `Connect Google Calendar`.
4. Complete Google OAuth with the intended Google account.
5. Return to Compass and refresh the page.
6. If available in your environment, verify the pre-existing Compass event appears in Google Calendar after the initial sync finishes.

### Expected Results

- The app keeps the existing authenticated session instead of falling back to a logged-out state.
- Previously created Compass data is still present after Google connect.
- The Google status moves away from `NOT_CONNECTED` and into an importing or connected state.
- The network flow uses the authenticated backend connect path rather than
  logged-out Google sign-in:
  - `POST /api/auth/google/connect`
  - not `POST /api/signinup`

## Scenario 8: Sign In With Google After Connect-Later

### UX

After a password user connects Google, a later logged-out Google sign-in should
land in the same Compass account rather than creating a duplicate account.

### Steps

1. Complete Scenario 7 first.
2. Log out.
3. Choose `Continue with Google`.
4. Complete Google OAuth with the same Google account used in Scenario 7.
5. Verify existing Compass data is still present.

### Expected Results

- The user lands in the same Compass account.
- Existing Compass data remains visible.
- No duplicate or empty account is created.

## Scenario 9: Connect Conflict (Google Account Already Linked Elsewhere)

### UX

If a logged-in user tries to connect a Google account that already belongs to a
different Compass user, the connect action should fail safely without replacing
or mutating the current account session.

### Steps

1. Prepare two distinct Compass users (User A and User B).
2. Connect Google account G to User A and confirm success.
3. Log out User A.
4. Log in as User B (email/password session is easiest for setup).
5. Trigger `Connect Google Calendar`.
6. Complete OAuth with the same Google account G.
7. Observe network and UI behavior after OAuth returns.

### Expected Results

- `POST /api/auth/google/connect` returns `409`.
- Response payload includes:
  - `result: "User not connected"`
  - `code: "GOOGLE_ACCOUNT_ALREADY_CONNECTED"`
  - `message: "Google account is already connected to another Compass user"`
- User B remains signed in as User B (session is not replaced).
- User B's existing Compass data remains visible.
- Google connection status for User B does not transition to connected/importing.

## Scenario 10: Session-Expired Re-Auth

### UX

When a previously authenticated session becomes invalid, the app should guide the user back into the login modal instead of forcing a Google-only reconnect.

### Steps

1. Log in with email/password.
2. Leave local storage intact, but clear the SuperTokens session cookies in the browser.
3. Reload the app and trigger an authenticated fetch if needed.
4. Wait for the session-expired toast.
5. Select `Sign in` from the toast.
6. Complete login again.

### Expected Results

- The toast says `You've been signed out. Please sign in again.`
- Clicking `Sign in` opens the login modal.
- The calendar does **not** also show a local “Couldn't load events” / “Couldn't load calendars” Retry UI for the same session failure — session recovery owns that story.
- Re-authenticating restores normal app usage.

## Scenario 11: Logout And Persisted Gate State

### UX

Logout should end the server session, but the local rollout gate should still remember that this browser has authenticated before.

### Steps

1. Log in with email/password or Google.
2. Use the `Z` shortcut or the command-palette logout action.
3. Confirm you are redirected back into the app.
4. Reload `/day`.
5. Open the command palette.

### Expected Results

- The user is logged out.
- The logged-out auth affordances still appear after reload because local auth state still has `lastKnownEmail`.
- The command palette shows `Sign Up` and `Log In` again.

## Scenario 12: Partial Scope Grant Shows The Permissions Modal

### UX

Google and Microsoft let a user uncheck individual permissions on the consent
screen. Compass cannot sync without them, so declining one should explain
what was skipped and offer a one-click retry instead of an unexplained toast.

### Steps

1. Open the auth modal from `/day?auth=login` and select `Continue with Google`.
2. At Google's consent screen, uncheck one of the calendar permissions before
   approving.
3. Return to Compass through `/auth/google/callback`.
4. Confirm the permissions modal opens instead of a toast, listing each
   requested permission and why Compass needs it.
5. Select `Try again with Google`.
6. Complete the consent screen again, this time leaving every permission
   checked.
7. Repeat the same flow for an already-authenticated user reconnecting
   Google or Microsoft from the sidebar (`?provider=<kind>&status=missingScopes`).

### Expected Results

- A partial scope grant on sign-in opens the missing-permissions modal
  (`Compass needs calendar access`) instead of the old error toast.
- The modal lists every requested permission with a plain-language reason.
- `Try again with Google` (or Microsoft) reopens the provider's consent
  screen with `prompt=consent`, so every permission is checked again.
- `Not now` closes the modal and leaves the user exactly where they were.
- The same modal opens for the signed-in connect/reconnect flow, replacing
  the old `missingScopes` toast.

## Focused Regression Checks

If time is limited, run these checks before shipping auth changes:

1. `?auth=login`, `?auth=signup`, and `?auth=forgot` open the correct modal views.
2. Wrong password shows the inline login error and does not close the modal.
3. Forgot-password success copy is identical for real and fake emails.
4. Reset links open the reset-password modal and can be completed with a new password.
5. Password-only users can still create, edit, and delete Compass events before connecting Google.
6. `Connect Google Calendar` works from an authenticated password session without losing existing Compass data.
7. After connect-later, logged-out Google sign-in lands in the same Compass account.
8. Session expiry opens the login modal from the toast.
9. Connect conflict returns `409` and does not change active Compass session.
10. Logging out preserves the rollout gate for that browser session.

## Current Caveats

- Email verification is not part of the current end-to-end manual test flow yet.
