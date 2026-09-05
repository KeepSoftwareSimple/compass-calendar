# Calendar providers (Google, Microsoft, Apple)

Locked product and architecture spec for connecting any of the three major
calendar hosts to Compass. Approved 2026-09-03. Supersedes the 2026-07-16
internal decision that deferred iCloud to an outbound ICS feed.

## Goal

A user connects Google Calendar, Outlook (Microsoft 365 or outlook.com), or
iCloud Calendar to Compass and everything works the same way: events import,
edits flow both ways, recurring series and exceptions round-trip, availability
for booking is computed from every healthy connection, conference links are
created where the host supports them, and per-connection health is honest.

## Status

P0 foundation is in the tree. Google is the registered adapter. Microsoft and
Apple adapters live under `packages/sync/src/providers/<kind>/` and register in
M-09 / A-08. Work is tracked across six GitHub milestones, each with a tracking
issue:

| Milestone | Purpose |
|---|---|
| Providers L: loop + CI acceleration | Agent loop generalization and CI critical-path cuts. Runs first. |
| Providers P0: foundation | Provider-plural contracts and wiring with Google unchanged. |
| Providers M: Microsoft (Outlook) | Microsoft Graph adapter set and Connect Microsoft UI. |
| Providers A: Apple (iCloud) | CalDAV adapter set, password credential, Connect iCloud UI. |
| Providers I: identity decoupling | Sign in with Microsoft and Apple; login is not calendar hosting. |
| Providers C: closeout | Drop plaintext OAuth rows, per-provider health snapshot, drop `GOOGLE_REVOKED`. |

## Locked decisions

- **Apple is a full iCloud connection over CalDAV** using an Apple app-specific
  password. There is no push from iCloud, so freshness is polling, targeted at
  one to two minutes.
- **Login and calendar hosting are separate concepts.** Microsoft and Apple
  join Google as SuperTokens login methods. Connecting a calendar is always its
  own step. Signing in with Google or Microsoft may auto-connect that calendar;
  Sign in with Apple grants no calendar access and never does.
- **Microsoft uses the `/common` endpoint** so personal and work or school
  accounts both work with one app registration. Tenants that require admin
  consent get an honest error state, not a retry loop.
- **Provider behavior enters through capabilities**, never through
  `provider === "x"` branches in domain or web code.
- **Google keeps working unchanged** through every foundation change.
- **User-facing Microsoft copy uses "Microsoft", never "Outlook".** The account,
  toasts, banners, chooser, and Settings rows say Microsoft (or Microsoft
  Calendar, parallel to Google Calendar). "Outlook" is not shown in the product
  UI; command-palette search still accepts "outlook" as a keyword for
  Manage Accounts.
- **No em-dashes** in user-facing copy.

## Capability matrix

| Capability | Google | Microsoft | Apple |
|---|---|---|---|
| Sign in as identity | yes | yes (Entra `/common`) | yes (Sign in with Apple) |
| Connect calendar | OAuth redirect | OAuth redirect | Email plus app-specific password form |
| Sign-in auto-connects the calendar | yes | yes | no; user picks the host |
| Push notifications | yes (channels) | yes (Graph subscriptions) | no; poll every 60 to 90 s |
| Incremental reads | syncToken | deltaLink | RFC 6578 sync-token |
| Conference link on create | Google Meet | Microsoft Teams when the mailbox allows it | none |
| Event colors | 11 slots plus labels | categories read as hex; no write in v1 | calendar color only |
| Attendees and invitations | yes | yes | yes, server-side scheduling |
| Contact suggestions | People API | `/me/people` | none |
| Booking destination | yes | yes | yes, without a video link |

Capabilities are the intersection of the granted permission, the calendar's
access role, the provider's semantics, and the transport's real behavior. An
owning role never manufactures `canWatchEvents` on a transport without push.

## Architecture

The names in this section match the code that landed in P0. Grep each one;
they exist.

The sync service (`packages/sync`) has provider-neutral ports in
`packages/sync/src/providers/*.port.ts`. Free/busy is computed locally from
stored occurrences, so no provider free/busy API is called.

### Kinds and capabilities

- `ProviderKindSchema` = `google | microsoft | apple`
  (`packages/core/src/types/sync/identity.contracts.ts`).
- `CalendarProviderSchema` = `local` plus those three
  (`packages/core/src/types/calendar.contracts.ts`).
