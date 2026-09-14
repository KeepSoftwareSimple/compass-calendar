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

The owner records this NO-GO by merging
[#3737](https://github.com/KeepSoftwareSimple/compass-calendar/pull/3737)
through the merge queue. That merge does not enable production booking.

## WP-13 acceptance (this run)

| Criterion | Result | Evidence |
| --- | --- | --- |
| WP-01 through WP-12 merged with required checks | **pass** | Issues #3707–#3718 closed. Last launch merge: #3736 on `main` |
| Google Meet live invitation / conference / edit / cancel / reschedule | **blocked** | No Google OAuth in this VM. Nightly adapter smoke skipped Google (run 34743488032). Do not infer consent from issue text |
| Microsoft in launch set | **excluded** | #3676 open. `isMicrosoftOffered` is false in production |
| Apple in launch set | **excluded** | #3253 and #3276 open. No conference capability |
| Two guests / overlapping reschedule / in-flight create | **harness pass, not live** | `public-booking.service.db.test.ts`: 5 overlapping tests pass |
| Keyboard, 375px, guest timezone, DST boundaries | **harness pass, not live calendar** | Playwright 107 passed. Core DST 10/10. Service DST 2/2 |
| Token / privacy interception | **harness pass** | `booking-telemetry.test.ts` and `posthog-booking-filter.util.test.ts` 14/14 |
| Cross-replica public rate limits | **harness pass, not staging multi-replica** | `booking.rate-limit.db.test.ts` 15/15, including 429 |
| PostHog dashboard, pending/recovery, unarmed alerts | **pass (no-data honest)** | Dashboard 2093461. Heartbeat still `missing_telemetry` |
| Explicit human go/no-go | **unsigned** | Agent recommendation is NO-GO. Owner has not signed |

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
| 12 Meeting dashboards | #3718 | merged as #3736 |

WP-14 (#3720) is post-launch and outside this milestone.

## Provider matrix

| Provider | Launch scope | Conference | Live invitation / calendar proof | Why |
| --- | --- | --- | --- | --- |
| Google | **intended** | Google Meet | **not verified here** | No authorized Google OAuth in this VM. Nightly adapter smoke skipped Google (secrets absent in `provider-smoke`, run 34743488032) |
| Microsoft | **excluded** | Teams when the mailbox allows it | **not verified** | [#3676](https://github.com/KeepSoftwareSimple/compass-calendar/issues/3676) is open (`agent-loop-needs-human`). `isMicrosoftOffered` is false in production |
| Apple | **excluded** | none | **not verified** | [#3253](https://github.com/KeepSoftwareSimple/compass-calendar/issues/3253) and [#3276](https://github.com/KeepSoftwareSimple/compass-calendar/issues/3276) are open |

Stubbed Playwright covers Microsoft Teams copy and Apple no-video copy on
the public page. That is capability copy, not a live provider.

`isBookingEnabled` is on in development, staging, and tests, and off in
production (`packages/core/src/util/env.util.test.ts`, 6/6).

## Live HTTP (unauthenticated)

| Target | Result |
| --- | --- |
| `GET https://staging.compasscalendar.com/api/health` | 200 `{"status":"ok"}` |
| `GET https://compasscalendar.com/api/health` | 200 `{"status":"ok"}` |
| Staging SPA `/`, `/book/`, `/meet/`, `/meet/tylerdeane` | HTTP 200 (Caddy HTML shell, not 5xx) |
| Staging `GET /api/booking/pages/{tylerdeane,tyler-dane,compasscaltest3,tyler}` | 404 JSON `PAGE_NOT_FOUND` (routes are mounted; these documented slugs are off or missing). Rechecked 2026-09-14T03:46Z |
| Staging guest `/meet/tylerdeane` | UI: "Meeting page not found" / host has turned this page off |
| Production `GET /api/booking/pages/tylerdeane` | 404 HTML `Cannot GET /api/booking/pages/tylerdeane` (routes not registered). Rechecked 2026-09-14T03:46Z |
| Production `/meet/tylerdeane` | App 404: "This isn't part of the app, matey" |

No login. The smoke script's HTTP 200 on `/meet/tylerdeane` is the SPA.
The booking API is the source of truth for whether a page exists.
Unauthenticated probes used only repo-documented slugs. They did not
enumerate other usernames.

## Harness evidence (2026-09-14)

Playwright, stubbed APIs, Chromium desktop:

```text
bunx playwright test e2e/booking e2e/accessibility/booking-a11y.spec.ts
107 passed (1.9m)
```

Those specs cover host keyboard setup, guest timezone override, 375px
stacking, cancel/reschedule keyboard paths, in-flight confirm dedupe,
tokenized confirmation permalinks, and axe on booking settings. They do
not talk to Google, Microsoft, or Apple calendars.

Focused unit / Mongo reruns on this branch:

| Suite | Result |
| --- | --- |
| `compute-booking-slots.test.ts` (DST gap / fall-back) | 10 pass |
| `public-booking.service.db.test.ts` name `spring-forward` | 2 pass |
| `public-booking.service.db.test.ts` name `overlapping` | 5 pass |
| `booking.rate-limit.db.test.ts` | 15 pass |
| `booking-telemetry.test.ts` + `posthog-booking-filter.util.test.ts` | 14 pass |

## Live provider smoke (GitHub Actions)

Nightly adapter contract, not Meeting invitation or conference proof.
Contract: [Live provider smoke](../CI-CD/live-provider-smoke.md).
Run [34743488032](https://github.com/KeepSoftwareSimple/compass-calendar/actions/runs/34743488032)
on `main` at 2026-09-13T06:44Z: `passed=microsoft skipped=google apple failed=none`.

| Provider | Result | Notes |
| --- | --- | --- |
| Google | **skipped** | `SMOKE_GOOGLE_REFRESH_TOKEN` or Google client id/secret absent in the `provider-smoke` environment |
| Microsoft | adapter **pass** on calendar `compass-smoke` | Create/read/update/exceptions/delete only. Not a booking invite or Teams conference. Launch set still excludes Microsoft (#3676) |
| Apple | **skipped** | `SMOKE_APPLE_EMAIL` or app password absent |

This Cloud VM also has no `SMOKE_GOOGLE_*` or `GOOGLE_CLIENT_*` values.
`compass.yaml` is the example file with placeholder OAuth blocks.

## PostHog (project 165441)

Dashboard: https://us.posthog.com/project/165441/dashboard/2093461
Runbook: [Meeting monitoring](./meeting-monitoring.md).
Governed catalog consulted: no match (`metric-list` returned 0 rows).
Counts below are noncanonical HogQL plus a blocking dashboard refresh.

| Tile | Readback 2026-09-14T03:45Z |
| --- | --- |
| Staging guest funnel | 5 sessions viewed, 2 confirmed (40%, median 54s), test accounts included |
| Staging host funnel | 1 host completed settings → enabled → link copied |
| Staging 14-day event counts | page viewed 15, settings opened 14, link copied 6, page enabled 2, reservation created 2. Production: none |
| Production funnels | no-data, not a success rate |
| Completion rate 30m | `accepted=0`, `completed_success=0`, `completion_rate=(null)` |
| Infra failure rate 30m | `infra_failure_rate=(null)`, `sample_gate=manual_review` |
| Heartbeat freshness | `heartbeat_samples=0`, gauges `(null)`, `telemetry_status=missing_telemetry` |

`booking_operation` and `booking_operation_heartbeat` are absent from the
event catalog. Guest path events `booking_slots_loaded`,
`booking_slot_selected`, `booking_details_reached`, and
`booking_submit_attempted` are also absent.

Heartbeat starts at backend boot via `publicBookingService.startRecoveryRetries()`
in `packages/backend/src/app.ts` (every five minutes when `POSTHOG_KEY` is
set). Empty server tiles therefore mean WP-11 is not capturing in the live
project yet, not an idle queue and not 0% failure. #3735 merged as code;
staging/production still need that deploy plus PostHog capture.

Launch alert rules (exhausted recovery, oldest pending on two heartbeats,
infra failure >5% with ≥20 accepted / 30 minutes, heartbeat absent) are
evaluated in `packages/scripts/src/testing/meeting-dashboard.test.ts`.
They are not armed.

## Gaps that keep this a NO-GO

- No real Google Meet create / invite / conference / edit / cancel /
  reschedule against a provider calendar in this run.
- Nightly Google adapter smoke cannot run: Google secrets are absent in
  the `provider-smoke` environment (run 34743488032).
- Two-guest contention, notes after host move, reconnect, and
  cross-replica rate limits were not re-run on staging with authorized
  accounts.
- WP-11 heartbeat and operation events are not in live PostHog yet.
- Microsoft and Apple remain unverified and out of launch scope.
- Documented staging slugs `tylerdeane`, `tyler-dane`, `compasscaltest3`,
  and `tyler` are not live bookable pages (`PAGE_NOT_FOUND`).

## What the owner still has to do

1. Merging [#3737](https://github.com/KeepSoftwareSimple/compass-calendar/pull/3737)
   records this NO-GO and closes WP-13. It does not enable production booking.
2. If go instead: close that PR without merging, complete a Google Meet
   staging sweep with authorized accounts, a known live staging slug, WP-11
   telemetry visible in PostHog, and a written enable of production booking
   in a separate change. This file is not that change.
3. If no-go stands: leave production disabled. Use this matrix as the
   recorded exclusion list.
