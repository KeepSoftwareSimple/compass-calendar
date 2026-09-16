# Responsive Layout

How the app adapts to window width: panel auto-collapse and the week grid's
shrinking day window.

## Panel Auto-Collapse

Files:

- `packages/web/src/components/AuthenticatedLayout/useResponsiveLayout.ts` (mounted once in the
  authenticated layout)
- `packages/web/src/components/AuthenticatedLayout/responsive.constants.ts`

Breakpoints:

- `SIDEBAR_AUTO_COLLAPSE_BREAKPOINT` = 1280px (Tailwind `xl`)

The hook only reacts to `matchMedia` `change` events — a breakpoint crossing,
not a continuous width readout. This means a manual toggle (`]` for the
sidebar) sticks until the next crossing; it does not get silently re-opened
or re-closed by unrelated re-renders.

## Week Grid Day Window

The week view renders a *window* of 1–7 day columns, not always the full
week. Two pieces derive that window from the measured grid width:

- `packages/web/src/views/Week/hooks/grid/useVisibleDayCount.ts` — a
  `ResizeObserver` on the grid track computes `visibleDayCount` via
  `computeVisibleDayCount(trackWidth, marginLeft)`
  (`packages/web/src/views/Week/util/week-window.util.ts`). The hour-label
  gutter is subtracted so a second time-travel column does not change how
  many days fit. Defaults to the full week (`WEEK_DAY_COUNT = 7`) until a
  real measurement lands — jsdom never measures, so tests default to a full
  week unless they explicitly mock the observer.
- `packages/web/src/views/Week/hooks/useWeek.ts` — holds a single **anchor
  date** in the URL (not `useState`, so a refresh restores the same week),
  memoized on the date *string* rather than the `Dayjs` instance (`today` is a
  fresh `Dayjs` every render; memoizing on the instance would re-derive
  `start`/`end` — and re-fire dependent effects — on every render). `start`,
  `end`, and `windowOffset` (`computeVisibleWindowOffset`, which centers the
  window on the anchor and clamps to the week's boundaries) all derive from
  the anchor plus the current `visibleDayCount`. A day-count change therefore
  needs no extra state — the window just re-centers on the same anchor.

Paging (`incrementWeek`/`decrementWeek`, both thin wrappers around
`pageWindow`) is two different moves depending on position: within the
current week it shifts `windowOffset` by `visibleDayCount`, clamped to the
week's boundaries; at the boundary it instead crosses into the adjacent
week, entering from that week's near side (offset `0` going forward, or the
max offset going back). Neither branch is a flat ±7-day jump —
`anchorDateForWindowOffset` re-derives the anchor from whichever
`weekStart`/`windowOffset` pair the branch computed.

## Memo Comparator Trap

`GridTimedEventMemo` (`packages/web/src/grid/components/GridTimedEvent.tsx`) and
`GridAllDayEventMemo` (`packages/web/src/grid/components/GridAllDayEvent.tsx`) skip re-render unless
their custom comparator says something relevant changed. Both comparators
must include `weekDays` (or `weekProps.component.weekDays`) in that
comparison. If a future edit drops it: the day window can move (paging,
resize-driven `visibleDayCount` change) without any event's own data or
measurements changing, and events silently keep rendering at their *previous*
window position instead of the new one.

## Mobile Gate

Below-desktop-width behavior above is distinct from mobile-OS gating —
`isMobileOS()` blocks phones/tablets entirely (see
[Frontend Runtime Flow](./frontend-runtime-flow.md#root-view-responsibilities)).
`useIsMobile` (768px) is unrelated to this window-width system; it is used
only by LifeView layout.

Related: [Week Drag Interaction](./week-drag-interaction.md) — the drag
geometry model that reads the same `weekDays` window this doc describes.
