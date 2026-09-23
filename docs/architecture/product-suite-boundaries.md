# Compass Product Suite Boundaries

**Status:** Proposed

**Decision scope:** Calendar, Booking, Reminders, and the Calendar macOS app

## Decision

Keep Compass as one Bun workspace and one deployable backend at first. Organize
code by **product/domain ownership**, not by runtime or by a generic shared
layer. Add a deployable only when it needs an independent runtime, release
cycle, scaling profile, or security boundary.

The near-term shape is:

```text
apps/
  calendar-web/       # current packages/web, moved only when useful
  booking-web/        # public guest /meet SPA (host Meeting Settings stay in calendar-web)
  calendar-macos/     # native shell and macOS-only integration
  api/                # current packages/backend; one modular backend
  sync/               # current provider-sync service
  reminders-worker/   # create when durable reminder delivery is implemented

packages/
  calendar/           # calendar domain model and application logic
  booking/            # availability, booking, and booking-page domain logic
  reminders/          # reminder policy and scheduling domain logic
  contracts/          # small, versioned Zod wire contracts by domain
  platform/           # deliberately small auth, logging, config, and IDs
  ui/                 # optional shared primitives, not product screens
```

This is a target map, not a request for an immediate repository migration.
Keep the current package names while features are being delivered, and extract
along real seams as each new product starts. A large up-front directory move
would add churn without strengthening a runtime boundary.

## Dependency rule

Dependencies point inward toward domain code and explicit contracts:

```text
apps -> product packages -> contracts/platform
```

- Product packages do not import from one another directly.
- Cross-product behavior uses an explicit public contract or an application
  service composed in `apps/api`.
- Apps never import another app.
- Provider SDKs, Mongo types, Express types, React types, and native APIs do not
  appear in domain contracts.
- `platform` stays technical and small. It must not become a second generic
  `core` package.
- Share code only after two consumers need the same *stable concept*. Similar
  code may remain duplicated until its common abstraction is clear.

Enforce these rules with package manifests and lint/import-boundary checks;
folder naming alone is not a boundary.

## Product ownership

### Calendar

Calendar owns events, calendars, attendees on events, recurrence, and the
calendar experience. Attendees are therefore an expansion of the Calendar
domain, not a new shared subsystem.

The macOS app is another Calendar client. It should consume the same Calendar
HTTP/event-stream contracts as the web client. Share framework-neutral domain
logic where it has proven value, but do not force native UI through a web UI
abstraction. A thin native shell or shared web surface can be evaluated later
without changing the service boundary.

### Booking

Booking owns booking pages, availability rules, appointment types, invitee
questions, reservations, and cancellation/rescheduling policy. A confirmed
booking requests creation or mutation of Calendar events through a Calendar
application interface; it does not write Calendar persistence directly.

Booking ships as:

1. **`apps/booking-web`** for guest `/meet` (and legacy `/book` redirects): a
   separate frontend image and deploy pipeline, colocated on the same Compass
   Cloud or self-host stack as calendar-web, API, MongoDB, and Sync. Edge Caddy
   routes `/meet/*` to the booking-web container; calendar-web serves the rest.
2. **`packages/web` (calendar-web)** for host Meeting Settings and calendar UX.
3. A **booking module** in the existing API process because auth, billing, and
   data stay shared until a measurable split trigger applies.

This gives frontend and code boundaries without a Booking microservice. The API
module can become its own service later if independent scaling, availability,
data residency, or team ownership makes that cost worthwhile.

### Reminders

Reminders owns reminder rules, recipient/channel preferences, delivery
attempts, idempotency, and delivery status. It reads committed meeting facts
through contracts and must not own or mutate event truth.

Keep reminder policy in a `reminders` domain package. Run durable scheduling
and delivery in a worker when the feature ships because retries, delayed work,
and provider rate limits have a different lifecycle from HTTP requests. The
worker may initially share the API repository, database cluster, deployment
pipeline, and operational libraries; it should have its own entrypoint and
data collections.

## Sync service

Keep one sync service and treat it as a **Calendar integration capability**,
not as a generic product backend.

It should continue to own:

- Google/provider credentials and OAuth state;
- provider API adapters and webhook verification;
- watches, cursors, reconciliation, retries, and connection health; and
- translation at the provider boundary.

It should not own Booking availability/rules or Reminders delivery. Booking
asks Calendar for free/busy and creates Calendar events; Calendar reaches
external providers through Sync. Reminders consumes internal meeting facts
and uses channel-specific delivery adapters of its own.

Keep Sync as a separate process because credential custody, webhooks,
background reconciliation, and provider rate limits are already a meaningful
operational boundary. Avoid one sync deployment per product. If another
product later synchronizes a genuinely different resource, add a provider
adapter and explicit resource contract before considering another service.

