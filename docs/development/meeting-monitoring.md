# Meeting monitoring

PostHog project 165441 (Switchback, UTC). Source of truth for insight
windows, populations, and alert evaluation:
`packages/scripts/src/telemetry/meeting-dashboard.ts`.

## Dashboards

| View                                                  | URL                                                     |
| ----------------------------------------------------- | ------------------------------------------------------- |
| Meeting (this work)                                   | https://us.posthog.com/project/165441/dashboard/2093461 |
| Sync health (reuse, do not duplicate provider health) | https://us.posthog.com/project/165441/dashboard/1905421 |
| Web vitals                                            | https://us.posthog.com/project/165441/dashboard/2058733 |
| Existing alerts (do not add recipients here)          | https://us.posthog.com/project/165441/alerts            |

Default tiles are **production** with PostHog test-account filtering on
Trends and Funnel insights. Staging fixture tiles set `environment=staging`
and include test accounts so authorized staging traffic stays visible.
Server `booking_operation` / `booking_operation_heartbeat` tiles stay empty
until the merged WP-11 (#3717 / #3735) backend is deployed. Empty is
**no-data**, not 0% failure and not 100% success.

## Populations

Do not join these as one conversion rate.

| Population       | Events                                                                     | Grain                                             | Window                                  |
| ---------------- | -------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------- |
| Browser host     | `booking_settings_opened` → `booking_page_enabled` → `booking_link_copied` | unique identified hosts                           | 7 days                                  |
| Browser guest    | `booking_page_viewed` → `booking_reservation_created`                      | unique anonymous sessions                         | 1 day                                   |
| Server operation | `booking_operation`                                                        | durable Mongo transitions                         | 30 minutes for rates, 7 days for counts |
| Server heartbeat | `booking_operation_heartbeat`                                              | one gauge sample every 5 minutes, including zeros | 10 minutes for freshness                |

`booking_reservation_created` is browser-observed confirm. Authoritative
completion is `booking_operation` with `phase` `confirmed` or `recovered`.
Guest sessions are never identified, so they do not join to hosts.

Every rate must show numerator, denominator, sample count, window, and
exclusions. HogQL tiles return `NULL` for the rate when the denominator is 0. Do not chart that as 0% or 100%.

## Launch alerts (evaluate, do not notify yet)

Existing PostHog alerts email the founder's PostHog account and evaluate
hourly. This work **does not activate new destinations or test sends**.
The intended Meeting checks are:

| Signal                      | Fire when                                                                                                                                    | Cadence that matches the SLO    | Account fallback                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Exhausted recovery          | `booking_operation` `phase=failed` and `outcome=exhausted` count > 0                                                                         | any occurrence                  | Hourly count > 0, same pattern as `sync_job_terminal_failure`                                           |
| Oldest pending              | `oldest_pending_age_ms` > 5 minutes on **two consecutive heartbeat samples**                                                                 | 5-minute heartbeat (10 minutes) | Hourly evaluation is coarser than the SLO; read the heartbeat tile until a sub-hour alert add-on exists |
| Infrastructure failure rate | `provider` + `storage` + `transport` failures / `phase=accepted` `source=operation` > 5%, with at least 20 accepted operations in 30 minutes | 30-minute window                | Below 20 accepted: counts and manual review, not anomaly detection                                      |
| Heartbeat absent            | zero `booking_operation_heartbeat` samples in 10 minutes                                                                                     | two missed 5-minute beats       | Distinct from an idle queue (`pending_count=0` with samples present)                                    |

Conflict, validation, and rate-limit outcomes are request-level or
expected contention. They are not infrastructure failures.

## Saved insights

| Tile                            | URL                                                     |
| ------------------------------- | ------------------------------------------------------- |
| Host funnel (production)        | https://us.posthog.com/project/165441/insights/qmA6YEpq |
| Guest funnel (production)       | https://us.posthog.com/project/165441/insights/Bpjfok7y |
| Host funnel (staging fixtures)  | https://us.posthog.com/project/165441/insights/8jOUswJq |
| Guest funnel (staging fixtures) | https://us.posthog.com/project/165441/insights/8DA2BrvI |
| Server operations by phase      | https://us.posthog.com/project/165441/insights/jC0leWid |
| Server outcomes                 | https://us.posthog.com/project/165441/insights/TzMzEeKF |
| Completion latency p50/p95      | https://us.posthog.com/project/165441/insights/1MDTnQpk |
| Completion rate 30m             | https://us.posthog.com/project/165441/insights/4YNwF8bh |
| Infra failure rate 30m          | https://us.posthog.com/project/165441/insights/PqXHdek3 |
| Heartbeat freshness             | https://us.posthog.com/project/165441/insights/6kjX0jtM |
| Exhausted recoveries 24h        | https://us.posthog.com/project/165441/insights/L1penOJD |
| Setup save failures             | https://us.posthog.com/project/165441/insights/i3nZgQ5l |

## Staging readback (2026-09-14)

Queries run against project 165441. No production booking test events were
inserted. No alert was armed.

| Case                                                       | Query                                                                                                                                        | Result                                                                                            |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Staging guest conversion                                   | Funnel `booking_page_viewed` → `booking_reservation_created`, 1 day, unique sessions, `environment=staging`, test accounts included, 30 days | 5 sessions viewed, 2 confirmed (40% conversion, 60% drop-off, median 54s)                         |
| Staging host conversion                                    | Funnel settings → enabled → link copied, 7 days, unique users, staging, test accounts included, 30 days                                      | 1 host completed all three steps                                                                  |
| Staging event counts                                       | Trends week of 2026-09-06, test accounts included                                                                                            | settings opened 14, page viewed 15, reservation created 2, page enabled 2, link copied 6          |
| Production + test exclusion                                | Same events, `environment=production`, test accounts filtered                                                                                | no-data (zeros), not a success rate                                                               |
| Server operations / heartbeat                              | `booking_operation` and `booking_operation_heartbeat`, production, 7 days                                                                    | no-data until WP-11 (#3735) deploys                                                               |
| Completion rate 30m (saved)                                | https://us.posthog.com/project/165441/insights/4YNwF8bh                                                                                      | `accepted=0`, `completed_success=0`, `completion_rate=(null)`                                     |
| Infra failure rate 30m (saved)                             | https://us.posthog.com/project/165441/insights/PqXHdek3                                                                                      | `infra_failure_rate=(null)`, `sample_gate=manual_review`                                          |
| Heartbeat freshness (saved)                                | https://us.posthog.com/project/165441/insights/6kjX0jtM                                                                                      | `heartbeat_samples=0`, gauges `(null)`, `telemetry_status=missing_telemetry`                      |
| Production host funnel (saved)                             | https://us.posthog.com/project/165441/insights/qmA6YEpq                                                                                      | no data recorded                                                                                  |
| Synthetic success / failure / pending / recovery / no-data | `packages/scripts/src/testing/meeting-dashboard.test.ts`                                                                                     | success 8/10; infra 3/20 fires; pending 400s then 410s fires; exhausted 2 fires; 0/0 is `no-data` |

Schema cutover: WP-10 browser path events
(`booking_slots_loaded`, `booking_submit_attempted`, …) and WP-11 server
events may be absent until those deploys. Tiles for missing events stay
empty. Version the filter with `environment` and, once server events ship,
`version` / `service=compass-backend`.

## Review cadence

- Daily during the first week after production booking is enabled.
- Weekly after that.
- Sample-size caveat: do not promote a rate with fewer than 20 accepted
  operations in the rate window.
- Post-launch feedback loop: [#3720](https://github.com/KeepSoftwareSimple/compass-calendar/issues/3720).

## Closeout

| Item                                | Value                                                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Release owner                       | Tyler Dane (founder)                                                                                      |
| Authorized notification destination | Founder's PostHog account (already used by Sync/SSE alerts). **Not activated for Meeting in this issue.** |
| Rollback                            | Leave `isBookingEnabled` unchanged here. Disable criteria live on WP-13.                                  |
| Provider health                     | Sync dashboard 1905421, not this dashboard                                                                |

Pair with the [launch ops checklist](./launch-ops-checklist.md).
