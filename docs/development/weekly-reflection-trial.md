# Weekly reflection private trial

This runbook covers operator preparation and activation of the private daily
trial. Read the [implementation plan](../features/weekly-reflection-plan.md) for
the agreed behavior and the pull request for verification evidence and remaining
rollout prerequisites. A successful local preview is not production deployment
approval. Follow AGENTS.md for production changes.

## Configuration and account setup

Use the intended environment's private `compass.yaml` through the existing
`COMPASS_CONFIG_FILE` mechanism. Keep its email provider credentials and
unsubscribe secret configured as for other Compass emails. Add these fields
under the existing `email` block, initially leaving delivery disabled:

```yaml
email:
  # Preserve the existing provider, sender, credentials, and unsubscribe secret.
  reflection:
    enabled: false
    rolloutEnabled: false
    # Fill these after resolving the approved account below.
    trialUserId: "<approved account's 24-character user ID>"
    trialEmail: "<approved destination email>"
```

The optional trial fields may be omitted until their real values are known;
the placeholders above are explanatory and are not valid runnable configuration.
If the environment has an email allowlist, it must also include the destination.
The `log` provider renders without delivering to an inbox.

Hosted deployments regenerate `compass.yaml` from the selected GitHub Environment.
Configure the following inputs there so the trial settings survive redeploys:

| Input | GitHub Environment storage | Value |
| --- | --- | --- |
| `REFLECTION_ENABLED` | Variable | `false` initially, `true` only for approved activation |
| `REFLECTION_ROLLOUT_ENABLED` | Variable | `false` throughout the private trial |
| `REFLECTION_TRIAL_USER_ID` | Secret | Existing account ID resolved below |
| `REFLECTION_TRIAL_EMAIL` | Secret | Approved destination address |

Unset delivery flags default to `false`. Flags accept only `true` or `false`.
Trial bindings are written into private runtime configuration and are not logged.
Manual edits to generated hosted configuration are replaced by the next deploy.
The birthday stays in the account database, seeded from the private input below.

Create a private JSON file outside the checkout with the confirmed account
email, birthday, timezone, and calendar exclusions. The birthday must be an
actual `YYYY-MM-DD` date, and `excludedCalendarIds` defaults to an empty array.
Do not commit the file or put personal data into command-line arguments.

```json
{
  "recipientEmail": "you@example.com",
  "birthDate": "1990-02-03",
  "timeZone": "America/Denver",
  "excludedCalendarIds": []
}
```

Resolve the existing real account with a dry run, then save its settings:

```sh
bun cli reflection setup --input /private/path/reflection-setup.json
bun cli reflection setup --input /private/path/reflection-setup.json --apply
```

Setup displays the immutable user ID and rejects an ambiguous, missing, or
synthetic account. It saves the confirmed birthday and timezone with delivery
disabled. Copy the resolved ID and approved destination into private trial
configuration. Review exclusions against the calendars the user has enabled in
Compass; initial browser-local visibility cannot be inferred by an operator.

## Historical coverage and unsent previews

Pass the resolved ID explicitly, or omit `--user-id` after configuring the trial:

```sh
bun cli reflection status --user-id <user-id>
bun cli reflection history --user-id <user-id>
bun cli reflection history --user-id <user-id> --apply
```

`status` and the history dry run are read-only. The applied history command
enqueues background import/repair work through Sync and reports unsupported
calendar IDs. Sync must run in active execution mode to enqueue this work.
Completion is checked with `status`, not inferred from successful enqueueing.
A legacy incremental cursor alone does not prove complete historical coverage.

Google and Apple full reads are unbounded. Microsoft uses the supported Graph
v1.0 event snapshot with explicit series exception/cancellation hydration; its
refreshes stage a replacement generation so removed provider events disappear
only after a complete snapshot. Background repairs checkpoint committed pages
and retain the active occurrence generation during interrupted or unusable
passes. Coverage is certified only after successful cleanup with no skipped
records.

Render an email without sending it:

```sh
bun cli reflection preview --user-id <user-id>
bun cli reflection preview --user-id <user-id> --weekly --date 2026-11-08
```

The default output is a temporary directory containing HTML, plain text, and,
when a confirmed birthday exists, the named PNG. `--output <directory>` selects
another directory. Use a Sunday date for `--weekly`. Inspect the daily and Sunday
date windows, factual event titles, week/month memory labels, quote, plain app
URL, life-grid count, and opened PNG at desktop and phone widths.
Previews may show an incomplete-history notice. General enrollment cannot bypass
the coverage gate. Previews do not create a real send or call the email provider.

## Activate or stop only the private daily trial

After code verification and the environment's required activation approval,
set `email.reflection.enabled: true`, keep `rolloutEnabled: false`, and deploy or
restart the intended backend using the normal approved procedure. Then:

```sh
bun cli reflection enable --user-id <user-id>
bun cli reflection enable --user-id <user-id> --apply
```

The command requires the configured trial binding, provider, unsubscribe secret,
saved settings, and an account without provider suppression. The daily send is
scheduled for 10:30 a.m. in the saved timezone, with DST observed. A send that
cannot be attempted by local noon expires instead of replaying old morning
editions later. There is no automatic immediate-send command.

Verify an actual received email and its PNG attachment in the user's email
client before considering inbox presentation validated. Do not infer inbox
delivery from a local render or a provider acceptance response.

Stop the trial and cancel queued editions:

```sh
bun cli reflection disable --user-id <user-id> --apply
```

The reflection unsubscribe link also stops this sequence without changing welcome
or booking preferences. Setting `email.reflection.enabled: false` is the global
delivery switch and does not disable calendar sync.

## General rollout boundary

Keep `rolloutEnabled: false` until the user approves the trial and all rollout
prerequisites are satisfied. The future weekly cadence is Sunday at 10:30 a.m.
in each enrolled user's saved timezone. Enrollment remains opt-in.

For a separately authorized history backfill, `bun cli reflection history --all`
inspects accounts and `--all --apply` enqueues missing supported coverage. These
commands do not enroll users in email. Unsupported provider calendars remain a
rollout blocker until their supported history strategy is implemented and tested.
