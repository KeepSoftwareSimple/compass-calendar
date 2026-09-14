# Meeting production release evidence (WP-13)

Recorded 2026-09-14. Related issue:
[#3719](https://github.com/KeepSoftwareSimple/compass-calendar/issues/3719).
This file does not enable production booking. Do not flip
`isBookingEnabled`.

## Recorded decision (needs human signature)

| Field | Value |
| --- | --- |
| Agent recommendation | **NO-GO** for production enable |
| Human go/no-go | **unsigned** (release owner) |
| Release owner | Tyler Dane |
| Intended provider set if later enabled | Google only (Google Meet conference) |
| Explicitly excluded | Microsoft, Apple |
| Production booking | remains disabled (`isBookingEnabled` is false in production) |
| Notification destination | Founder's PostHog account. Meeting alerts are **not armed** |
| Rollback / disable | Keep production `NODE_ENV` on the current `isBookingEnabled` path. Do not deploy a production `true`. If a future change enables it, revert that change and leave Meeting routes 404 in production |
| First-week review | Daily for seven days after a future production enable, then weekly. Sample-size caveat: do not promote a rate with fewer than 20 accepted operations in the window. Post-launch: [#3720](https://github.com/KeepSoftwareSimple/compass-calendar/issues/3720) |

The owner signs by commenting on #3719 (or merging a follow-up that
replaces **unsigned** above). Merging this document alone is not a
production enable.

## Launch work packages

| WP | Issue | State on 2026-09-14 |
| --- | --- | --- |
| 01 confirmed provider outcomes | #3707 | merged |
| 02 persist booking intent | #3708 | merged |
| 03 overlapping reschedules | #3709 | merged |
| 04 retry-safe edit identity | #3710 | merged |
| 05 DST slot boundaries | #3711 | merged |
| 06 destination readiness | #3712 | merged |
| 07 lossless notices | #3713 | merged |
| 08 telemetry privacy | #3714 | merged |
| 09 abuse budget | #3715 | merged |
| 10 host/guest funnels | #3716 | merged |
| 11 lifecycle/recovery signals | #3717 | merged as #3735 |
| 12 Meeting dashboards | #3718 | PR #3736, local `VERDICT: PASS`, not yet on `main` |

WP-14 (#3720) is post-launch and outside this milestone.

## Provider matrix

| Provider | Launch scope | Conference | Live invitation / calendar proof | Why |
| --- | --- | --- | --- | --- |
| Google | **intended** | Google Meet | **not verified here** | No authorized Google OAuth or real calendar in this environment. Do not infer consent from issue text |
| Microsoft | **excluded** | Teams when the mailbox allows it | **not verified** | [#3676](https://github.com/KeepSoftwareSimple/compass-calendar/issues/3676) is open (`agent-loop-needs-human`). `isMicrosoftOffered` is false in production |
| Apple | **excluded** | none | **not verified** | [#3253](https://github.com/KeepSoftwareSimple/compass-calendar/issues/3253) and [#3276](https://github.com/KeepSoftwareSimple/compass-calendar/issues/3276) are open. A Google-only launch must keep Apple out of the decision |

Stubbed Playwright covers Microsoft Teams copy and Apple no-video copy on
the public page. That is capability copy, not a live provider.

## Permitted evidence collected

Unauthenticated staging smoke
(`.github/scripts/agent-loop-staging-smoke.sh`) against
https://staging.compasscalendar.com: `/`, `/book/`, `/book/tylerdeane`,
`/meet/`, `/meet/tylerdeane` all returned HTTP 200. No login.

Playwright (stubbed APIs, Chromium desktop), 2026-09-14:

```text
bunx playwright test e2e/booking e2e/accessibility/booking-a11y.spec.ts
107 passed (1.9m)
```

Those specs cover host keyboard setup, guest timezone override, 375px
stacking, cancel/reschedule keyboard paths, in-flight confirm dedupe,
tokenized confirmation permalinks, and axe on booking settings. They do
not talk to Google, Microsoft, or Apple calendars.

Backend/Mongo and core tests already on `main` cover DST gap rejection
(`compute-booking-slots.test.ts`,
`public-booking.service.db.test.ts`), concurrent overlapping confirm and
reschedule, rate-limit 429 fail-closed, and retry-safe edit identity.
Those are harness proofs, not live provider events.

## PostHog (project 165441)

Dashboard: https://us.posthog.com/project/165441/dashboard/2093461
Runbook (WP-12): `docs/development/meeting-monitoring.md` on PR #3736.

| Tile | Readback 2026-09-14 |
| --- | --- |
| Staging guest funnel | 5 sessions viewed, 2 confirmed (40%, median 54s), test accounts included |
| Staging host funnel | 1 host completed settings → enabled → link copied |
| Production funnels | no-data (zeros), not a success rate |
| Completion rate 30m | `accepted=0`, `completed_success=0`, `completion_rate=(null)` |
| Infra failure rate 30m | `infra_failure_rate=(null)`, `sample_gate=manual_review` |
| Heartbeat freshness | `heartbeat_samples=0`, gauges `(null)`, `telemetry_status=missing_telemetry` |

Empty server tiles are expected until #3735 is deployed and emits
`booking_operation`. Missing telemetry is not an idle queue and not 0%
failure.

Launch alert rules (exhausted recovery, oldest pending on two heartbeats,
infra failure >5% with ≥20 accepted / 30 minutes, heartbeat absent) are
evaluated in `packages/scripts/src/testing/meeting-dashboard.test.ts` on
PR #3736. They are not armed.

## Gaps that keep this a NO-GO

- No real Google Meet create / invite / conference / edit / cancel /
  reschedule against a provider calendar in this run.
- Two-guest contention, notes after host move, reconnect, and
  cross-replica rate limits were not re-run on staging with authorized
  accounts.
- WP-11 heartbeat and operation events are not in live PostHog yet.
- Microsoft and Apple remain unverified and out of launch scope.

## What the owner still has to do

1. Sign go or no-go on #3719.
2. If go: only after a Google Meet staging sweep with authorized
   accounts, WP-12 on `main` and deployed, and a written enable of
   production booking in a separate change. This file is not that change.
3. If no-go: leave production disabled. Use this matrix as the recorded
   exclusion list.
