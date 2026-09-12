# Frontend Runtime Flow

This document describes how the web app boots and where runtime responsibilities live.

## Boot Sequence

Primary entrypoint:

- `packages/web/src/index.tsx`

Boot order:

1. initialize local storage through `initializeDatabaseWithErrorHandling()`
2. initialize session tracking with `sessionInit()`
3. render `<App />`
4. show a toast if local database initialization failed

This order matters because storage should be ready before listeners and repositories perform local operations.

## App Provider Tree

`packages/web/src/components/App/App.tsx` renders:

- keyboard and movement event setup hooks
- optional providers
- required providers
- router provider

The route tree lazily loads feature views.

## Router Flow

Files:

- `packages/web/src/routers/index.tsx`
- `packages/web/src/routers/loaders.ts`

Important behavior:

- the root route loads `RootView`
- the day route redirects to today's date when needed
- `loadAuthenticated()` checks whether a session exists
- route loaders use shared date parsing from `core`

## Root View Responsibilities

`packages/web/src/views/Root.tsx`:

- blocks mobile-OS devices with `MobileGate` (`isMobileOS` user-agent check; narrow desktop windows get the responsive layout instead)
- wraps authenticated layout with `UserProvider`
- wires SSE listeners through `SSEProvider`

This is the shell for the main desktop app experience.

## Welcome, Showcase, And First-Event Handoff

Files:

- `packages/web/src/components/RootShell/RootShell.tsx`
- `packages/web/src/components/WelcomeModal/WelcomeModal.tsx`
- `packages/web/src/components/ShortcutShowcase/`
- `packages/web/src/components/FirstEventPrompt/`

`RootShell` mounts the welcome modal, Shortcut Showcase, the first-event
prompt, global navigation / calendar-shell shortcuts, and the click hint tracker.
Those calendar-onboarding overlays are skipped on `/life` and on mobile OSes
(the overlays would paint over `MobileGate`, so a phone user sees the gate
first instead of a walkthrough they cannot use). Pointer suppression is also
skipped on `/life` so first-time visitors can click the page like a normal
site; the calendar views stay keyboard-only.

Welcome → signup → first-event contract:

- unauthenticated users who have not seen welcome get `WelcomeModal`
- welcome is three screens in one dialog, each with one focused primary
  button so Enter (or a click) is always the obvious next thing: **Get
  started for free** (headline, tagline, one-sentence pitch) → **Next** over
  the five FAQ rows (digits `1`–`5` toggle them, only on this screen) →
  the auth choices. `Log in` (`i`) and a three-dot step indicator sit on
  every screen. **Back** (`Esc`) sits left of Log in from the second screen
  on. Escape, the backdrop and **Back** step back one screen and
  are a no-op on the first, so a stray Escape never drops a first-timer into
  the practice game
- the welcome overlay is the one calendar surface where the mouse works
  (`data-pointer-pass`): a landing page should behave like a normal site, and
  keyboard-only starts once the visitor enters the calendar
- the last screen is titled **Let's get started** with the subtitle
  **Connect a calendar or start fresh**. Its CTA order is **Continue with Google**
  (`G`, when Google is available), **Sign up with email** (`U`), then
  **Explore without an account** (`S`), all the same full-width height.
  Explore is a quieter secondary pill so signup stays the stronger choice.
  Social and legal links (`6`–`0`) sit below. Google leads
  because the scopes Compass requests include the calendar, so that one round
  trip signs the user up *and* connects it, the moment the product starts
  being worth keeping
- **Explore without an account** starts the Shortcut Showcase
  (`entry: "welcome"`) after the welcome dialog unmounts
- **Log in** opens the auth modal and leaves the showcase flags alone, so a
  returning user is not handed the practice or the first-event prompt
- signing up (either route) defers a showcase offer via `showcase.storage.ts`;
  `offerAfterSignupIfPending()` redeems it once, right after signup completes