- `ProviderCapabilitySchema`: `readEvents`, `writeEvents`, `readBusy`,
  `inviteAttendees`, `changeNotifications`, `incrementalChanges`,
  `suggestContacts`.
- Display names: `PROVIDER_DISPLAY_NAMES` / `providerDisplayName(kind)`.
- Conference kind on a calendar: `CalendarConferenceSchema` =
  `meet | teams | none`, derived by `conferenceForProvider` from
  `CONFERENCE_BY_PROVIDER` (not a `provider ===` branch).

### Registry

`ProviderRegistry` (`packages/sync/src/providers/provider-registry.ts`) maps a
kind to a `ProviderRegistration`: `adapters`, `scopes`, `capabilities`,
`callbackPath`, `notificationsCallbackPath`, `capabilitiesFromScopes`.
`buildProviderRegistry(config)` is the factory. `app.ts`, job dispatch,
credential custody, and the public routes resolve adapters per connection
through `registry.get(kind)`.

Google registers when `google.clientId` / `google.clientSecret` are set.
Microsoft and Apple config is read into `SyncConfig` but those kinds are not
registered until M-09 / A-08.

`ProviderAdapters` on a registration:

| Field | Port | Methods |
|---|---|---|
| `auth` | `ProviderAuthAdapter` | `buildAuthorizationUrl`, `exchangeAuthorizationCode`, `refreshAccessToken`, `revoke` |
| `calendars` | `ProviderCalendarAdapter` | `discoverCalendars` |
| `reader` | `ProviderEventReader` | `listEventPage` |
| `writer` | `ProviderEventWriter` | `createEvent`, `patchEvent`, `deleteEvent`, `fetchEvent`, `fetchInstanceAt` |
| `notifications` | `ProviderNotificationAdapter` | `watch`, `stopChannel`, `parseNotification` |
| `contacts` | `ContactsPort` (optional) | `searchContacts` |

`parseNotification` returns a `ProviderNotification`, a Microsoft
validation handshake `{kind: "validation", body}`, or `null`.

Provider code lives under `packages/sync/src/providers/<kind>/`. Each adapter
takes an injectable narrow API so tests script results without network access.
The shared contract suite under `packages/sync/src/providers/__contract__/`
runs every adapter against a recorded fixture corpus.

### Public sync paths

Constants: `OAUTH_CALLBACK_PARAM_PATH`, `NOTIFICATIONS_PARAM_PATH`, plus Google
aliases `GOOGLE_CALLBACK_PATH` and `GOOGLE_NOTIFICATIONS_PATH`.

| Path | Role |
|---|---|
| `GET /sync/:provider` | OAuth callback |
| `GET /sync/google` | Google alias of the callback |
| `POST /sync/notifications/:provider` | Push ingress |
| `POST /sync/notifications/google` | Google alias of push ingress |

### Compass API connection paths

| Path | Role |
|---|---|
| `POST /api/auth/connections/begin` | Start OAuth; body `{provider?, connectionId?, features?}` |
| `POST /api/auth/connections/refresh` | User-triggered catch-up |
| `DELETE /api/auth/connections/:connectionId` | Disconnect |
| `POST /api/auth/google/connect/begin` | Google alias of begin (one release) |
| `DELETE /api/auth/google/connect/:connectionId` | Google alias of disconnect (one release) |
| `POST /api/auth/google/sync/refresh` | Google alias of refresh (one release) |

Begin returns `{kind: "redirect", authorizationUrl}`. The connected response
kind `{kind: "connected", connectionId}` is on
`ConnectionBeginResponseSchema` for Apple WP-03; that credential-form
route is not mounted yet.

Sync-internal counterparts: `GET /internal/connections`,
`POST /internal/connections/begin`, `POST /internal/connections/refresh`,
`POST /internal/connections/foreground-refresh`,
`POST /internal/connections/adopt-google-authorization`,
`DELETE /internal/connections/:id`, `GET /internal/calendars`,
`GET /internal/events/full`, `POST /internal/availability/busy`,
`GET /internal/contacts/suggestions`, `POST /internal/commands`,
`DELETE /internal/principal`, `GET /internal/changes`.

### Config keys

