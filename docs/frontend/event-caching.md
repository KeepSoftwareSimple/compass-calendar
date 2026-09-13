# Event Caching

How Compass caches events.

## The one-sentence model

**TanStack Query is the cache and the single owner of persisted events.** Each
cache entry holds one *window* of events — a `(source, scope, date range)` slice —
stored in a normalized `{ ids, entities }` shape. Views render from these entries;
mutations edit them optimistically and then let the server reconcile.

The Zustand stores do **not** hold persisted events (only transient drafts/interaction). See
[State Systems](./frontend-runtime-flow.md#state-systems).

## Cache-key anatomy

Every event cache entry is keyed by three parts (`event.query.keys.ts`):

```
["events", scope, { source, startDate, endDate }]
             │              │
             │              └─ "local" (IndexedDB) or "remote" (API)
             └─ "day" | "week"
```

```
QueryClient cache
├─ ["events","week",   {source:"local",  2026-07-01 … 07-08}] → { ids:[…], entities:{…} }
├─ ["events","day",    {source:"local",  2026-07-03 … 07-04}] → { ids:[…], entities:{…} }
```

Two consequences fall straight out of the key:

- **Source is part of the key**, so `local` and `remote` events never collide.
  A mutation reads and writes only its captured source (no cross-source drift).
- **Range is part of the key**, so navigating to a new week fetches; navigating
  back to a recent one renders instantly from cache (within `staleTime`, 2 min).

## Reads: view → cache → screen

```
useWeekEventsQuery(range)
   │  key = ["events","week",{ source, range }]
   ▼
TanStack Query ── cache hit? ──► return cached { ids, entities }
   │ miss / stale
   ▼
fetchWeekEvents → repository.get(source) → filter to range → normalize → cache
   │
   ▼
deriveCalendarEventViewModel(query.data)   // pure; memoized on the data reference
   ▼
timedEvents / allDayEvents / rowCount → components
```

- The active **source** comes from `event.repository.source.store.ts` (local vs
  remote — see [Repository Selection](./frontend-runtime-flow.md#repository-selection)).
- The view model is derived by a pure function memoized on the `query.data`
  reference, so all consumers of a week's data share one computation.

### Multi-day timed events in the all-day row

Timed events that cross midnight are **not** cloned into per-day timed segments.
`deriveCalendarEventViewModel` promotes them into `allDayEvents` with
`isTimedMultiDayDisplay: true` (Google-style span bars).

- Detection / date mapping: `isTimedEventMultiDay`, `timedMultiDayToAllDayDates`
  in `packages/web/src/common/utils/event/event-nudge.util.ts`
- Promotion: `packages/web/src/events/queries/event.view-model.ts`
- Span coverage is half-open `[start, end)`: an end exactly at midnight does
  **not** include that calendar day
- Those bars are read-only on the grid (no timed drag/resize); edit via the form

## Writes: optimistic, then reconcile

Mutations go through the narrow `EventMutations` interface
(`useEventMutations.ts`). Each one follows the same lifecycle:

```
mutate(payload)
   │
   ├─ onMutate:   cancel in-flight reads
   │              → snapshot matching cache entries
   │              → apply optimistic edit to matching cache entries   (instant UI)
   │
   ├─ mutationFn: persist via repository (captured source)
   │
   ├─ onError:    report the error (toast)
   │              → restore snapshot when no other event mutation is pending
   │
   └─ onSettled:  once NO event mutation remains in flight (checked on a
                  deferred macrotask), invalidate ["events"] → refetch to
                  get canonical data
```

- **Optimistic edits** insert/patch/remove events across exactly the entries they
  belong to, so a created or dragged-in event shows immediately — before the
  server responds.
- **Conditional rollback on failure.** Each mutation snapshots matching cache
  entries in `onMutate`. On error it reports a toast and restores that snapshot
  when it is alone in flight; if other mutations are pending for a *different*
  write key it restores only this key's entities; if another mutation shares the
  same key it leaves the newer optimistic write alone. Settle-time invalidation
  still converges to server truth once no event mutation remains in flight.
  Invalidation is deferred to a macrotask and gated on
  `queryClient.isMutating(...) === 0` so a refetch never overwrites another
  mutation's live optimistic update (the TanStack Query recipe for concurrent
  optimistic updates, deferred so simultaneous settles cannot all skip).
- **Writes racing their own create wait.** Editing or deleting a just-created
  event defers its repository call via `waitForPendingEventCreate` until the
  create settles: the id doesn't exist server-side before then, and a skipped
  delete would resurrect the event once the create landed. When the create
  fails, the dependent write is skipped entirely.
- **Pending state** is derived from TanStack Query's mutation state via
  `usePendingEventIds`, not stored separately. It never blocks interaction; its
  only UI is the sync shimmer on the account email in `CalendarListHeader`.

## One membership rule for reads and writes

Reads and optimistic writes must agree on "does this event belong in this
window", or an edit could render in a spot a refetch would disagree with. Both
sides call the **same** predicate:

- `eventMatchesRange` (`event.query.normalize.ts`) — timed events by containment,
  all-day by overlap. Used by the read filter *and* by `eventBelongsToEntry`
  (`event.query.cache.ts`), which layers on the source + scope check for writes.

## What refreshes the cache

- **Mutations** — invalidate `["events"]` on settle (see above).
- **SSE** — background `eventsChanged` invalidates the
  relevant scope so it refetches. `useEventSSE` coalesces per message type:
  the first message in a quiet period refetches at once, and anything that
  lands inside the next 5s collapses into one trailing refetch, so a burst of
  Sync pull invalidations does not become a refetch storm (#3694). Native EventSource reconnect (`open`) and
  window focus also invalidate/refetch so a laptop-sleep gap is not silent.
  Separately, `useSyncFocusRefresh` asks Sync for a silent calendar catch-up
  after mount / long hide — that complements cache invalidation; it does not
  replace it. See [SSE Runtime](./frontend-runtime-flow.md#sse-runtime).
- **Auth / source transitions** — refresh the repository source store and drop
  stale entries (e.g. Google revoked → fall back to `local`).

## Navigation: placeholder data + prefetch

Two TanStack features make week navigation feel instant:

- **Stable fetch window.** `useWeek` always reads events for a 7-day window
  from the anchor (`weekProps.query`), while the visible columns still clip
  to `weekProps.component`. Resize-driven column changes no longer re-key the
  query, so cached data survives layout changes.

- **Overlap-based placeholder data.** `useWeekEventsQuery` supplies
  `placeholderData` from `deriveOverlappingEventQueryData`, merging events
  from any cached week entries whose stored range overlaps the requested
  range. Shift+J/K can render overlapping events immediately while the
  background fetch completes.

- **Adjacent prefetch.** The previous and next paged windows are prefetched
  as soon as the current one renders (`usePrefetchAdjacentEvents`, wired into
  `useWeek`/`useDayEvents`). It calls `queryClient.prefetchQuery` with the
  *same* options builder and date formatting the real read hook uses, so the
  warmed entry lands under the exact key a subsequent read looks up.
  `prefetchQuery` is a no-op for entries that are already cached and fresh,
  so this adds no extra fetches on repeat renders of the same range — only
  the next click resolves from cache instead of paying a fetch.

## What the cache is *not*

- **Not client stores.** The draft Zustand store owns only the in-progress
  draft and calendar interaction state (`draft.store.ts`). Do not mirror
  persisted events into client stores.
- **Not IndexedDB directly.** IndexedDB is the *offline store behind the `local`
  repository*; components never touch it — they read through the query cache.

## Testing note

Tests seed the query cache directly (there is no store→query bridge): pass an
`events` array to the render/store harnesses, which calls `seedEventQueries`
(`__tests__/utils/event-query-test-data.ts`). See the
[Testing Playbook](../development/testing-playbook.md).
