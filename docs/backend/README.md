# Backend

Backend service for auth/session management, event persistence, Google sync,
and SSE notifications.

## Intent

The current production integration is Google Calendar, but backend code should
move toward provider-agnostic boundaries over time.

When changing sync or auth logic:

- avoid hard-coding provider assumptions in shared request paths
- keep Google-specific behavior inside sync/auth service layers
- preserve Compass-local event behavior when Google credentials are missing

## Route Map

Backend routes are registered from
`packages/backend/src/servers/express/express.server.ts`.

| Area | Source | Notes |
| --- | --- | --- |
| Health | `packages/backend/src/health/health.routes.config.ts` | `GET /api/health` is unauthenticated and checks Mongo reachability. |
| Config | `packages/backend/src/config/config.routes.config.ts` | Public runtime config used by the web app. |
| Auth | `packages/backend/src/auth/auth.routes.config.ts` | Compass-owned auth helpers and authenticated Google connect. SuperTokens also mounts recipe routes under `/api`. |
| User | `packages/backend/src/user/user.routes.config.ts` | Profile, metadata, and hidden event ids for the active session. |
| Billing | `packages/backend/src/billing/billing.routes.config.ts` | Session status, embedded Checkout, setup-mode payment-method session, `GET /api/billing/subscription`, cancel and resume, and unauthenticated Stripe webhook. Self-host omits Stripe keys and stays fully writable. |
| Events | `packages/backend/src/event/event.routes.config.ts` | Event CRUD and reorder/delete helpers. |
| Event stream | `packages/backend/src/events/events.routes.config.ts` | Authenticated SSE stream at `GET /api/events/stream`. |
| Calendars | `packages/backend/src/calendar/calendar.routes.config.ts` | Calendar list and selection routes. |

The backend has no inbound Google-sync routes of its own — the standalone
Sync service (`packages/sync`) owns Google Calendar sync end to end,
including its own OAuth/webhook routes. The backend is an outbound *client*
of Sync (`packages/backend/src/common/services/sync-service/`), not a host
for sync routes.

Use source files as the exhaustive route list. This page keeps the behavior
that is easiest to misunderstand.

## Auth And Session Boundaries

SuperTokens recipes are initialized in
`packages/backend/src/common/middleware/supertokens.middleware.ts`.

Important runtime behavior:

- password sign-up/sign-in upserts Compass users (`userService.upsertUserFromAuth`)
- sign-out delegates cleanup to `userService.handleLogoutCleanup(...)`
- sign-out response still returns even if cleanup logging reports an error
- `GET /api/health` is intentionally unauthenticated
- most user data routes require `verifySession()`

## Event Writes

- Calendar/event reads and durable write commands delegate to the Sync
  service — there is no legacy event store or Compass-to-Google propagation
  path anymore.
- Controllers use the shared `res.promise(...)` response helper and centralized
  error handling.

Key files:

- `packages/backend/src/event/controllers/event.controller.ts`
- `packages/backend/src/calendar/controllers/calendar.controller.ts`
- `packages/backend/src/common/services/sync-service/` (Sync client + request/response translation)

Google's own OAuth flow, webhook ingress, and change notifications are owned
entirely by the Sync service (`packages/sync`), not the backend.

## SSE Stream

The web app opens `GET /api/events/stream` with the active SuperTokens session
cookie. The backend subscribes that response to per-user fan-out and immediately
pushes a `userMetadataChanged` message (SSE event name is always `message`;
clients switch on `data.type`).

Primary files:

- `packages/backend/src/events/controllers/events.controller.ts`
- `packages/backend/src/servers/sse/sse.server.ts`
- `packages/core/src/constants/sse.constants.ts`

## Related Docs

- [Backend Request Flow](./backend-request-flow.md)
- [Backend Error Handling](./backend-error-handling.md)
- [Config](../Config/README.md#sync-service)
- [Google Sync And SSE Flow](../features/google-sync-and-sse-flow.md)