## Contracts and data

### Contract packages

Replace the idea of one ever-growing `core` with domain-specific entrypoints:

```text
@compass/contracts/calendar
@compass/contracts/booking
@compass/contracts/reminders
@compass/contracts/sync-internal
```

Each entrypoint contains Zod schemas plus inferred types for data that crosses
a process or persistence boundary. Keep commands, responses, webhook payloads,
and emitted events explicit. Domain-internal types stay with their product.
UI view models stay in the relevant app.

Do not migrate all of `packages/core` at once. This proposed package location
is inactive until the repository's `AGENTS.md` contract-placement rule is
updated in the change that creates it. Until then, shared web/backend contracts
continue to belong in `packages/core` and use Zod. After that rule changes, new
contracts should use the domain entrypoints and existing event contracts can
move when touched. Utilities, logging, configuration, and Google mapping
currently colocated in `core` should eventually move to their actual owner
rather than into `contracts`.

### Cross-product communication

Start with in-process application interfaces in the modular API. Design those
interfaces as if they cross a boundary:

- Booking calls `Calendar.createEvent` and `Calendar.getAvailability`.
- Calendar records a durable fact such as `calendar.event.created`.
- Reminders reacts to committed facts and schedules idempotent deliveries.
- Sync reports provider changes to Calendar through its authenticated internal
  API/change feed.

Do not introduce a message broker for the first release. Where background
delivery must survive crashes, use an outbox/job collection written with the
source state, then let a worker claim jobs idempotently. Introduce a broker
only after throughput or fan-out demonstrates the need.

### Data ownership

One MongoDB deployment is sufficient initially, but ownership is per domain:

- Calendar, Booking, Reminders, and Sync own separate collections.
- Only the owning module writes its collections.
- References across domains use stable IDs, not shared persistence models or
  joins hidden inside repositories.
- Cross-domain reads go through an application interface or a purpose-built
  read model.

Separate databases can follow later without rewriting domain behavior if this
rule is maintained now.

## Delivery and repository ergonomics

- Give every app/package focused `dev`, `test`, `type-check`, and `build`
  commands while retaining root orchestration commands.
- Make CI diff-aware so a change runs the owning package checks plus checks for
  reverse dependents; keep a periodic full suite as a safety net.
- Add `CODEOWNERS` only when ownership is real. Do not manufacture team
  boundaries before teams exist.
- Keep end-to-end tests around user journeys and contract tests around process
  boundaries. Most business-rule tests belong in product packages.
- Keep one version and one repository-wide lockfile until independent release
  versioning provides concrete value.

## Incremental adoption

1. **Now:** document and enforce the dependency direction. Put attendee work
   in Calendar. Keep Sync as-is operationally.
2. **Booking v1 (shipped):** specified in
   [Compass Calendar Booking (v1)](../features/booking.md). The API booking
   module, host Meeting Settings in calendar-web, and guest `/meet` in
   `apps/booking-web` are live on staging (separate booking-web container,
   Caddy `/meet/*` split, dedicated staging deploy workflow). Production guest
   `/meet` stays gated off per product policy; infra matches staging when the
   gate opens. Use Calendar application interfaces; no Booking microservice.
3. **First Reminders slice:** add reminder contracts/policy plus a worker
   entrypoint backed by durable, idempotent jobs.
4. **Contract cleanup while touching code:** create domain contract entrypoints
   and shrink `core`; do not perform a flag-day migration.
5. **Directory rename later:** `apps/booking-web` already exists; move
   calendar-web and other deployables under `apps/` when tooling or ownership
   benefits. Renaming is not an architectural prerequisite.

## Extraction triggers

Split a backend module into its own service only when at least one measurable
condition exists:

- it must deploy independently for reliability or release cadence;
- its load or scaling model materially differs;
- it needs stronger credential, data, or compliance isolation;
- failures must be isolated at the process level; or
- a team can own its API and operations end to end.

Until then, a modular monolith plus the existing Sync process and a Reminders
worker is the simplest architecture that preserves future options.

## Consequences

### Benefits

- New products receive explicit ownership without immediate microservices.
- Calendar web and macOS clients share contracts rather than implementation
  details.
- Sync remains focused and reusable without becoming a universal workflow
  engine.
- Domain-owned collections and interfaces preserve an inexpensive future
  service split.
- Focused tooling keeps common changes fast as the repository grows.

### Costs and risks

- The modular API requires discipline because process-local imports are easy.
- Some duplication is intentionally tolerated until abstractions stabilize.
- `packages/core` will coexist with newer domain packages during migration.
- Durable reminders add worker and job/outbox operations, even without a
  broker.

These costs are smaller and more reversible than prematurely operating a
service, database, shared UI system, or event bus for every product.