- the Shortcut Showcase is **Block Party**: a practice-only game whose state
  never reaches real calendar storage. A run clears a fixed queue of
  scheduling tasks (create, typed quick-times, nudge, edge resize, delete,
  undo, plus discovery beats for the `?` legend, `H` event jump, Mod-hold
  page jump, and `Mod+K` palette, all simulated inside the arena) against a
  ghost target slot, with scoring and streaks; task keycaps derive from the
  application's keymap and the exact next key pulses on the task card. The
  queue is authored one task per primitive with one press per key and never
  the same key twice in a row. The first run is untimed; the end screen
  offers a timed rematch, and a timed run whose clock expires keeps going
  with the score frozen at the buzzer.
  Esc skips the current task (leaving mid-run is the two-click Leave button),
  anonymous players get signup as the end screen's primary CTA, and
  graduation hands off to `FirstEventPrompt`. A reload mid-run re-offers a
  fresh run from the one-screen how-to card, and `?play=1` on any URL is a
  shareable deep link straight into the game (consumed, then stripped)
- `FirstEventPrompt` is a non-blocking real-calendar card. It stays hidden
  while the auth modal is open and retires after the first genuine create.
  Users who finished or dismissed the retired onboarding checklist are read
  as already done via a legacy storage key, so they never see it
- command palette can reopen practice (“Play Block Party”) or the welcome
  guide (“Show welcome guide”)
- users who already finished or skipped the retired guided tour are treated as
  having seen the showcase so it does not ambush them

Pointer suppression (always on, mounted from `RootShell`):

- blocks pointer clicks, right-clicks, and double-clicks everywhere; scroll
  and hover remain
- keyboard-activation clicks (Enter/Space on a native button), keyboard
  contextmenu (Shift+F10), and synthetic `.click()` calls pass through
- blocked clicks pulse `PointerHint`, a transient pill: known targets get
  the matching shortcut (including HHMM digits for an empty timed-grid
  click), and unannotated controls fall back to "keyboard only"
- `MobileGate` opts its subtree out (`data-pointer-pass`) so Copy and
  Waitlist can be tapped on a phone

See [Shortcuts](../acceptance/shortcuts.md) for acceptance coverage and
[Feature File Map](../development/feature-file-map.md#keyboard-shortcuts) for
file pointers.

## Session Runtime

File:

- `packages/web/src/auth/compass/session/SessionProvider.tsx`

Responsibilities:

- initialize SuperTokens recipes
- track auth state in a `BehaviorSubject`
- mark users as having authenticated
- open or close the SSE stream on session changes
- expose a React context for auth status

Important detail:

Once a user has ever authenticated, the app records that fact in local auth-state storage so repository selection can prefer remote data later.

When a user re-authenticates with Google, auth-state utilities also clear any in-memory "Google revoked" flag so normal remote sync can resume.

## Google Authorization Redirect

Google sign-in/up and Google Calendar connect/reconnect leave Compass through a full-page Google redirect and return through `/auth/google/callback`.

Before redirecting, the web app stores a short-lived authorization intent in `sessionStorage` keyed by OAuth `state`. The callback validates that state, finishes the saved intent, removes it, and returns the user to the original same-origin path or the default calendar route (`/week`).

The old blocking overlay is not used for Google authorization.

## User Bootstrap

File:

- `packages/web/src/auth/compass/user/context/UserProvider.tsx`

Responsibilities:

- fetch the user profile only for users who have authenticated before
- avoid blocking unauthenticated users
- show a session-expired toast on auth failures
- identify the user in PostHog when enabled

## Analytics Capture Filters

Files:

- `packages/web/src/auth/posthog/posthog.bootstrap.ts`
- `packages/web/src/auth/posthog/posthog-exception-filter.util.ts`
- `packages/web/src/auth/posthog/posthog-dead-click-filter.util.ts`

PostHog's `before_send` runs two filters, in order:

- unactionable exception signatures (SuperTokens/browser network blips,
  CefSharp scanner noise, opaque "Script error.", ResizeObserver loop warnings)
- dead clicks posthog's own mutation clock mis-scored (a click whose own
  re-render posthog records as happening *before* it) — the mechanism and the
  50ms window are documented in `posthog-dead-click-filter.util.ts` itself

Neither filter touches `$rageclick`: repeated clicking is real frustration
whatever the DOM did.

`calendar_connected` has two sources, distinguished by a `source` property:
`signup_google` from `GoogleAuthCallback` (a new user whose Google grant
included the calendar scopes) and `connect_redirect` from
`packages/web/src/auth/providers/connect-status.util.ts` (the sync service's
add-account round trip).
Only the second used to fire, so the activation metric missed the path most new
users actually take.

## Client Version Polling

Files:

