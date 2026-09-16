# Common Change Recipes

These are the safest implementation paths for common Compass changes.

## Add A Backend Endpoint

1. Define or extend a shared schema/type in `packages/core/src/types` if the contract is shared.
2. Add the route to the relevant `packages/backend/src/*/*.routes.config.ts`.
3. Keep the controller thin in `controllers/*.controller.ts`.
4. Put business logic in `services/*.service.ts`.
5. Add controller or service tests.
6. If the endpoint affects realtime UI, decide whether an SSE event is required.

## Add A New Event Field

1. Update the event schema/types in `packages/core/src/types/event.contracts.ts`.
2. Update any mapper or utility code in `packages/core/src/mappers` or `packages/core/src/util/event`.
3. Update backend persistence or parser logic if the field is stored or transformed.
4. Update web editors, selectors, and rendering.
5. Add tests in `core`, `web`, and `backend` as needed.

Rule: never treat event shape as web-only unless the field is strictly presentational.

## Change Recurring Event Behavior

Recurrence is owned entirely by the Sync service now (`packages/sync`) — the
backend has no recurrence-planning logic of its own; it submits commands and
Sync applies them.

1. Read `packages/core/src/types/sync/event.contracts.ts` (`SyncEventRecurrenceSchema`: `single` / `seriesMaster` / `exception`).
2. Read `packages/sync/src/domain/occurrence-projection.ts` and `reproject.ts` (RRULE expansion into the derived occurrence window).
3. Read `packages/sync/src/domain/series-exception.ts` (cancelled vs. overridden instance handling).
4. Read `packages/sync/src/domain/cloud-command.service.ts` and `provider-command.service.ts` (the two command-execution paths — cloud-only vs. provider-linked).
5. Update the projection, exception, or command-execution logic that actually owns the behavior.
6. Add focused tests in `packages/sync` for the exact recurrence transition you changed.

Do not edit recurring behavior from one layer only — the command-service
change and the projection/reprojection it triggers both need to stay
consistent.

### Common Mistakes

- **Assuming a retired migration runner can repair existing records** — current releases ship no server-side migration framework. Plan a bounded Sync repair or provider re-import deliberately, with an operator runbook, instead of reviving the completed cutover tooling.
- **Testing only the happy-path transition** — cancellation transitions follow a different code path (`series-exception.ts`). A test that only covers the primary create/update flow can pass while cancellation transitions break silently.

## Add An SSE Event

1. Add a new discriminated member to `packages/core/src/types/server-message.contracts.ts` (`ServerMessage` union).
2. Add a matching `publish*` convenience method on `SSEServer` (`packages/backend/src/servers/sse/sse.server.ts`) and a case in `sse.server.test.ts`'s completeness table.
3. Call it from whichever backend code detects the change — either directly, or by adding a case to `syncInvalidationToServerMessages` (`packages/backend/src/servers/sse/sync-invalidation.to-server-message.ts`) if it's driven by Sync's change feed.
4. Consume it in a web hook under `packages/web/src/sse/hooks` (listeners switch on the message `type`).
5. Add tests on both emitter and listener sides.

## Add Or Change Local Storage Data

1. Update `packages/web/src/common/storage/offline-data/offline-data.store.ts` if the public store contract changes.
2. Update `packages/web/src/common/storage/offline-data/indexeddb-offline-data.store.ts`.
3. Add a migration if existing user data could become invalid.
4. Add offline data store and migration tests.

### Common Mistakes

- **Adding new fields without a migration** — existing users already have data in IndexedDB without the new field. If your code expects the field to be present, it will fail silently or throw on their existing records. Always add a migration in `packages/web/src/common/storage/migrations/migrations.ts` and test the migration path, not just the new code path.
- **Testing only the new code path** — write a test that starts with pre-migration data (the old shape) and confirms the migration transforms it correctly. A test that only creates fresh data will not catch migration regressions.

## Change Repository Selection Or Offline Behavior

1. Start in `packages/web/src/events/repositories/event.repository.util.ts`.
2. Verify auth-state implications in `packages/web/src/auth/compass/session/SessionProvider.tsx` and auth-state helpers.
3. Test both never-authenticated and previously-authenticated behavior.

## Add Or Change A Keyboard Shortcut

1. Declare the binding once in `packages/web/src/shortcuts/keymap.ts` (taught
   flows) or `packages/web/src/shortcuts/app-shortcut-bindings.ts` (everything
   else the main shell registers).
2. Add or update the row in `packages/web/src/shortcuts/shortcuts.registry.ts`
   (id, keys derived from those tables, label, section, optional `when`). The
   `?` legend reads from this registry — do not hard-code a second label list.
