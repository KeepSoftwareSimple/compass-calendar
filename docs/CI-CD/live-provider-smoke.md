# Live provider smoke

Nightly (and `workflow_dispatch`) run of the shared adapter contract suite
against real Google, Microsoft, and Apple test accounts. It never runs on
pull requests. Workflow: [`.github/workflows/live-provider-smoke.yml`](../../.github/workflows/live-provider-smoke.yml).

The job uses GitHub Environment `provider-smoke`. It does not read staging
or production deploy secrets. A provider whose secrets are absent is skipped,
not failed, so a green run does not by itself mean every provider passed.
Check the summary line the job prints (`live-provider-smoke passed=... skipped=... failed=...`)
before trusting a green run.

Events are created only on a calendar named `compass-smoke`. Every created
event's description carries the GitHub run id. A teardown step deletes
leftovers older than one day. Failure posts to the Discord errors webhook
with the provider name.

## Create the Environment

GitHub → Settings → Environments → New environment → `provider-smoke`.
Do not grant it access to staging or production secrets.

Copy the staging Google and Microsoft OAuth clients into this Environment
as well: the smoke process calls the provider APIs directly.

## Secrets and variables to paste

Environment secrets:

| Name | Value |
|---|---|
| `SMOKE_GOOGLE_REFRESH_TOKEN` | Refresh token for the Google test account that owns `compass-smoke` |
| `SMOKE_MICROSOFT_REFRESH_TOKEN` | Refresh token for the Microsoft test account |
| `SMOKE_APPLE_EMAIL` | iCloud email for the Apple test account |
| `SMOKE_APPLE_APP_PASSWORD` | iCloud app-specific password |
| `GOOGLE_CLIENT_SECRET` | Same Google OAuth client secret as staging |
| `MICROSOFT_CLIENT_SECRET` | Same Entra client secret as staging |
| `DISCORD_ERRORS_WEBHOOK_URL` | Discord errors webhook (duplicate of the repo secret so this Environment does not read repo secrets) |

Environment variables:

| Name | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | Same Google OAuth client id as staging |
| `MICROSOFT_CLIENT_ID` | Same Entra client id as staging |

## Test calendar

On each connected account, create a calendar named exactly `compass-smoke`
and leave it writable. The suite refuses to run if that calendar is missing
and never writes to any other calendar.

## Minting SMOKE_MICROSOFT_REFRESH_TOKEN

There is no Microsoft-provided way to generate a long-lived refresh token
from the admin center, so use the repo's own script. It runs the same
authorization-code exchange the app uses, against a local redirect URI that
is already registered on the Entra app:

```bash
bun run microsoft:mint-token
```

It reads `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` from the
environment or `compass.yaml`, prints a Microsoft sign-in URL, and waits on
`http://localhost:3010/sync/microsoft` for the OAuth redirect. Open the URL,
sign in with the dedicated smoke-test Microsoft account (not a real user's),
and the script prints the refresh token and granted scopes. The script never
sees the account password, only the OAuth redirect.

Paste the printed value into the Environment:

```bash
gh secret set SMOKE_MICROSOFT_REFRESH_TOKEN --env provider-smoke --body "<token>"
```

Refresh tokens for this app are long-lived but not permanent; re-run the
script if the smoke job starts reporting `authorizationRevoked` for
Microsoft.

## Dispatch

```bash
gh workflow run live-provider-smoke.yml
```

Apple runs when `SMOKE_APPLE_EMAIL` and `SMOKE_APPLE_APP_PASSWORD` are present
in the `provider-smoke` Environment.
