# Welcome email staging verification

PostHog project 165441 (Switchback, UTC). Work through this list on
**staging-cloud** after WP-05 deploy wiring is live and the founder has set
GitHub Environment values from WP-00 (#3913).

Founder-only: sign in on staging. Unattended agents never enter credentials.

## Preconditions

- The `email:` block is present in staging `compass.yaml` (see deploy logs:
  `Email config: writing email block`).
- `email.scheduleProfile` is **`fast`** so the five-step sequence completes in
  about twelve minutes.
- `email.allowlist` holds team staging addresses only.
- Resend reserved test addresses for bounce and complaint checks are recorded
  in WP-00 (#3913), not in this doc.

## Acceptance checks (WP-06)

Record pass or fail on issue #3919 with row statuses, PostHog event names, and
message headers where relevant. Do not paste secret values.

| # | Check | Expected |
| --- | --- | --- |
| 1 | Sign up a fresh staging account | five `queued` rows, `sendAt` spaced by minutes |
| 2 | Wait one poll | step one is `sent` with a `providerMessageId`, and the mail arrives |
| 3 | Inspect the received message | text part present, both `List-Unsubscribe` headers present, links carry UTM tags |
| 4 | Reset a `sent` row to `queued` by hand | the provider dedupes on the idempotency key; no second copy arrives |
| 5 | Point `EMAIL_API_KEY` at a bad key, redeploy, wait | `attemptCount` climbs with backoff, the row lands `failed` after five attempts, nothing sends twice |
| 6 | Enroll the provider bounce test address | the webhook sets `suppressedAt`, remaining rows go `canceled`, `email_bounced` is captured |
| 7 | Enroll the provider complaint test address | the same, via `email_complained` |
| 8 | Click the footer unsubscribe link | the confirmation page renders, `unsubscribedAt` is set, remaining rows go `canceled` |
| 9 | Connect a calendar before step three is due | that row lands `skipped`, not `sent` |
| 10 | Sign up an address outside the allowlist | the row lands `skipped`, nothing sends |
| 11 | Delete the staging account | the rows are gone |
| 12 | Redeploy with the `email:` block removed | no enrollment, no poller, startup clean |
| 13 | Check PostHog | `email_send_heartbeat` arriving with `environment=staging`, one `email_sent` per delivered step |

Restore `EMAIL_API_KEY` after check 5 and re-enable the `email:` block after
check 12.

Two-replica claim exclusivity is covered by the database test in #3915, not
this runbook.

## PostHog signals

| Event | Distinct id | Notes |
| --- | --- | --- |
| `email_send_heartbeat` | `compass-backend-email` | Every five minutes while the poller runs; includes `queued_count`, `oldest_queued_age_ms`, `failed_count_24h`, `environment`, deploy `version` |
| `email_sent` | Compass user id | Property `step` is the welcome step key |
| `email_skipped` | Compass user id | Allowlist, `skipIf`, validation |
| `email_failed` | Compass user id | Row reached `failed` after retries |
| `email_bounced` | Compass user id | Provider webhook |
| `email_complained` | Compass user id | Provider webhook |
| `email_unsubscribed` | Compass user id | Unsubscribe confirmation |

Filter staging with `environment=staging` on per-send events and heartbeat
properties.

## Launch alerts (evaluate, do not notify yet)

Add these when the release owner arms PostHog alerts (same pattern as
[Meeting monitoring](./meeting-monitoring.md)):

| Signal | Fire when | Cadence |
| --- | --- | --- |
| Provider complaint rate | Resend complaint rate above **0.1%** | Match provider dashboard / weekly review |
| Email send failures | `failed_count_24h` &gt; 0 on **`email_send_heartbeat`** | Two consecutive 5-minute heartbeat samples (10 minutes) |

Also confirm heartbeat freshness: zero `email_send_heartbeat` samples in 10
minutes while the `email:` block is configured means the poller or PostHog path
is down, distinct from an empty queue (`queued_count=0` with samples present).

## Startup confirmation

After deploy, backend logs include one line (no addresses):

`Welcome email: provider=<resend|log>, allowlist=<N> address(es)`

Config is read once at startup; this line confirms a redeploy picked up
allowlist or provider changes.
