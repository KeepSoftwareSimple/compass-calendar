# Monitoring

## Health endpoint

The backend exposes a health check endpoint you can call from your own monitoring setup:

```
GET /api/health
```

No authentication required.

**Response (healthy):** `200 OK`

```json
{"status": "ok", "timestamp": "2025-01-01T00:00:00.000Z"}
```

**Response (unhealthy):** `500 Internal Server Error`

```json
{"status": "error", "timestamp": "2025-01-01T00:00:00.000Z"}
```

The check calls `db.admin().ping()` against MongoDB. Call it on whatever schedule makes sense for your setup — Compass does not impose a polling interval.

## Sync (Google Calendar) health

If Google Calendar sync is enabled, the `sync` container's own health is worth watching separately from the backend health endpoint above — it degrades quietly (missed push notifications) rather than returning an error, and the backend health check above never touches it.

```
GET /health/live
```

on `127.0.0.1:3010` — liveness only (the container is up and serving), not a signal that sync work is actually progressing. `docker compose ps` surfaces this as the container's health status.

What to watch, in sync container logs (`./compass logs sync`):

- **Startup line** — `compass-sync listening on 3010 (production, execution=active)`. If it instead says `execution=passive`, Sync is up but doing no provider work — check `sync.execution` in `compass.yaml`.
- **`Sync scheduler draining, reconciling, renewing channels, retaining, and reporting health`** — logged once at startup when active; confirms the job worker, the reconcile sweep, and subscription renewal are all running. If you only see `Sync retention + health snapshot started (passive / unconfigured)` instead, Sync isn't doing calendar work — check `google.clientId`/`google.clientSecret` are set and `sync.execution: active`.
- **`Sync reconcile sweep enqueued N pull(s)`** — logs roughly every 10 minutes when there's stale work to catch up on. This is the fallback for missed push notifications; every connected calendar converges through it even if Google's webhook never arrives. It's normal for this to log `0` most of the time on a healthy install (nothing missed).
- **`Sync job {kind} ({id}) dropped: {reason}`** (warn level) — a job settled without completing (e.g. the connection's Google access was revoked). The affected user needs to reconnect; Compass surfaces this in the UI as a "Reconnect Google Calendar" prompt automatically.
- **`Sync self-heal sweep … exhausted … need operator attention`** (error level) — a job burned its retry ladder and the automatic requeue budget. Inventory and clear/requeue with `bun run cli manage-failed-jobs` ([CLI](../development/cli.md#manage-exhausted-sync-jobs)). Durable provider refusals (connection already stamped with a read-failure marker) are auto-cleared by the same sweep so they do not page forever.

Unlike the older backend-only sync engine, Sync manages its own push-notification channel renewal internally — there's no separate cron job or maintenance endpoint to wire up.

Web PostHog events carry `version` (the web build's `APP_VERSION`) and
`environment` as super properties, matching the backend and sync event
shape so a frontend regression can be attributed to a release.

## PostHog logs

Backend and Sync emit OpenTelemetry logs to PostHog when `NODE_ENV` is
`staging` or `production` and a PostHog key is set. Rows in the `logs`
table carry these resource attributes:

- `service.name`: `compass-backend` or `compass-sync`
- `deployment.environment`: `staging` or `production` (same value as
  `$exception` `properties.environment`)
- `service.version`: deploy revision (same value as `$exception`
  `properties.version`)

Split environments:

```sql
SELECT
  resource_attributes['deployment.environment'] AS environment,
  service_name,
  count() AS logs
FROM logs
WHERE timestamp > now() - INTERVAL 1 DAY
GROUP BY environment, service_name
ORDER BY environment, service_name
```

Per-route backend latency from the HTTP logger's `path`, `status`, and
`durationMs` attributes:

```sql
SELECT
  extract(attributes['path'], '^(/api/[a-z]+)') AS route,
  attributes['status'],
  quantile(0.5)(toFloat(attributes['durationMs'])) AS p50_ms,
  quantile(0.95)(toFloat(attributes['durationMs'])) AS p95_ms
FROM logs
WHERE service_name = 'compass-backend'
  AND resource_attributes['deployment.environment'] = 'production'
GROUP BY route, attributes['status']
ORDER BY p95_ms DESC
```

Use `resource_attributes['deployment.environment'] = 'staging'` on a
staging host. Filter on `service.version` the same way when comparing
releases.

Hosted Compass Meeting conversion and recovery live on the PostHog
[Meeting dashboard](https://us.posthog.com/project/165441/dashboard/2093461)
and [Meeting monitoring](../development/meeting-monitoring.md). Self-hosted
installs without PostHog should watch Mongo `bookingOperation` pending age
and `booking_operation` logs instead.

----

Have an idea on how we can make self-hosting easier? Let us know in [this GitHub Discussion](https://github.com/SwitchbackTech/compass/discussions/1694).
