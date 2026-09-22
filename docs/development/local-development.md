# Local Development

Compass has multiple workable development modes. Pick the lightest mode that supports the feature you are changing.

First-time setup:

```bash
git clone git@github.com:SwitchbackTech/compass.git
cd compass
bun install
```

## Frontend-Only Mode

Command:

```bash
bun run dev:web
```

The frontend runs at <http://localhost:9080>.

Use this for:

- most layout and interaction work
- many event UI changes
- router and view work

You do not need the backend for basic frontend rendering.

## Booking web (public guest /meet)

Command:

```bash
bun run dev:booking-web
```

The guest app serves at <http://localhost:9081> (override with `BOOKING_WEB_PORT`).
It owns public `/meet` and legacy `/book` guest routes. Host Meeting Settings stay
in `packages/web` (`bun run dev:web`).

Guest Playwright specs open `http://localhost:9151` (booking-web) via
`publicBookingAppUrl()` in `e2e/booking/booking-harness.ts`. Host settings specs
stay on calendar-web (`9150` in CI).

Build with `bun run build:booking-web` (output under `build/booking-web`).

### Docker and compose (staging-shaped)

Build the production image from the repo root:

```bash
docker build -f apps/booking-web/Dockerfile -t compass-booking-web:local .
```

The image bakes `API_BASEURL` at build time (default `http://localhost:3000/api`).
Pass a different public API URL when the browser will not reach the API on
loopback, for example:

```bash
docker build -f apps/booking-web/Dockerfile \
  --build-arg API_BASEURL=https://staging.compasscalendar.com/api \
  -t compass-booking-web:local .
```

Run booking-web beside the existing Compass stack without changing the
calendar-web (`web`) service. From a directory that has `compose.yaml` (self-host
install layout or repo `self-host/`), enable the `booking` profile:

```bash
export COMPOSE_PROFILES="${COMPOSE_PROFILES:+$COMPOSE_PROFILES,}booking"
docker compose -f compose.yaml build booking-web   # after uncommenting the build block, or set COMPASS_BOOKING_WEB_IMAGE
docker compose -f compose.yaml up -d booking-web
```

The guest app listens on `http://127.0.0.1:9081` (`BOOKING_WEB_PORT`). It still
depends on a healthy backend container; Caddy `/meet/*` routing is WP-05.

