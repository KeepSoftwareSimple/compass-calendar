# Launch ops checklist

Short checklist for release / high-traffic days. Pair with
[Monitoring](../self-hosting/monitoring.md) for endpoint details.

## Before send

- [ ] `GET /api/health` returns `200 {"status":"ok"}`
- [ ] Sync `GET /health/live` and `GET /health/ready` are healthy; logs show
      `execution=active` when Google sync is enabled
- [ ] Deploy Discord health webhook is configured (see
      [CI/CD workflows](../CI-CD/workflows.md))
- [ ] PostHog Error Tracking is receiving `$exception` from web (open a
      staging page and trigger a handled test if needed)
- [ ] Confirm `sync_health_snapshot` events arrive every ~5 minutes in PostHog

## Alerts to create in PostHog (or Discord)

Alert on `sync_health_snapshot` properties (low cardinality — safe to alert):

| Signal | Suggested threshold |
| --- | --- |
| `connections.actionRequired` | rising or absolute &gt; 0 for 10+ minutes under load |
| `jobs.failed` | rising vs baseline |
| `jobs.oldestDueAgeMs` | &gt; 5 minutes while `execution=active` |
| `freshness.percentOver30s` | sustained spike vs quiet baseline |

Also watch:

- Web `$exception` rate (Error Tracking)

### Alerts that already exist in PostHog

Created by hand in the PostHog UI or via the PostHog MCP; all evaluate hourly
and email the founder's PostHog account. Check the
[alerts page](https://us.posthog.com/project/165441/alerts) before creating
another one.

| Alert | Insight | Fires when |
| --- | --- | --- |
| Sync job terminal failure | hourly count of `sync_job_terminal_failure` | count above 0 in the current hour |
| Sync reconcile sweep starved (production) | `sync_reconcile_sweep` completions, trailing 45 minutes, production | count below 1 |
| SSE connection degraded burst (production) | `sse_connection_degraded`, trailing 60 minutes, production | count above 3 |

The SSE alert samples a trailing 60-minute window once an hour, so a burst
that straddles two checks can be under-counted. Widen the insight's window to
90 minutes if that bites; 15-minute evaluation needs a PostHog add-on. The
web app offers a sidebar-footer Refresh control for the same condition
(`SidebarRefreshButton`) after the stream has been down for 30 seconds.

## During launch

- [ ] Watch Sync health snapshot + Error Tracking side by side
- [ ] If calendars look stuck: check SSE (`sse_connection_degraded`), then Sync
      diagnostic routes (see [Troubleshoot](../development/troubleshoot.md))
- [ ] Both `compass-backend` and `compass-sync` logs are in PostHog Logs. Express
      errors carry `method`, `path`, `status`, `userId`, and `stack` — filter by
      service and status for triage

## After

- [ ] Resolve or suppress any new Error Tracking noise
- [ ] Note any `actionRequired` / delayed cohorts for follow-up reconnect email
