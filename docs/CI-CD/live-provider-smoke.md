# Live provider smoke

Nightly (and `workflow_dispatch`) run of the shared adapter contract suite
against real Google, Microsoft, and Apple test accounts. It never runs on
pull requests. Workflow: [`.github/workflows/live-provider-smoke.yml`](../../.github/workflows/live-provider-smoke.yml).

The job uses GitHub Environment `provider-smoke`. It does not read staging
or production deploy secrets. A provider whose secrets are absent is skipped
and emitted as a `::warning::`. If that provider is listed in
`SMOKE_EXPECTED_PROVIDERS`, the job then fails and posts to the Discord errors
webhook, same as a failed run. Unexpected skips still leave the job green.
The summary line (`live-provider-smoke passed=... skipped=... failed=...`) is
printed and appended to the GitHub Actions step summary.

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
| `SMOKE_EXPECTED_PROVIDERS` | Comma-separated providers that must not be skipped (for example `microsoft`). Empty means a skip is a warning, not a failure. |

## Test calendar

On each connected account, create a calendar named exactly `compass-smoke`
and leave it writable. The suite refuses to run if that calendar is missing
and never writes to any other calendar.

## Setting up Microsoft in one run

There is no Microsoft-provided way to generate a long-lived refresh token
from the admin center, and hand-copying one between shells is how the
Microsoft leg ended up storing a token that never refreshed. Use the repo's
script instead; it does the whole setup and only writes secrets it has just
proven to work:

```bash
bun run microsoft:mint-token
```

What it does, in order:

1. Resolves the target repo (`gh repo view`, or `--repo owner/name`) and
   Environment (`provider-smoke`, or `--env`), and prints both.
2. Takes the client id from `MICROSOFT_CLIENT_ID` or the Environment's
   `MICROSOFT_CLIENT_ID` variable, and the client secret from
   `MICROSOFT_CLIENT_SECRET` or a hidden terminal prompt.
3. Opens Microsoft sign-in on the registered local redirect
   `http://localhost:3010/sync/microsoft`. Sign in with the dedicated
   smoke-test Microsoft account, not a real user's. The script never sees the
   password, only the OAuth redirect.
4. Exchanges the code, then refreshes the new token once, which is the first
   call the nightly job makes. A token that fails here never gets stored.
5. Finds a writable `compass-smoke` calendar on the account, creating it if
   it is missing.
6. Writes `MICROSOFT_CLIENT_ID` (variable), `MICROSOFT_CLIENT_SECRET` and
   `SMOKE_MICROSOFT_REFRESH_TOKEN` (secrets) to the Environment with `gh`.
   The token is never printed.

Pass `--print-only` to stop after step 5 and print the token instead of
writing anything, for example when the smoke job runs somewhere other than
GitHub Actions.

Refresh tokens for this app are long-lived but not permanent; re-run the
script if the smoke job starts reporting `authorizationRevoked` for
Microsoft.

## Dispatch

```bash
gh workflow run live-provider-smoke.yml
# Or against a branch (the Environment has no branch policy):
gh workflow run live-provider-smoke.yml --ref <branch>
```

After the first Microsoft proof, set the Environment variable so a skip cannot
hide behind a green job:

```bash
gh variable set SMOKE_EXPECTED_PROVIDERS --env provider-smoke --body microsoft
```

Apple runs when `SMOKE_APPLE_EMAIL` and `SMOKE_APPLE_APP_PASSWORD` are present
in the `provider-smoke` Environment.
