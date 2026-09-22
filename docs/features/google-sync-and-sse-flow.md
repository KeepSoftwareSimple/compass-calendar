# Google Sync And Server-Sent Events (SSE)

Product-wide provider behavior, capability gates, and connect flows are
specified in [`calendar-providers.md`](./calendar-providers.md). This document
covers the Google sync path and SSE wiring.

Google Calendar sync is owned entirely by the standalone **Sync service**
(`packages/sync`). The backend has no Google API calls or sync logic of its
own. The backend's role is: proxy sync-related reads/writes to Sync, poll
Sync's change feed, and translate what it learns into browser SSE.

Realtime updates use **Server-Sent Events** (one HTTP connection per tab).
The browser `EventSource` connects to `GET /api/events/stream` with the
session cookie.

## High-Level Architecture

```mermaid
flowchart LR
  subgraph Web["packages/web"]
    ES[EventSource]
    Prov[SSEProvider]
    Ev[useEventSSE]
    Gc[useGcalSSE]
    Store[userMetadata store]
  end
  subgraph Backend["packages/backend"]
    Stream[events.controller stream]
    Srv[sse.server]
    Bridge[sync-change-feed.bridge]
    Err[error handler]
  end
  subgraph Sync["packages/sync"]
    Feed[GET /internal/changes]
  end
  ES -->|GET /api/events/stream| Stream
  Stream -->|subscribe + replay| Srv
  Bridge -->|poll| Feed
  Bridge -->|publish| Srv
  Err -->|CONNECTION_REVOKED / CONNECTION_REVOKED| Srv
  Srv -->|SSE over HTTP, one "message" event| ES
  Prov --> ES
  Ev --> ES
  Gc --> ES
  Ev --> Store
  Gc --> Store
```

## Connection And First Events

```mermaid
sequenceDiagram
  participant B as Browser
  participant X as Express
  participant S as sseServer
  participant M as userMetadataService
  B->>X: GET /api/events/stream
  X->>S: subscribe(userId, res)
  X->>M: fetchUserMetadata(userId)
  M-->>X: metadata
  X->>S: publish userMetadataChanged
  S-->>B: "event: message" (data: {type: "userMetadataChanged", ...})
  Note over B,S: Connection stays open. Heartbeats limit proxy buffering.
```

## Wire Format And Message Types

Source:

- `packages/core/src/constants/sse.constants.ts`: the SSE transport
- `packages/core/src/types/server-message.contracts.ts`: the message union

The server publishes **one** SSE event name, `message` (`SSE_MESSAGE_EVENT`).
Its `data` is a JSON-serialized `ServerMessage` union member; clients parse
once and switch on `type`. There is no longer a distinct SSE event name per
signal (`EVENT_CHANGED`, `IMPORT_GCAL_START`, etc. are retired).

| `type`                | Role                                              |
| ---------------------- | ------------------------------------------------- |
| `eventsChanged`         | Calendar grid data should be refetched            |
| `calendarsChanged`      | Calendar list should be refetched                 |
| `syncStatusChanged`     | Connection health changed (syncing/healthy/attention) |
| `importCompleted`       | A full/incremental/repair import finished          |
| `userMetadataChanged`   | Replay / push SuperTokens + sync metadata         |

`SSEServer` (`packages/backend/src/servers/sse/sse.server.ts`) exposes one
named `publish*` convenience method per message type, plus a generic
`publish()`. A completeness test
(`packages/backend/src/servers/sse/sse.server.test.ts`) enforces that every
`publish*` method emits a schema-valid frame. Keep it exhaustive when the
`ServerMessage` union grows.

## Outbound Flow: User Changes An Event In Compass

