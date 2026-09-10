# Docs

Internal documentation for engineers and agents working in the Compass repo.

## Start Here

- [Repo Architecture](./architecture/repo-architecture.md)
- [Product Suite Boundaries](./architecture/product-suite-boundaries.md)
- [Feature File Map](./development/feature-file-map.md)
- [Common Change Recipes](./development/common-change-recipes.md)

## Common Change Paths

- Auth or session behavior: [Frontend Runtime Flow](./frontend/frontend-runtime-flow.md), [Password Auth Flow](./features/password-auth-flow.md), [Google Sync And SSE Flow](./features/google-sync-and-sse-flow.md)
- Event shape or recurrence behavior: [Event Domain Model](./architecture/event-domain-model.md), [Common Change Recipes](./development/common-change-recipes.md#change-recurring-event-behavior)
- Attendees, contact suggestions, or RSVP: [Attendees, Contacts, And RSVP](./features/attendees.md), [Feature File Map](./development/feature-file-map.md#attendees-contacts-and-rsvp)
- Event caching, reads, or optimistic writes: [Event Caching](./frontend/event-caching.md)
- Dragging/resizing events on the week grid: [Week Drag Interaction](./frontend/week-drag-interaction.md)
- Keyboard shortcuts, event jump, or pointer hints: [Shortcut Commandments](./frontend/shortcut-commandments.md), [Shortcuts](./acceptance/shortcuts.md), [Contextual Pointer Guidance](./frontend/contextual-pointer-guidance.md), [Feature File Map](./development/feature-file-map.md#keyboard-shortcuts)
- Welcome, Shortcut Showcase, or the first-event handoff prompt: [Feature File Map](./development/feature-file-map.md#welcome-showcase-and-first-event-handoff), [Frontend Runtime Flow](./frontend/frontend-runtime-flow.md#welcome-showcase-and-first-event-handoff)
- Breakpoints, sidebar collapse, or layout at different viewport sizes: [Responsive Layout](./frontend/responsive-layout.md)
- Local-first or storage behavior: [Offline Storage And Migrations](./features/offline-storage-and-migrations.md)
- Backend routes and API behavior: [Backend Route Map](./backend/README.md), [Backend Request Flow](./backend/backend-request-flow.md), [Backend Error Handling](./backend/backend-error-handling.md)
- Trial, pricing, or Stripe: [Billing And Trial](./features/billing.md)
- Public booking pages or availability rules: [Compass Calendar Booking (v1)](./features/booking.md)
- Hiding or showing an event on the grid: [Hidden Events](./features/hidden-events.md), [Feature File Map](./development/feature-file-map.md#hidden-events)
- A new calendar integration or Google-sync behavior: [Calendar providers](./features/calendar-providers.md), [Google Sync And SSE Flow](./features/google-sync-and-sse-flow.md), the `packages/sync` domain code directly

## Features

- [Attendees, Contacts, And RSVP](./features/attendees.md)
- [Billing And Trial](./features/billing.md)
- [Compass Calendar Booking (v1)](./features/booking.md)
- [Calendar providers](./features/calendar-providers.md)
- [Google Sync And SSE Flow](./features/google-sync-and-sse-flow.md)
- [Hidden Events](./features/hidden-events.md)
- [Offline Storage And Migrations](./features/offline-storage-and-migrations.md)
- [Password Auth Flow](./features/password-auth-flow.md)

## Architecture And Domain

- [Repo Architecture](./architecture/repo-architecture.md)
- [Product Suite Boundaries](./architecture/product-suite-boundaries.md)
- [Event Domain Model](./architecture/event-domain-model.md)
- [Calendar providers](./features/calendar-providers.md)
- [Multi-account Sync](./architecture/multi-account-sync.md)
- [Multi-account Sync](./architecture/multi-account-sync.md)
- [Glossary](./architecture/glossary.md)

## Development And Operations

- [Local Development](./development/local-development.md)
- [Cursor Cloud Environment](./development/cursor-cloud.md)
- [Troubleshooting](./development/troubleshoot.md)
- [Configuration](./Config/README.md)
- [Hosting Modes](./development/hosting-modes.md)
- [Self-Hosting](./self-hosting/README.md)
- [Testing Playbook](./development/testing-playbook.md)
- [Launch Ops Checklist](./development/launch-ops-checklist.md)
- [Performance Baselines](./development/performance-baselines.md)
- [Types And Validation](./development/types-and-validation.md)
- [CI/CD Workflows](./CI-CD/workflows.md)
- [CI audit, September 2026](./CI-CD/ci-audit-2026-09.md)
- [Error Autofix Routine](./CI-CD/error-autofix-routine.md)
- [Agent loop Routine](./CI-CD/agent-loop-routine.md)
- [CLI And Maintenance Commands](./development/cli.md)
- [Versioning](./CI-CD/versioning.md)

## Acceptance

User-visible behavior runbooks for manual verification and expected outcomes:

- [Auth](./acceptance/auth.md)
- [Events](./acceptance/events.md)
- [Google Sync](./acceptance/google-sync.md)
- [Recurring Events](./acceptance/recurring-events.md)
- [Shortcuts](./acceptance/shortcuts.md)