| Key | Role |
|---|---|
| `google.clientId`, `google.clientSecret` | Google OAuth (sign-in and calendar) |
| `microsoft.clientId`, `microsoft.clientSecret` | Microsoft OAuth (all-or-none) |
| `apple.signIn.servicesId`, `apple.signIn.teamId`, `apple.signIn.keyId`, `apple.signIn.privateKey` | Sign in with Apple (all-four-or-none; milestone I) |
| `sync.credentialEncryptionKey` | 32-byte base64 AES-256-GCM key for credentials at rest |
| `sync.callbackBaseUrl` | Public base for OAuth redirects and webhooks |
| `sync.postConnectRedirectUrl` | Browser redirect after connect; defaults to callback base |
| `sync.execution` | `passive` or `active` |
| `sync.serviceUrl`, `sync.internalAuthToken`, `sync.mongoUri` | Backend-to-sync and Sync storage |

Apple polling env overrides (see Apple polling cadence):
`RECONCILE_STALE_AFTER_MS_APPLE`, `RECONCILE_SWEEP_INTERVAL_MS_APPLE`,
`RECONCILE_SWEEP_LIMIT_APPLE`.

### Credentials

Discriminated on `credentialKind: "oauthRefresh" | "password"`. Documents
without `credentialKind` parse as `oauthRefresh`.

Password credentials are always sealed at rest. New OAuth refresh tokens are
also sealed by `CredentialCustody.store` with the same
`sync.credentialEncryptionKey`. Legacy plaintext `refreshToken` rows remain
readable and are lazily re-encrypted on refresh. Storing a new credential
requires the key.

### Poll-only providers

Subscription maintenance settles `unsupported` when the registry
capabilities omit `changeNotifications`. `buildReconcileSweepRows` adds a
`reconcile-<kind>` row per poll-only kind. Apple defaults: 60 s stale window,
30 s sweep interval (±20% jitter), batch limit 500.

### User metadata overlap

`UserMetadata.connections[]` is the provider-neutral list. `metadata.google`
(including `metadata.google.connections`) stays as an overlap copy so clients
that have not migrated still work.

## Connect flows

**Google and Microsoft (redirect).** `POST /api/auth/connections/begin
{provider}` returns `{kind: "redirect", authorizationUrl}`. The browser
navigates there, the provider redirects to the sync service's
`GET /sync/:provider` callback, sync links the connection and enqueues calendar
list discovery, then redirects back with `?provider=<kind>&status=<status>`.

**Apple (credential form, Apple WP-03).** The user creates an app-specific
password at appleid.apple.com and submits email plus password in Compass. The
secret travels in the existing encrypted transit envelope. Sync validates it
by running CalDAV discovery, stores the encrypted credential, enqueues discovery
and returns `{kind: "connected", connectionId}`. The password is never logged.
The UI states plainly that an app-specific password grants access to the
whole iCloud account and that Compass stores it encrypted.

**Apple invitations.** iCloud performs server-side scheduling by default when
`ATTENDEE` lines are present (`SCHEDULE-AGENT=SERVER`), so adding guests makes
iCloud send mail. Compass maps `invitation: "none"` to
`SCHEDULE-AGENT=CLIENT` on attendee parameters so edits do not trigger mail.
`invitation: "all"` and `"externalOnly"` leave server scheduling enabled.

## Booking

Booking enables when any healthy connection offers a writable destination
calendar (`canWriteEvents`). Empty healthy set is `CALENDAR_NOT_CONNECTED`.
A destination that cannot be written is `DESTINATION_NOT_WRITABLE`.
`GOOGLE_NOT_CONNECTED` remains a one-release wire alias of
`CALENDAR_NOT_CONNECTED`.

The confirmation copy names the conference kind the destination supports
(`meet`, `teams`, `none`). An Apple destination creates the event without a
video link and says so.

## Identity

`user.identities[]` records `{provider, subjectId, email}` per login method
(milestone I). The same verified email across methods resolves to one Compass
user through SuperTokens account linking. Sign in with Apple identifies by
`sub`, because private-relay addresses are not the calendar account address.
After signup with a method that grants no calendar, onboarding asks which
service hosts the calendar: "If you view your calendar in Apple Calendar, it
may still be hosted by Google or Microsoft."

## Named warts

Each alias names the release that removes it.

- **OAuth plaintext rows.** New OAuth refresh tokens are encrypted at rest with
  `sync.credentialEncryptionKey`. Legacy plaintext `refreshToken` rows stay
  readable and are lazily re-encrypted on refresh. `encrypt-credentials`
  backfills the rest. Milestone C drops plaintext acceptance. (The tracking
  issue still listed "encrypt OAuth at rest" as C work; that is already
  done for new stores.)