**Staging:** ship booking-web only with the GitHub Actions workflow
[Deploy staging booking-web](../CI-CD/workflows.md#staging-booking-web-only).
That path patches `bookingWeb.image` on the existing staging host and runs
`./compass update-booking-web` without a full calendar deploy.

Optional `compass.yaml` keys (self-host installs):

```yaml
bookingWeb:
  port: 9081
  # image: your-registry/compass-booking-web:your-tag
```

## Backend

Command:

```bash
bun run dev:backend
```

Use this for:

- authenticated API work
- Google OAuth/session behavior
- Mongo-backed event behavior
- sync and SSE work

This requires valid Compass YAML config.

Bootstrap once from repo root:

```bash
cp compass.example.yaml compass.yaml
```

Runtime note:

- `bun run dev:backend`, `bun run dev:web`, and `bun run cli ...` load values from `compass.yaml` at the repo root.
- `compass.yaml` contains secrets. Do not commit it.

## Backend Environment Contract

Source: `packages/backend/src/common/constants/config.constants.ts`

Workflow: The backend loads `compass.yaml`, builds the runtime config object directly from it, and validates that object at startup with Zod.

Google Integration

- Google is disabled unless both `google.clientId` and `google.clientSecret` are set to real, non-placeholder values.

Derived backend values:

- `DB` is not supplied directly; backend derives it from `runtime.nodeEnv`
- `ORIGINS_ALLOWED` is derived from the `backend.originsAllowed` YAML list

## CLI And Build URL Variables

Primary files:

- `packages/scripts/src/common/cli.constants.ts`
- `packages/scripts/src/common/cli.utils.ts`
- `packages/web/build.ts`
- `packages/web/dev.ts`

Variables used by CLI/build flows:

- `backend.apiUrl` (used for local CLI operations and injected into the web build as `API_BASEURL`)
- `web.url` (used by backend auth email flows and CLI domain resolution)

If `web.url` points to localhost, the CLI prompts for a VM/public domain and builds the API URL from that input.

## Web Environment Contract

Source:

- `packages/web/src/common/constants/env.constants.ts`

Important variables:

- `API_BASEURL`
- `NODE_ENV`
- `POSTHOG_KEY`
- `POSTHOG_HOST`

`google.clientId` is optional. When it is missing, the web app hides Google sign-in and Google Calendar connection actions.

`BACKEND_BASEURL` is derived from `API_BASEURL`.

Bun build/dev behavior:

- `packages/web/build.ts` injects `backend.apiUrl` as `API_BASEURL` for production builds
- `packages/web/dev.ts` does the same for the local web dev server
- `google.clientId` is injected when present
- if `API_BASEURL` is not injected, the web app falls back to `PORT` and builds `http://localhost:<PORT>/api`

## Practical Mode Matrix

### Safe without backend

- route changes
- component rendering
- keyboard and pointer interactions
- local storage behavior

### Requires backend

- user profile loading
- authenticated event APIs
- Google connection flows
- backend validation behavior
- Mongo persistence
- SSE stream behavior

## Multiple Worktrees

`bun run dev:web` and `bun run dev:backend` run a small preflight
(`bun run dev:ports`) that gives each git worktree its own dev ports. If this
worktree has no `compass.yaml` yet, the preflight copies it from the main
checkout; if its ports are already claimed by another worktree's
`compass.yaml`, it rewrites `web.port`, `web.url`, `backend.port`,
`backend.apiUrl`, and the localhost `originsAllowed` entries to the next free
pair (9081/3001, 9082/3002, ...). Comments and secrets in the file are
preserved, and reruns are no-ops. Once `mongo.uri` is present, the preflight
also fills in a missing `sync:` block (local `internalAuthToken`, derived
`serviceUrl`/`callbackBaseUrl`, and an isolated `mongoUri` on the same host);
nothing needs to be authored by hand for that case.

The preflight only mutates gitignored local config. It does not rewrite tracked
tooling files such as `.claude/launch.json`; see
[issue #1969](https://github.com/SwitchbackTech/compass-calendar/issues/1969)
for the cleanup that removed that behavior.

Notes:

- The main checkout keeps the defaults (9080/3000).
- If `web.url` or `backend.apiUrl` is customized (e.g. a tunnel or real
  domain), the preflight leaves the file alone — manage ports manually.
- Real Google sign-in only works on ports whose redirect URIs are registered
  in Google Cloud Console; pin a worktree back to the default ports if you
  need it.

## Backend Health Probe

When debugging backend startup or connectivity issues, use the health endpoint first:

```bash
curl -i http://localhost:<PORT>/api/health
```

Interpretation:

- `200` with `{"status":"ok","timestamp":"..."}`: backend is running and can reach MongoDB
- `500` with `{"status":"error","timestamp":"..."}`: backend is running but database connectivity failed
- connection refused/timeouts: backend process is not listening yet, or the port/base URL is wrong

### Requires Google-related setup

- real OAuth
- real Google Calendar import/sync
- notification watch flows

## Auth And Anonymous Behavior

Compass supports both:

- never-authenticated users using local storage
- authenticated or previously-authenticated users using remote repositories

When testing changes around event loading, explicitly decide which user state you are modeling.

## Google Calendar Webhook Notes

Google OAuth and Google Calendar Watch have different local requirements. Google sign-in can use localhost redirect URLs, but Calendar Watch notifications are server-to-server callbacks from Google to Compass. For those callbacks, Google needs an HTTPS backend URL that it can reach from the public internet.

Compass does not start a local tunnel automatically. Google Calendar webhook watch flows use `google.webhookUrl` when it is set and fall back to `backend.apiUrl` when it is not set.

For normal local development:

```yaml
backend:
  apiUrl: http://localhost:3000/api
```

Google sign-in, Google Calendar connect, and initial import can still work, but live Google-to-Compass notifications are skipped because Google cannot call a local HTTP backend.

For local end-to-end Google Watch testing, run a temporary HTTPS tunnel to the backend:

```bash
cloudflared tunnel --url http://localhost:3000
```

Then set:

```yaml
backend:
  apiUrl: http://localhost:3000/api
google:
  webhookUrl: https://<generated-host>.trycloudflare.com/api
```

Keep `backend.apiUrl` local so the browser and Server-Sent Events continue using localhost. Only Google's webhook POST requests should use the tunnel.

Stop the tunnel when testing is complete. Do not use personal calendars with sensitive data for manual tunnel tests.

## Common Failure Modes

- backend exits immediately because required YAML config is missing
- backend/web/cli read from `compass.yaml` at the repo root; using `.env` no longer configures Compass
- web points at the wrong API base URL
- session exists but user profile fetch fails
- sync endpoints work but notification/watch setup is skipped because neither `google.webhookUrl` nor `backend.apiUrl` is public HTTPS
- `google.webhookUrl` points to a tunnel without `/api`, so Google posts to the wrong route
- backend starts but `/api/health` returns `500` because `mongo.uri` or database reachability is broken