- `packages/web/src/components/Sidebar/SidebarActions/useVersionCheck.ts`
- `packages/web/src/components/Sidebar/SidebarRefreshButton.tsx`
- `packages/web/src/components/Sidebar/SidebarActions/SidebarActions.tsx`

Runtime behavior:

- version checks are disabled in development mode
- in non-dev mode, the client checks on mount, then every 5 minutes
- the client also checks when a tab returns to visible after being hidden for at least 30 seconds
- requests use an absolute URL built from `window.location.origin` (`/version.json?t=<timestamp>`) with no-store/no-cache fetch options
- checks are de-duplicated so concurrent visibility/interval triggers do not issue overlapping fetches

When the server version differs from `BUILD_VERSION`, `isUpdateAvailable` becomes `true` and the sidebar shows a refresh action that triggers `window.location.reload()`.

## Sidebar Footer Controls

Files:

- `packages/web/src/components/Sidebar/Sidebar.tsx`
- `packages/web/src/components/Sidebar/MonthPicker/MonthPicker.tsx`
- `packages/web/src/components/Sidebar/SidebarActions/SidebarActions.tsx`
- `packages/web/src/components/Sidebar/SidebarRefreshButton.tsx`
- `packages/web/src/components/Sidebar/ShortcutsOverlay/ShortcutsOverlay.tsx`

Layout contract:

- the sidebar is fixed at 285px wide and fills the viewport height
- the scrollable planning content reserves its own scrollbar gutter so the footer stays fixed
- the footer control row is pinned to the bottom of the sidebar
- footer actions are grouped into shortcut access on the left and utility actions on the right

Control mapping:

- Open shortcuts opens an in-sidebar keyboard shortcuts overlay.
- Command palette toggle (`modifier + K`) calls open/close palette actions from the settings Zustand store (`packages/web/src/settings/settings.store.ts`).
- Refresh appears in the footer when `useVersionCheck()` reports an available
  update, or when the live-update stream has been down for 30 seconds.
- The account row shows temporary-account or signed-in account context.
- Background Google import state is not shown in the sidebar footer.

Icon state constraints:

- shortcut and command icons use filled weight when their related overlay/palette is open
- shortcut overlay state should not replace the sidebar conceptually; closing the overlay returns to the same sidebar

## Dedication Dialog Runtime

Files:

- `packages/web/src/views/Week/components/Dedication/Dedication.tsx`
- `packages/web/src/views/Week/WeekView.tsx`
- `packages/web/src/views/Day/view/DayViewContent.tsx`

Runtime behavior:

- the dialog is mounted in both day and week roots, so the same dedication UI is reachable in both views
- `ctrl+shift+0` toggles the dialog
- `escape` closes the dialog only when it is open
- the component uses native `HTMLDialogElement` APIs (`showModal`, `close`) instead of `react-modal`

Transition/close contract:

- opening calls `showModal()` first, then sets `isVisible` in `requestAnimationFrame` so CSS transitions can animate from hidden -> visible
- closing sets `isVisible` to `false` and waits for `onTransitionEnd` before calling `dialog.close()`
- `onCancel` calls `preventDefault()` and routes through the same close path so Escape/cancel actions do not skip exit animations

Pitfalls:

- do not call `dialog.close()` directly in new close handlers unless you intentionally want to bypass the fade/scale exit animation
- keep imports pointed at `.../Dedication/Dedication` (no barrel file in this folder)

## State Systems

The web app uses multiple state layers:

| Concern | Use | Key files |
| --- | --- | --- |
| Event loading, fetching, read errors, and persisted entities | TanStack Query range caches | `packages/web/src/events/queries/` |
| Event create/edit/delete/convert/reorder state | TanStack Query mutations | `packages/web/src/events/mutations/` |
| Draft Event and calendar interaction state | Zustand draft store | `packages/web/src/events/stores/draft.store.ts` |
| View dates/sidebar, cmd palette, user metadata | Zustand stores | `packages/web/src/events/stores/view.store.ts`, `packages/web/src/settings/settings.store.ts`, `packages/web/src/auth/state/user-metadata.store.ts` |
| Offline persistence | IndexedDB offline data store | `packages/web/src/common/storage/offline-data/indexeddb-offline-data.store.ts` |
| Local vs remote persistence choice | Repository factory | `packages/web/src/events/repositories/event.repository.util.ts` |

