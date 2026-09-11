# Connect Microsoft Calendar

## Register the application

In the Microsoft Entra admin center, open **App registrations > New
registration**. Choose accounts in any organizational directory and personal
Microsoft accounts. Compass uses delegated access; do not add application
permissions.

Register two Web redirect URIs per deployment, both exact matches (scheme,
host, port, path):

| Flow | URI shape | Origin it uses |
|---|---|---|
| Connect a calendar | `<origin>/sync/microsoft` | the sync service's public origin (`sync.callbackBaseUrl`); on the hosted deployments this is the frontend origin, which proxies `/sync` |
| Sign in with Microsoft | `<origin>/auth/microsoft/callback` | the web app origin |

The hosted Compass app registers eight: both shapes on
`https://compasscalendar.com`, `https://staging.compasscalendar.com`, and
`https://selfhosted.compasscalendar.com`, plus
`http://localhost:3010/sync/microsoft` and
`http://localhost:9080/auth/microsoft/callback` for development. For a
self-hosted instance, register both shapes on your own origins. Local ports
must match the URLs printed by your development environment.

Under Microsoft Graph delegated permissions, add `offline_access`,
`User.Read`, `Calendars.ReadWrite`, and `People.Read`. Under **Certificates &
secrets**, create a client secret and record its expiry in your private
operations records. Store the secret value, not its identifier.

For work-tenant consent, complete publisher verification through your
Microsoft AI Cloud Partner Program account and associate the verified
publisher with the app (Branding & properties > Add MPN ID). The hosted
Compass app is a verified publisher (SIMPLE SOFTWARE LLC, verified
2026-09-11), so its consent screen shows the verified badge with no
"unverified app" warning. A brand-new registration can be refused
verification for about 24 hours (`UnableToAddPublisher`); retry the next
day. Tenant policies can still require administrator consent. See
Microsoft's [registration guide](https://learn.microsoft.com/en-us/graph/auth-register-app-v2)
and [publisher verification requirements](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview).

## Configure Compass

These are the Compass config keys. Add the matching GitHub
Environment variables and secrets on `staging-cloud`, `staging-selfhosted`,
and `production` for each deployment that supports Microsoft.

```yaml
microsoft:
  clientId: <entra-app-client-id>
  clientSecret: <entra-app-client-secret>
```

Both values are required together. The app registration uses the Entra
`/common` endpoint so personal and work or school accounts work with one
registration.

GitHub Environment:

- Variable: `MICROSOFT_CLIENT_ID`
- Secret: `MICROSOFT_CLIENT_SECRET`

The web bundle bakes `MICROSOFT_CLIENT_ID` at build time (same as Google).
Rebuild the web image after changing it.

## Verify and troubleshoot

After deploying configuration, check `/api/config`: Microsoft `signIn` and
`connect` should be enabled. Then prove the chain with a real account:
sign in with Microsoft, connect the calendar, create an event in Compass and
find it in Outlook, edit it in Outlook and see the edit in Compass after a
reload, and make a booking through `/meet`. The hosted staging deployment
passed this on 2026-09-11 with a personal Microsoft account; the results are
recorded on the tracking issue (#3208). Repeat it after any change to the
registration, the client secret, or the redirect URIs.

Use an account that has a mailbox. An Entra admin user without a Microsoft
365 license can sign in and mint tokens, but Graph has no calendars for it and
every calendar read fails (HTTP 404, `MailboxNotEnabledForRESTAPI`).

The nightly live smoke covers the adapters after that. To set it up, run
`bun run microsoft:mint-token` as described in
[`docs/CI-CD/live-provider-smoke.md`](../CI-CD/live-provider-smoke.md).

For `consentRequired`, reconnect and review the requested permissions. If
the tenant requires administrator consent, its administrator must approve
the delegated permissions. For redirect mismatch errors, compare the full
registered URI, including scheme, port, and path, with the callback sent by
Compass. For invalid-client errors, check the secret value and expiry and
restart the services after updating configuration.