1. UI calls a mutation from `useEventMutations`.
2. The mutation's `onMutate` applies an optimistic update to the TanStack Query cache.
3. The mutation's `mutationFn` writes through the selected repository.
4. Remote event writes hit backend event routes, which submit a command to
   the Sync service (see [Backend](../backend/README.md#event-writes)).
5. The backend does not publish `eventsChanged` for its own write. The
   client already applied the change optimistically. Confirmation and
   cross-tab/cross-device fan-out come from the change-feed poll below.

Primary files:

- `packages/web/src/events/mutations/useEventMutations.ts`
- `packages/web/src/events/repositories`
- `packages/backend/src/event/controllers/event.controller.ts`
- `packages/backend/src/common/services/sync-service/` (Sync client)

## Inbound Flow: Sync Notifies The Backend About Changes

Google's own webhook ingress, OAuth flow, and import/repair logic all live
inside `packages/sync` and never touch the backend directly. The backend
learns about changes by polling Sync's own change feed:

1. While a user has at least one open SSE connection,
   `SyncChangeFeedBridge` (`packages/backend/src/servers/sse/sync-change-feed.bridge.ts`)
   polls `GET /internal/changes` on the Sync service every ~2s.
2. Each page of invalidations is translated to zero or more `ServerMessage`s
   by `syncInvalidationToServerMessages`
   (`packages/backend/src/servers/sse/sync-invalidation.to-server-message.ts`).
   A Sync `event` invalidation becomes an `eventsChanged` message. A
   `calendar` or `connection` invalidation becomes `calendarsChanged` plus
   `eventsChanged`. An `importProgress` invalidation becomes
   `syncStatusChanged` / `importCompleted`.
3. The backend publishes each translated message over SSE.
4. Revocation on the mutation path is HTTP 410 `CONNECTION_REVOKED`
   (`event.controller.ts` maps Sync `authorizationRevoked`). The SSE attention
   codes are `CONNECTION_REVOKED` (with `connectionId`) and the one-release
   alias `CONNECTION_REVOKED`. Helper `revokedConnectionServerMessages` in
   `packages/core/src/types/server-message.contracts.ts` emits both. Milestone
   C drops `CONNECTION_REVOKED` after every client reads `CONNECTION_REVOKED`.

An `incrementalPull` that applied without writing events (`changed + deleted
=== 0`) does not append a `calendar` invalidation, unless the resource's
cursor-expiry streak cleared or its generation was promoted during that pull.
Idle cursor-only advances would otherwise wake every open tab on the 5 s
coalesce cadence. `initialImport`, repair, and bootstrap catch-up still
append unconditionally so the client learns those finishes. Connection state
(importing -> catchingUp -> healthy) is a separate `connection` invalidation
from `refreshConnectionStateAfterJob`, so a first successful no-op pull after
import still flips the UI status.

Primary files:

- `packages/backend/src/servers/sse/sync-change-feed.bridge.ts`
- `packages/backend/src/servers/sse/sync-invalidation.to-server-message.ts`
- `packages/core/src/types/server-message.contracts.ts`
- `packages/core/src/types/sync/change-feed.contracts.ts` (the Sync-side invalidation shapes)

## SSE Server Responsibilities

Source:

- `packages/backend/src/servers/sse/sse.server.ts`
- `packages/backend/src/events/controllers/events.controller.ts`

The SSE layer:

- accepts authenticated `GET /api/events/stream` requests (SuperTokens session)
- registers each open `Response` per user for fan-out
- sends periodic comment heartbeats (`: keepalive`) so buffering proxies do not delay events
- on connect, replays `userMetadataChanged` after subscribe so reconnects get current state

## Web Client Responsibilities

Files:

- `packages/web/src/sse/client/sse.client.ts`
- `packages/web/src/sse/hooks/useSSEConnection.ts`
- `packages/web/src/sse/hooks/useEventSSE.ts`
- `packages/web/src/sse/hooks/useGcalSSE.ts` (+ `useGcalSSE.factory.ts`)
- `packages/web/src/sse/hooks/useSyncFocusRefresh.ts`
- `packages/web/src/common/hooks/useVisibleAfterHidden.ts`
- `packages/web/src/sse/provider/SSEProvider.tsx`
- `packages/web/src/auth/google/hooks/useConnectGoogle/useConnectGoogle.ts`
- `packages/web/src/auth/google/state/google.sync.refresh.ts`

The client:

- opens `EventSource` when a session exists (`SessionProvider` + `SSEProvider`)
- refetches events when `eventsChanged` arrives (by invalidating the matching event query scopes)
- tracks Google sync/import status from `syncStatusChanged`/`importCompleted` and `userMetadataChanged`
- handles the `CONNECTION_REVOKED` `syncStatusChanged` code consistently with REST 410 payloads. `CONNECTION_REVOKED` is the provider-neutral alias on the same wire; clients must treat both until milestone C drops `CONNECTION_REVOKED`
- auto-refreshes Google Calendar sync on app focus (below)

Refetches are driven by TanStack Query invalidation keyed to the message
`type`; `userMetadataChanged` payloads land in the userMetadata Zustand
store.

### Focus Refresh

`SSEProvider` mounts `useSyncFocusRefresh`, which calls the same
`useConnectGoogle().refresh` path as the sidebar **Refresh calendar** button:

1. once when a refreshable connection becomes available on mount
2. again whenever the tab returns to visible after being hidden for at least
   30 seconds (`useVisibleAfterHidden`; same threshold as version checks)

Constraints:

- runs only for `HEALTHY` or `ATTENTION` connections (no-op while disconnected,
  reconnect-required, or still on the initial import)
- passes `silent: true` so a transient background failure does not toast the
  way a manual click's failure does
- shares the browser-wide refresh coordinator with manual clicks, so focus and
  CTA refreshes coalesce instead of racing

Without this, a user can stare at a stale “Updated …” label until they
remember to click **Refresh calendar**.

## Connect funnel observability

Every Google or Microsoft calendar connect round-trip emits two PostHog events
that share a short `correlationId` (`cid` on the redirect URL):

1. Sync's public OAuth callback captures `oauth_callback` (distinct id
   `compass-sync`) with `provider`, `outcome` (the redirect status), `intent`
   (`connect` or `reconnect`, recovered from whether the signed state named a
   connection), and `errorClass` (the Error class name, never the message)
   when the outcome is `error`.
2. The web app's `applyConnectRedirect` captures `oauth_return` with
   `provider`, `status`, `intent`, and the same `correlationId` for every
   parsed redirect, including `connected`. Existing `calendar_connected` and
   `signup_failed` events are unchanged.

The reconnect banner starts authorization with `intent: "reconnect"` so those
events split reconnects from first connects.

## Revoked Token And Reconnect Lifecycle (`CONNECTION_REVOKED`)

1. Sync classifies a dead grant as `authorizationRevoked`, discards the
   credential, and derives connection state `actionRequired`. A `connection`
   invalidation fans out as `calendarsChanged` / `eventsChanged`. Event
   mutations against a revoked grant return HTTP 410 `CONNECTION_REVOKED`.
2. The SSE attention payload may carry `CONNECTION_REVOKED` (with
   `connectionId`) and the alias `CONNECTION_REVOKED` (see
   `revokedConnectionServerMessages`). Clients that only read `CONNECTION_REVOKED`
   still work until milestone C.
3. Web app marks the connection as revoked in session memory.
4. User initiates re-consent via the OAuth flow (`POST /api/auth/connections/begin`,
   proxied to Sync).
5. Sync completes the OAuth exchange; the backend's next metadata fetch /
   change-feed poll picks up the reconnected state.

## Failed Job Self-Heal (Sync Operator Path)

Sync workers mark a job `failed` after its per-attempt retry ladder is spent.
Nothing else requeues that row unless the **failed-job self-heal** sweep runs
(`failedJobRequeue` in `packages/sync/src/app.ts`, logic in
`packages/sync/src/domain/failed-job-requeue.service.ts`):

1. After a ~30 minute cooldown, the sweep requeues cooled-down failed jobs with
   a fresh attempt budget (up to `FAILED_JOB_MAX_REQUEUES`, currently 3).
2. Jobs that keep failing past that budget are **exhausted** and need an
   operator. See [manage-failed-jobs](../development/cli.md#manage-exhausted-sync-jobs).
3. Exhausted jobs whose connection already has a durable provider read-failure
   marker (`lastReadFailureAt`, for example Google `notACalendarUser`) are
   **auto-cleared** so their coalescing key no longer blocks rediscovery /
   reconnect enqueue. Health already surfaces those provider errors; keeping
   the failed row only adds log noise.

Watch sync logs for:

- `Sync self-heal sweep requeued N failed job(s)`
- `Sync self-heal sweep cleared N exhausted job(s) blocked by durable provider read failure`
- `Sync self-heal sweep: N failed job(s) exhausted their requeue budget and need operator attention`

## Rules Of Thumb For Changes

- New realtime behavior usually needs changes in `core`
  (`server-message.contracts.ts`), `backend` (`sse.server` + whichever
  translator/caller publishes it), and `web` (hooks listening via
  `EventSource`).
- If you add a new `ServerMessage` member, add a matching `publish*` method
  on `SSEServer` and a case in `sse.server.test.ts`'s completeness table.
- If the UI is stale after edits, confirm a message is actually published
  (either via `sync-change-feed.bridge.ts`'s translation or a direct
  `sseServer.publish*` call) and that the web hook handles that `type`.
