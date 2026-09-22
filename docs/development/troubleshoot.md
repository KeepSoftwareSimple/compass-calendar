# Troubleshoot

## Backend Health Check

Before debugging a deeper auth or sync issue, confirm the backend is actually up:

```bash
curl -i http://localhost:3000/api/health
```

Interpret the result like this:

- `200`: the backend is running and can reach MongoDB
- `500`: the backend is running but database connectivity failed
- connection refused or timeout: the backend is not listening yet, or the port/base URL is wrong

For the self-host Docker stack, the backend health check is:

```bash
curl -i http://localhost:3000/api/health
```

On a server install, these localhost URLs are checked from the server itself. Public browser traffic should go through the HTTPS domain from the server guide.

## SSE Stream Not Connected Or Not Receiving Events

Compass realtime updates now use Server-Sent Events over:

- `GET /api/events/stream`

If UI data is stale after backend writes or sync activity, verify transport before digging into business logic.

Quick checks:

1. confirm session exists (browser has valid SuperTokens session cookie)
2. open browser Network tab and verify `/api/events/stream` stays open with `200`
3. verify response headers include `content-type: text/event-stream`
4. confirm periodic `: keepalive` frames are visible (roughly every 25 seconds)
5. trigger a known publish path (for example event write or import) and verify
   SSE frames arrive as `event: message` with a JSON `data.type` such as
   `eventsChanged`, `syncStatusChanged`, `importCompleted`, or
   `userMetadataChanged` (the old uppercase signal names are retired)

If the stream does not open:

- check auth first (`verifySession()` guards the stream route)
- verify backend route registration for `EventsRoutes`
- confirm `ENV_WEB.BACKEND_BASEURL` points to the same backend origin expected by the session cookie

If the stream opens but no events arrive:

- check backend logs for publish call sites (`sseServer.handle...`)
- verify user-id correlation (events fan out by authenticated user id)
- check reverse-proxy buffering behavior; backend sets `X-Accel-Buffering: no` and uses heartbeats to reduce buffering delays

## Unable to Sign In with Google in Local Compass Instance

### Missing User id

When you encounter a missing user id, Compass usually is not connected to MongoDB or the backend never started cleanly.

Sometimes MongoDB is successfully connected when you run `bun run dev:backend` but you still get a missing user id error. This could be because:

1. The MongoDB connection string in your backend env file is incorrect
2. Your IP address is not whitelisted in MongoDB Atlas
3. The MongoDB connection string format is invalid or incomplete
4. A required backend env variable is missing, so the server exited during startup

### Mismatch User Id

When you encounter a mismatch user id, the user in your mongo collection is not the one being captured. This could be because you have duplicate users in your database. To fix it, clear your user data by deleting the account from the app: open the command palette and run **Delete account** (Settings).

That removes both Compass data and SuperTokens auth state, revokes the Google grant, and clears local browser storage. Signing in again gives you a clean user record.

See [CLI And Maintenance Commands](./cli.md).

### Invalid domain name

When encountering an invalid domain name error, this is because the URL you provided in `supertokens.uri` in your active Compass config is incorrect. For local development that is usually `compass.yaml` at the repo root. This could be caused by prematurely finishing the setup of your Supertokens instance.

To fix this:

1. Make sure to completely set up your Supertokens instance
2. Copy the exact connection URI and API key from your Supertokens dashboard
3. Verify the connection URI format matches what Supertokens provides (should include the protocol, domain, and port if applicable)
4. Ensure there are no extra spaces or characters in the environment variable values

## Google Calendar Refresh Fails Or Stops Unexpectedly

When a user clicks **Refresh calendar** (or the automatic focus refresh runs)
and the calendar does not catch up, first classify the failure mode from the
sidebar status line and SSE behavior.

Manual refresh surfaces:

- `We couldn't refresh your calendar. Please try again in a moment.`

Focus-triggered refresh uses the same Sync path but passes `silent: true`, so
a transient failure does **not** toast. If the UI looks stuck after returning
to the tab, try the sidebar CTA explicitly.

For Google sign-in or reconnect, check the backend `google_auth_decision` log.
It shows the selected mode, token/sync health flags, and safe trace ids. To
keep sensitive account details out of logs, it should not show raw emails,
Google ids, or Compass user ids.

If the mode is `RECONNECT_REPAIR` and a stored refresh token exists, backend can
repair with that token even when Google does not return a new one.

### Quota / rate-limit during refresh

If the user sees a Google API limit toast (or Sync reports a quota/rate-limit
response via `403`/`429`), the failure is usually transient.

Recommended action:

1. wait a few minutes
2. retry **Refresh calendar**
3. if this repeats across many users, investigate Google API quota usage for the project

### Revoked token during refresh

If access was revoked (for example Google returns `invalid_grant`), backend
prunes Google data and emits `syncStatusChanged` with `code: "CONNECTION_REVOKED"`.

Operational notes:

- this path does **not** end with a successful `importCompleted`
- UI should transition to reconnect-required behavior rather than repeatedly retrying refresh
- user action is to reconnect Google, then allow sync/import restart

## Google Connect Aborts With Local Events Sync Error

When a password-authenticated user connects Google from an existing session, the client now attempts to sync IndexedDB-only Compass events **before** `POST /api/auth/google/connect`.

If that pre-connect local sync fails, connect is intentionally aborted and the user sees:

- `We could not sync your local events. Your changes are still saved on this device.`

What this means operationally:

- this is a local-to-cloud event migration failure, not a Google redirect failure
- backend `connectGoogleToCurrentUser` is not called for that attempt
- no Google import restart should be observed from that click

Recommended triage:

1. inspect browser console/network for the local event sync request failure
2. resolve connectivity/auth issues to Compass APIs first
3. retry Google connect after local sync succeeds

## Sync Maintenance Mode

If cloud edits or Google connect suddenly return `503` with a maintenance
message, check `sync.cloudMutationMode` in `compass.yaml` / `GET /api/config`.
`maintenance` rejects cloud mutations on purpose.

If Google connect or event reads aren't behaving as expected:

1. confirm `sync.serviceUrl` and `sync.internalAuthToken` are set — the
   backend refuses to start without them
2. confirm Sync is reachable and healthy on its own port
3. see [Config](../Config/README.md#sync-service) for the full key reference
