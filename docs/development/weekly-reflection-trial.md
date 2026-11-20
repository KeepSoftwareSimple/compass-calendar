# Weekly reflection private trial

This runbook covers operator preparation and activation of the private weekly
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
when a confirmed birthday exists, the named PDF. The PDF contains the Life View
image and a clickable link to the configured app's `/life` page. `--output <directory>` selects
another directory. Use a Sunday date for `--weekly`. Inspect the Sunday
date windows, factual event titles, week/month memory labels, quote, plain app
URL, the email's life percentage, and the PDF grid and footer link at desktop
and phone widths.
Previews may show an incomplete-history notice. General enrollment cannot bypass
the coverage gate. Previews do not create a real send or call the email provider.

## Activate or stop only the private weekly trial

After code verification and the environment's required activation approval,
set `email.reflection.enabled: true`, keep `rolloutEnabled: false`, and deploy or
restart the intended backend using the normal approved procedure. Then:

```sh
bun cli reflection enable --user-id <user-id>
bun cli reflection enable --user-id <user-id> --apply
```

The command requires the configured trial binding, provider, unsubscribe secret,
saved settings, and an account without provider suppression. The weekly send is
scheduled for Sunday at 10:30 a.m. in the saved timezone, with DST observed. A send that
cannot be attempted by local noon expires instead of replaying old morning
editions later. There is no automatic immediate-send command.

Verify an actual received email and its PDF attachment in the user's email
client before considering inbox presentation validated. Do not infer inbox
delivery from a local render or a provider acceptance response.

Stop the trial and cancel queued editions:

```sh
bun cli reflection disable --user-id <user-id> --apply
```

The reflection unsubscribe link also stops this sequence without changing welcome
or booking preferences. Setting `email.reflection.enabled: false` is the global
delivery switch and does not disable calendar sync.

## December 6, 2026 population rollout

The requested schedule supersedes the earlier daily trial and onboarding-only
rollout: send to the private account weekly until December 6, then include
existing and new eligible accounts. Reviews remain Sunday at 10:30 a.m. in the
saved timezone, observing DST. The next private editions after November 16 are
November 22 and 29. December 6 is the first general edition.

Prepare these GitHub Environment variables for the intended deployment:

| Variable | Value |
| --- | --- |
| `REFLECTION_ENABLED` | `true` |
| `REFLECTION_ROLLOUT_ENABLED` | `true` |
| `REFLECTION_ROLLOUT_START_DATE` | `2026-12-06` |
| `REFLECTION_ENROLL_EXISTING` | `true` |

Keep the existing private account ID and destination secrets. The generated
runtime config is equivalent to:

```yaml
email:
  # Preserve the existing provider, sender, credentials, and unsubscribe secret.
  reflection:
    enabled: true
    rolloutEnabled: true
    rolloutStartDate: "2026-12-06"
    enrollExisting: true
    # Preserve the real trialUserId and trialEmail privately.
```

The two rollout flags alone do not bypass the date. Both scheduling and dispatch
check the recipient's local date, including onboarding reviews. Before that
local date only the bound trial account can receive reviews. Afterward the trial
account uses ordinary weekly delivery and the ordinary history gate. Queued
legacy daily editions are skipped. Existing sent editions prevent a second
review for the same local date; weekly edition IDs remain stable across replicas.

Population preparation initializes only accounts without reflection preferences.
It preserves saved timezones and calendar exclusions, explicit pauses, review
unsubscribes, provider suppression, and synthetic-account exclusion. A welcome
unsubscribe also excludes a previously unenrolled account. Accounts without
saved timezone settings start in UTC and can change it in Notifications.
Enrollment does not fabricate birthdays. General reviews still require complete
calendar history; an incomplete account waits rather than receiving an
unverified review. Users already paused are never silently re-enabled.

### Production configuration preflight, November 16

Read-only inspection of the GitHub production Environment found
`REFLECTION_ENABLED=true` and `REFLECTION_ROLLOUT_ENABLED=false`. Both private
binding secrets and all three email delivery/unsubscribe/webhook secrets are
present by name; secret contents and running database state were not inspected.
The rollout date and existing-account enrollment variables are not yet set.
No production variables or secrets were changed. Set the rollout flags only
with deployment of the build containing the date gate; older builds ignore
the new date and must not be activated for general delivery.

### November 19 release preparation evidence

- User approved the latest inbox presentation and authorized release, readiness
  work, deployment, and activation ahead of December 6.
