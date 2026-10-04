# Connect iCloud Calendar

## Connect an iCloud calendar

Calendar sync uses CalDAV and an app-specific password. A self-hoster does
not need Apple Developer Program membership for calendar sync.

1. Enable two-factor authentication on the Apple Account used for testing.
2. Sign in at [Apple Account](https://account.apple.com), open **Sign-In and
   Security > App-Specific Passwords**, and generate a password named
   `compass-staging`.
3. In Compass, connect iCloud with the account email and that app-specific
   password. Use the generated password rather than the main account password.
4. Verify the connection becomes healthy and the expected calendars appear.

See [Apple's app-specific password instructions](https://support.apple.com/en-us/102654).
Revoking the password prevents further sync. Changing the main Apple Account
password also revokes app-specific passwords. Generate a replacement and
reconnect when Compass reports expired authorization.

For staging, create a disposable `compass-smoke` calendar and recurring
events with exceptions. If another test account is available, also share a
second calendar read-only. Verify edits in both directions, a recurring
exception, a booking without a video link, and the reconnect prompt after
revoking the test password. Record actual results and dates; configuration
alone does not establish a successful soak.

The provider smoke workflow uses `SMOKE_APPLE_EMAIL` and
`SMOKE_APPLE_APP_PASSWORD` secrets in the `provider-smoke` environment.

## Sign in with Apple

Apple sign-in is separate from calendar access. To configure it:

1. Enroll in the Apple Developer Program and create a primary App ID with
   the Sign in with Apple capability.
2. In **Certificates, Identifiers & Profiles**, register a Services ID for
   the website and enable Sign in with Apple on it.
3. Associate the Services ID with the primary App ID. Configure the website
   domains and backend return URLs below, then save the configuration.
4. Create a key with Sign in with Apple enabled for that primary App ID.
   Download its `.p8` file and retain it privately. Record the Key ID and
   the developer account's Team ID.
5. Set all four Compass values below and rebuild/deploy the affected services.
   Check `/api/config` reports `providers.apple.signIn: true`.

In the portal, use **Identifiers > + > App IDs > App**, enter a description
and an explicit bundle ID, select **Sign In with Apple**, and keep it enabled
as a primary App ID. Review the details before registering it. For the web
identifier, use **Identifiers > + > Services IDs**, then open the registered
Services ID, enable **Sign In with Apple**, and choose **Configure** to select
the primary App ID and enter the domains and return URLs. Save both the web
configuration and the Services ID changes.

Use **Keys > +** to create the sign-in key, select **Sign in with Apple**, and
configure it for the same primary App ID. Download the `.p8` immediately:
Apple only allows one download. Keep the file outside the repository and put
its contents only in the deployment secret. The sign-in key is separate from
an App Store Connect API key used for app distribution or notarization.

For the hosted Compass environments, register:

| GitHub environment | Domain | Return URL |
| --- | --- | --- |
| `staging-cloud` | `staging.compasscalendar.com` | `https://staging.compasscalendar.com/api/auth/apple/callback` |
| `staging-selfhosted` | `selfhosted.compasscalendar.com` | `https://selfhosted.compasscalendar.com/api/auth/apple/callback` |
| `production` | `www.compasscalendar.com` | `https://www.compasscalendar.com/api/auth/apple/callback` |

Apple does not accept `localhost` or an IP address as the web callback host.
Local sign-in testing needs a public HTTPS hostname routing to the local
backend, with its return URL registered on the Services ID.

After deploying staging, verify the config flag and complete an Apple login.
Record which environments are configured in the setup issue without including
private key contents. Repeat verification after the approved production deploy.

Follow Apple's [web configuration guide](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web).

These are the Compass config keys. Add the matching GitHub
Environment variables and secrets on `staging-cloud`, `staging-selfhosted`,
and `production` for each deployment that supports Apple sign-in.

Sign in with Apple (identity only; it does not grant calendar access):

```yaml
apple:
  signIn:
    servicesId: <services-id>
    teamId: <team-id>
    keyId: <key-id>
    privateKey: <p8-key-contents>
```

All four values are required together. The web bundle bakes the Services ID
at build time.

In Apple Developer, the Services ID Return URL must be a POST to the
backend, not the SPA:

```
POST {BACKEND_URL}/api/auth/apple/callback
```

Apple posts the authorization result (`response_mode=form_post`). Compass
reads `code` and `state` from that form body, then 302-redirects the browser
to:

```
{FRONTEND_URL}/auth/apple/callback?code=...&state=...
```

A missing or mismatched `state` is rejected (HTTP 400). Do not register the
SPA path as the Return URL. Apple will not GET that URL.

Apple may send a private relay address (`@privaterelay.appleid.com`) instead
of the user's real email. Compass keys the Apple identity by the id_token
`sub`, not by that email, so a later sign-in with a different relay still
resolves to the same user.

Apple includes the user's name only on the first authorization. Compass
stores that name when it is present. Later sign-ins omit it.

iCloud calendar connect uses an app-specific password. Compass stores it
encrypted at rest with a 32-byte base64 key:

```yaml
sync:
  credentialEncryptionKey: <32-byte-base64>
```

Omit `credentialEncryptionKey` to leave Apple calendar connect off. The
self-host installer generates this key on a fresh install.

GitHub Environment:

- Variables: `APPLE_SIGNIN_SERVICES_ID`, `APPLE_SIGNIN_TEAM_ID`,
  `APPLE_SIGNIN_KEY_ID`
- Secrets: `APPLE_SIGNIN_PRIVATE_KEY`, `SYNC_CREDENTIAL_ENCRYPTION_KEY`
