# Repo Architecture

Compass is a TypeScript monorepo with five packages and one shared event domain.

## Package Map

### `apps/calendar-web`

The React frontend. It owns:

- app startup and routing
- auth/session-aware UI
- event interactions
- local offline storage
- SSE listeners (`EventSource`)

Key entrypoints:

- `apps/calendar-web/src/index.tsx`
- `apps/calendar-web/src/components/App/App.tsx`
- `apps/calendar-web/src/routers/index.tsx`
- `apps/calendar-web/src/views/Root.tsx`

### `packages/backend`

The Express + MongoDB backend. It owns:

- route registration
- Supertokens session enforcement
- event CRUD and recurrence processing
- Google Calendar sync
- SSE fanout

Key entrypoints:

- `packages/backend/src/app.ts`
- `packages/backend/src/servers/express/express.server.ts`
- `packages/backend/src/servers/sse/sse.server.ts`

### `packages/sync`

The provider synchronization service. It owns:

- provider connection and credential custody
- Google Calendar adapters and notification verification
- sync jobs, scheduling, reconciliation, and subscription renewal
- provider calendars, events, invalidations, and sync-resource persistence
- sync readiness, health telemetry, and graceful shutdown

Key entrypoints:

- `packages/sync/src/app.ts`
- `packages/sync/src/server/sync.server.ts`
- `packages/sync/src/domain/sync-job-worker.service.ts`
- `packages/sync/src/config/sync.config.ts`

### `packages/core`

The shared domain layer. It owns:

- Zod schemas and TypeScript types
- shared constants
- date/event utilities
- mapping logic between Compass and provider formats

High-value files:

- `packages/core/src/types/event.contracts.ts`
- `packages/core/src/types/type.utils.ts`
- `packages/core/src/constants/core.constants.ts`
- `packages/core/src/constants/sse.constants.ts`

### `packages/scripts`

The CLI and database maintenance package. It owns:

- build commands
- delete flows
- operational maintenance commands

Entry point:

- `packages/scripts/src/cli.ts`

## Runtime Boundaries

### Web -> Core

The web package imports shared event/date concepts from `core` and should not redefine them locally unless the data is UI-specific.

### Backend -> Core

The backend uses `core` for shared validation, event categories, recurrence scopes, constants, and SSE event names.

### Sync -> Core

The sync service uses `core` for shared logging and domain contracts while
keeping provider credentials, job orchestration, and provider-specific adapters
inside `packages/sync`.

### Web <-> Backend

The web talks to the backend through:

- HTTP APIs
- SSE events
- shared domain types from `core`

### Backend <-> Sync

The backend remains the browser-facing API and SSE boundary. The sync service
exposes authenticated internal HTTP routes and change feeds for provider
connection, command, notification, and availability work. Keep shared wire
contracts explicit and provider implementation details inside `packages/sync`.

## Startup Paths

### Frontend boot

`apps/calendar-web/src/index.tsx` does this in order:

1. initialize storage
2. initialize session tracking
3. render `<App />`

`<App />` then installs provider trees and the router.

### Backend boot

`packages/backend/src/app.ts` does this in order:

1. create Express app
2. create HTTP server
3. register HTTP routes (SSE is opened per authenticated `GET /api/events/stream`)
4. start Mongo
5. listen on the configured port

### Sync boot

`packages/sync/src/app.ts` does this in order:

1. load and validate sync configuration
2. create the HTTP app, lifecycle registries, and storage dependencies
3. bind the HTTP port so liveness is available
4. connect MongoDB and install readiness checks
5. start retention and health sweeps
6. in active provider-configured mode, start job, reconciliation, and
   subscription schedulers

## Main Architectural Patterns

### Backend route pattern

`routes.config.ts` -> controller -> service -> query/mongo

This is the standard pattern for new HTTP behavior.

### Web state pattern

Web state is not single-system:

- Zustand stores hold transient client state (draft, view dates/sidebar, cmd palette, user metadata)
- TanStack Query owns persisted event reads/mutations and deduplicates keyed event reads
- IndexedDB stores offline events

Treat this as an intentional mixed architecture, not an inconsistency to "fix" casually.

### Shared schema pattern

The repo prefers:

1. define schema with Zod
2. export inferred TypeScript type
3. consume the same contract in web and backend

## Where Cross-Cutting Changes Usually Land

- New event field: `core` schema, backend parsing/persistence, web editors/selectors/tests
- New backend endpoint: backend route/controller/service plus maybe shared type in `core`
- New SSE event: `core` constants/types, backend `sse.server` / `publish`, web SSE hook consumer
- New provider sync behavior: sync provider port/adapter, job orchestration and
  storage, backend integration boundary, and affected web state
- New local persistence behavior: web storage adapter, migration runner, tests