These layers are intentional. Do not mirror persisted Event entities into the
Zustand stores or call IndexedDB directly from components.

Zustand stores follow one pattern: a state-only store created with
`create()(devtools(...))` plus module-level action functions (e.g.
`draftActions.discard()`) that work identically from React and non-React code.
Selectors are plain functions passed to the store hook
(`useDraftStore(selectIsDrafting)`); selectors must return primitives or
stable references (use `useShallow` if one ever builds a new object).

Read these together for event work:

- `packages/web/src/events/queries` (reads, cache utilities, and view models)
- `packages/web/src/events/mutations` (persisted writes and pending state)
- `packages/web/src/events/stores/draft.store.ts` (transient drafts only)

## Event Flow

For a high-level tour of the caching model (cache-key anatomy, reads, optimistic
writes, and what refreshes the cache), see [Event Caching](./event-caching.md).
The summary below is the runtime sequence.

Typical event **read** flow:

1. a view hook mounts a `useXEventsQuery` hook (day/week)
2. TanStack Query fetches via the pure query function against the repository
   for the reactive source (`event.repository.source.store.ts`)
3. the normalized result remains in the source- and range-aware query entry;
   pure view models derive render data directly from it
4. changing the view range re-keys the query (fetch on new ranges, instant
   render from cache on revisits within `staleTime`)

Typical event **mutation** flow:

1. a hook or interaction calls the narrow `EventMutations` interface
2. the mutation captures the active repository source and cancels Event reads
3. immutable cache utilities apply the optimistic update to matching ranges
4. failures only report the error (no rollback — a snapshot restore could
   clobber a newer concurrent edit); the last settling mutation invalidates
   `eventQueryKeys.all` so the refetch converges to canonical data
5. pending Event IDs derive from TanStack Query mutation state; they never
   block interaction — the sidebar account summary shows a syncing spinner
6. SSE events invalidate the relevant query scope (day/week) to
   refetch later; auth transitions refresh the source store and drop stale
   cache entries

Creation uses optimistic events: the UI may show a temporary `_id` before the
repository returns the durable event. Do not store optimistic ids in other state
or treat them as stable.

Important consequence:

- persisted Event behavior is owned by TanStack Query; the draft Zustand store owns only draft and interaction state
- when debugging, inspect the query key, cache utility, mutation lifecycle, and repository source together

## Styling Systems

The web app currently uses two styling systems in parallel:

- Tailwind utilities for component styling
- Tailwind v4 utilities and semantic theme tokens from `packages/web/src/index.css` for newer or migrated surfaces

Use the existing `c-*` component utility convention and semantic colors from `packages/web/src/index.css`. Runtime theme values belong in `--compass-*` CSS variables so alternate themes can override values without rebuilding component styles.

## Week Grid Drag Interaction

Dragging a saved event on the week/day calendar grid resolves the target day
from a layout cache built at drag start, not from the event's own date
arithmetic. See [Week Drag Interaction](./week-drag-interaction.md) for the
coordinate model and why it matters once the week view can render fewer than
7 days.

## Repository Selection

File:

- `packages/web/src/events/repositories/event.repository.util.ts`

Repository choice:

- if Google access is revoked in-session, force local IndexedDB repository
- otherwise, never-authenticated users use local IndexedDB repositories
- authenticated or previously-authenticated users use remote repositories

This is deliberate and prevents events from "disappearing" after login when local data is empty.

Revoked state details:

- stored in memory only (not persisted)
- set when `GOOGLE_REVOKED` is detected from SSE or API error responses
- cleared when Google auth succeeds again

## Storage Initialization

Files:

- `packages/web/src/common/storage/offline-data/offline-data.store.registry.ts`
- `packages/web/src/common/storage/migrations/migrations.ts`

Startup storage flow:

1. create or reuse the offline data store singleton
2. open IndexedDB and run internal schema migrations
3. run data migrations
4. run external import migrations

Database init failure is non-fatal; the app falls back to remote-only behavior when possible.

## SSE Runtime

Files:

- `packages/web/src/sse/provider/SSEProvider.tsx`
- `packages/web/src/sse/hooks/useSSEConnection.ts`
- `packages/web/src/sse/hooks/useEventSSE.ts`
- `packages/web/src/sse/hooks/useGcalSSE.ts`
- `packages/web/src/sse/hooks/useSyncFocusRefresh.ts`
- `packages/web/src/common/hooks/useVisibleAfterHidden.ts`