- **`GOOGLE_REVOKED`.** Alias of `CONNECTION_REVOKED` on the SSE and HTTP
  wires. `revokedConnectionServerMessages` emits both. Event mutations still
  return HTTP 410 `GOOGLE_REVOKED`. Milestone C removes `GOOGLE_REVOKED` after
  every client reads `CONNECTION_REVOKED`.
- **Health snapshot fleet label.** `health-snapshot.service.ts` hard-codes
  `provider: "google"` for the whole fleet. Milestone C splits the snapshot per
  provider.
- **`metadata.google` overlap.** `UserMetadata.connections[]` is the
  provider-neutral list; `metadata.google` (and `metadata.google.connections`)
  stays until WP-08c clients read `connections[]`. Drop the overlap in
  milestone C.
- Microsoft category colors are read but never written back.
- Apple freshness depends on polling and is bounded by iCloud rate limits.

## Microsoft Graph event reads

WP-05 spike (Graph documentation, confirmed against the normalizer fixture corpus):

| Endpoint | `type` values returned | Compass use |
|---|---|---|
| `GET /me/calendars/{id}/events/delta` | `singleInstance`, `seriesMaster`, `exception` (no `occurrence`) | Primary incremental reader |
| `GET /me/calendars/{id}/calendarView/delta` | `singleInstance`, `occurrence`, `exception` (expanded instances) | Windowed bootstrap pass only |

Compass reads masters and exceptions, never occurrences. The reader uses
`events/delta` for full and incremental passes (`startDateTime` bounded to the
sync horizon: 12 months past through 18 months future). When the import worker
supplies a bounded working window with both ends, the reader uses
`calendarView/delta` because `events/delta` does not accept `endDateTime`.
Occurrence rows from `calendarView/delta` are skipped and counted in `skipped`.

Initial and incremental requests send `Prefer: odata.maxpagesize=200` and
`outlook.timezone="UTC"`. `@odata.nextLink` becomes `nextPageToken`;
`@odata.deltaLink` becomes `nextSyncToken` (stored as `syncCursor`). Removed
items arrive as `{id, "@removed": {reason}}` and map to cancellations. A `410`
or `syncStateNotFound` response maps to `cursorExpired`.

If a future Graph change returns occurrence-only rows from `events/delta`, fall
back to `calendarView/delta` over the horizon plus a `GET /me/events/{seriesMasterId}`
hop for masters, and update this section.

## Apple polling cadence

Apple has no push channel (`changeNotifications` is absent from the
registration). Freshness comes from the dedicated `reconcile-apple` sweep row
in the sync service.

| Setting | Default | Env override |
|---|---|---|
| Stale threshold | 60 s | `RECONCILE_STALE_AFTER_MS_APPLE` |
| Sweep interval | 30 s (±20% jitter) | `RECONCILE_SWEEP_INTERVAL_MS_APPLE` |
| Batch limit | 500 calendars per sweep | `RECONCILE_SWEEP_LIMIT_APPLE` |

When a connection has N calendars, the effective per-calendar cadence is:

`cadence = interval × ceil(N / limit)`

Example: 1,000 calendars at limit 500 and interval 30 s needs two cycles, so
each calendar is eligible roughly every 60 s (plus the 60 s stale window).

### Throttle measurement

Founder soak uses `bun run cli apple-poll-throttle` with
`SMOKE_APPLE_EMAIL` and `SMOKE_APPLE_APP_PASSWORD`. The script polls one
calendar with RFC 6578 `sync-collection` every `--interval-seconds` for
`--duration-seconds` (default 30 minutes) and records HTTP status codes.

| Measurement | Value |
|---|---|
| Shortest interval without 429/503 over 30 min | pending founder soak (`apple-poll-throttle`) |
| Provisional floor (pre-soak) | 20 s |
| Chosen default interval (1.5× provisional floor) | 30 s |
| Chosen stale threshold | 60 s |

Re-run the probe after iCloud behavior changes and replace the provisional
floor with the measured minimum.

## Deferred

- Outbound ICS feed for Apple users who refuse an app-specific password.
- Writing Microsoft categories or Apple event colors.
- Publishing one Compass event to several providers.
- Native EventKit access from an iOS or macOS client.