3. Register the key in the owning hook:
   - global / shell: `packages/web/src/shortcuts/useGlobalShortcuts.ts`
   - day/week view keys: `packages/web/src/grid/shortcuts/useCalendarViewShortcuts.ts`
     (behavior in `useWeekShortcutOwner.ts` / `DayCalendarGrid.tsx`)
   - shared grid edit/focus: `packages/web/src/grid/shortcuts/`
   - event jump (`H`): `packages/web/src/shortcuts/shift-hint/`
   - Pointer suppression (mouse permanently inert): `packages/web/src/shortcuts/keyboard-only/`
4. Respect `app-lock`, `escape-ownership`, and “do not fire while typing in
   inputs” (use the existing `useAppShortcut` helpers; do not attach bare
   `window` listeners for new app shortcuts). Bare-letter shortcuts (`H`, `F`,
   `M`, `E`…) must yield to an armed edit sequence.
5. Add or update registry/data tests and the owning hook tests. Update
   [Shortcuts acceptance](../acceptance/shortcuts.md) when user-visible
   behavior changes.

Common pitfalls:

- **Legend-only change** — updating the registry without a handler (or the
  reverse) ships a lie in the `?` overlay.
- **Showcase drift** — remapping a taught shortcut in the handler but not
  `keymap.ts` leaves the practice calendar teaching the old keycaps.
- **App-lock blind spots** — shortcuts that fire while Auth/Settings/Welcome
  own the UI feel broken; follow the helpers that already gate on lock state.

## Change A Shared Hotkey Dialog (Day + Week)

Use this for overlays mounted in both `WeekView` and `DayViewContent` (for example Dedication).

1. Update the shared dialog component in `packages/web/src/views/Week/components/Dedication/Dedication.tsx`.
2. Confirm both mount points still render it:
   - `packages/web/src/views/Week/WeekView.tsx`
   - `packages/web/src/views/Day/view/DayViewContent.tsx`
3. Keep keyboard behavior aligned:
   - toggle hotkey (`ctrl+shift+0`)
   - close hotkey (`escape` when open)
4. Preserve the transition lifecycle:
   - open with `showModal()` then set visible state
   - close by state first, then `dialog.close()` in `onTransitionEnd`
   - keep `onCancel(e.preventDefault())` so Escape uses the animated close path

Common pitfall: calling `dialog.close()` directly in an event handler will skip the CSS exit transition and can produce abrupt UI changes.

## Add A Web Local-Data Migration

For web local-data migrations:

1. inspect `packages/web/src/common/storage/migrations/migrations.ts`
2. add the migration to the correct registry
3. add migration tests

## Change Environment Handling

1. Update the relevant env schema:
   - backend: `packages/backend/src/common/constants/config.constants.ts`
   - web: `packages/web/src/common/constants/env.constants.ts`
2. Confirm startup behavior still works in the intended dev mode.
3. Document any new required variables.

## Type A Hook That Accepts A `queryOptions`-Builder Function

Some web hooks take a TanStack Query `queryOptions(...)`-returning function as
a parameter (for example `usePrefetchAdjacentEvents`, which takes either
`weekEventsQueryOptions` or `dayEventsQueryOptions` in
`packages/web/src/events/queries/usePrefetchAdjacentEvents.ts`) so the same
hook works for either view. Two approaches that look reasonable both fail to
type-check:

1. A named function-type alias with a fixed return shape (e.g.
   `(args) => FetchQueryOptions<never, Error, never>`) — `never`/`unknown`
   erase the concrete `queryKey` tuple type each call site actually returns,
   producing `'queryKey' requires 3 elements but source may have fewer`
   errors.
2. A union of the concrete function types
   (`typeof weekEventsQueryOptions | typeof dayEventsQueryOptions`) — calling
   a union of functions collapses the return type in a way that fails to
   unify with the consumer's own generic inference for one of the two shapes.

What works: make the *consuming hook itself* generic with the same type
parameters `prefetchQuery`/`useQuery` use
(`TQueryFnData, TError, TData, TQueryKey extends readonly unknown[]`), and
type the parameter as
`(args: EventsQueryArgs) => FetchQueryOptions<TQueryFnData, TError, TData, TQueryKey>`.
Each call site then independently instantiates the generic via inference —
no union collapsing, no erased tuple type. TanStack's generic surface is
designed for per-call-site inference; piggyback on that instead of fighting
it with a shared named type.

## Add A New CLI Command

1. Register the command in `packages/scripts/src/cli.ts`.
2. Implement behavior in `packages/scripts/src/commands`.
3. Reuse shared CLI utilities from `packages/scripts/src/common`.
4. Add integration tests colocated with the command (`*.db.test.ts`).

## Start Agent Work From A GitHub Issue

Prefer issues opened with the **Agent task** template
(`.github/ISSUE_TEMPLATE/3-agent-task.yml`, label `agent-ready`). That
body names finish line, acceptance, package scope, verify commands, and
approval boundary. Status lives on the GitHub issue (labels, open PR,
closed); see the `ship` skill. Bug and feature templates have optional
Agent routing fields; they are not required for human-only issues.