Responsibilities:

- open/close `EventSource` to `GET /api/events/stream` based on auth state
- refetch events when background `eventsChanged` messages arrive
- refetch events/calendars when the native EventSource fires `open` again
  (reconnect after sleep) via `onStreamReopen`
- react to Google import/health via `syncStatusChanged` / `importCompleted`
- apply `userMetadataChanged` pushed on stream connect and when the backend refreshes metadata
- trigger a silent Google Calendar refresh on mount and after the tab was hidden
  for 30+ seconds (`useSyncFocusRefresh`, same path as the sidebar **Refresh
  calendar** CTA)

Runtime nuances:

- The SSE wire format uses one event name (`message`) whose `data.type` is a
  `ServerMessage` member. Prefer those type names (`eventsChanged`,
  `userMetadataChanged`, `syncStatusChanged`) over the retired uppercase
  signal names.
- `useGcalSSE` uses `userMetadataChanged` as the source of truth for sync
  metadata and Google connection status.
- auto-import is triggered only when `sync.importGCal === "RESTART"` and `google.connectionState` is neither `NOT_CONNECTED` nor `RECONNECT_REQUIRED`.
- On connect, backend may proactively send `syncStatusChanged` with
  `code: "GOOGLE_REVOKED"`; the client clears Google-origin events and falls
  back to local event storage until reconnect.
- Focus refresh is a no-op unless the connection is `HEALTHY` or `ATTENTION`.
  It passes `silent: true` so a transient failure does not toast. Manual
  refresh and focus refresh share one browser-wide coordinator.

## Google Connection UI Contract

Files:

- `packages/web/src/auth/google/hooks/useConnectGoogle/useConnectGoogle.ts`
- `packages/web/src/auth/google/hooks/useConnectGoogle/useConnectGoogle.util.ts`
- `packages/web/src/components/Sidebar/CalendarList/CalendarListHeader.tsx`

UI state comes from a server-enriched metadata field (`google.connectionState`)
plus optional Sync connection summary (`google.syncConnection`) and one
client-only state (`checking`). The sidebar account header is the one visible
home for Google status and actions: a polite live status line under the email,
an optional relative “Updated …” timestamp when healthy, and a CTA button when
an action is available. The email itself is identity text, not the action
control. The command palette deliberately does not show Google status or actions.

`getGoogleSyncStatus` / `getGoogleConnectionConfig` supply the status line and
CTA (prefer Sync connection vocabulary when a summary is present):

- `HEALTHY` / connection `healthy` → “Calendar connected” (no CTA)
- connection `catchingUp` (after a short quiet window) → “Syncing in the background…”
- `ATTENTION` / connection `delayed` → “Calendar updates are taking longer than usual…” / “Calendar updates are delayed” and **Refresh calendar**
- `IMPORTING` / early connection work → “Adding your calendar…” (no CTA)
- `RECONNECT_REQUIRED` → “Calendar needs reconnecting” and **Reconnect Google Calendar**
- `NOT_CONNECTED` → **Connect Google Calendar**
- `checking` → no status line

User-facing copy talks about the calendar and updates, not the Sync service or
internal states such as “repair” and “catching up.”

Important constraint:

- `connectionState` values are uppercase string literals shared with backend/core (`NOT_CONNECTED`, `RECONNECT_REQUIRED`, `IMPORTING`, `HEALTHY`, `ATTENTION`); lowercase variants will not match UI state guards.

Connect-later guardrail:

- In the password-session "connect Google" flow, `useConnectGoogle` flushes
  pending local events before beginning the Sync-owned OAuth redirect
  (`AuthApi.beginGoogleConnection(...)`).
- If local sync fails, connect is aborted and a toast is shown:
  `"We could not sync your local events. Your changes are still saved on this device."`
- This prevents IndexedDB-only Compass events from disappearing during the
  Google-triggered metadata/import refresh.

## What To Read Before Editing

- Auth/session issue: read session provider, user provider, router loaders.
- Event refresh issue: read the SSE hooks (which invalidate query scopes), the `useXEventsQuery` read hooks, `event.query.options.ts`, and `useEventMutations.ts` (which invalidates after settlement).
- Offline issue: read storage adapter and migration runner.
- Rendering issue in day/week: start at the route view, then its hooks.