- Production inventory: 986 non-synthetic accounts, 985 eligible for initial
  enrollment, one welcome unsubscribe excluded. One account has a saved
  reflection timezone; remaining accounts use the documented UTC fallback.
- Initial coverage scan: 176 complete, 809 incomplete, no service errors,
  2,246 selected calendars. Metadata reads were 95 ms median and 663 ms maximum.
  Missing supported history is being enqueued through the existing Sync jobs;
  this inventory is not proof that the backfill has completed. The first applied
  pass enqueued 1,105 supported history jobs, with two request errors and no
  unsupported calendars. A follow-up pass only enqueues calendars whose
  connections are usable.
- Staging rehearsal used an isolated, cleaned-up Mongo database and the release
  scheduler code. November 29 queued only the private recipient; December 6 and
  December 13 each queued both eligible fixture recipients. Concurrent cycles
  produced no duplicate editions. Paused, suppressed, and unsubscribed fixtures
  received no queued editions. No provider sends were made.
- Dense-history reads formerly expanded up to 25 records across eight windows
  in one page. The page now bounds total record/window projections to 25 and
  preserves cursor completeness. Regression coverage drains 200 occurrences
  across eight windows without loss or duplicates. No API timeout was widened.
- Production Sync inventory separately found 744 Google connections requiring
  reauthorization. This is a connection count across all Sync principals, not a
  count of eligible accounts. Owners must reconnect; imports cannot restore
  revoked OAuth grants. Public preparation and final dispatch recheck the
  availability of selected calendar connections. Keep unavailable accounts
  behind the delivery gate. The OAuth follow-up is tracked separately.
- Regular reviews prepare at most four recipients concurrently. Provider sends
  remain sequential with the existing pacing, and a failed provider request
  does not block later recipients. Welcome and booking dispatch remain serial.

This section records preparation evidence. The release issue records the final
verification, deployed tag, completed coverage scan, and activation read-back:
[#5317](https://github.com/KeepSoftwareSimple/compass-calendar/issues/5317).

### Preparation and verification

1. Run `bun run verify --strict`. Rehearse the generated config on staging with
   the staging email allowlist retained. Verify no non-trial review before the
   configured date, a weekly edition on the date, and no duplicate after retry
   or restart. Use a staging-only date for that rehearsal.
2. Inspect coverage with `bun cli reflection status --all`. Run
   `bun cli reflection history --all` for a read-only backfill plan; the
   separately authorized `--all --apply` enqueues missing supported coverage.
   Recheck status until histories are complete. Successful enqueueing alone
   is not readiness. Resolve coverage failures before the launch.
3. Render `bun cli reflection preview --weekly --date 2026-12-06` using the
   private binding. Inspect the HTML, text, and optional Life View PDF.
   Verify actual received November 22 and November 29 editions for calendar
   accuracy, attachment opening, and unsubscribe behavior.
4. Review actual cohort size and dispatch throughput against the 10:30-to-noon
   delivery window in each timezone. Account for other email sequences,
   provider limits, rendering time, and retries. The scheduler currently selects
   at most 25 due accounts per 60-second poll, a theoretical ceiling of 2,250
   per 90-minute timezone window per active backend before overhead. Confirm the production
   environment has the existing valid sender and webhook/unsubscribe secrets;
   production must not use the staging allowlist.
5. After required production approval, deploy these settings before December 6.
   Verify the running config retains the start date across redeployment and
   that only the trial account sends before launch. No December 6 deploy or
   manual enrollment command is required after this activation.
6. On December 6 inspect reflection queue age, queued/sent/skipped/failed counts,
   incomplete-history failures, bounce/complaint signals, and actual receipt.
   Recheck December 13 to confirm weekly continuation. Skipped noon deadlines
   are not replayed as stale emails.

### Rollback

Set `REFLECTION_ROLLOUT_ENABLED=false` and redeploy to return to private-only
weekly sending. Leave `REFLECTION_ENROLL_EXISTING=false` to stop further
population initialization as well. Set `REFLECTION_ENABLED=false` to stop all
reflection delivery, including the trial. Dispatch rechecks these gates; calendar
sync, welcome emails, and booking alerts continue independently. Persisted
preferences remain available for a later reviewed restart. To stop the private
account and cancel its queue, use the disable command above.

This runbook prepares activation; it does not assert that production variables,
history backfills, inbox checks, or deployment have been completed. Production
deployment follows the approval/escalation rule in AGENTS.md.
