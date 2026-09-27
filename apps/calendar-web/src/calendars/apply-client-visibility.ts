import { type Calendar } from "@core/types/calendar.contracts";

// Overlay client-owned visibility onto a server calendar list. Server
// isVisible is ignored: under sync delegation it is always true, and under
// legacy the Mongo field is no longer written by the web toggle (A2). Takes
// the hidden id set as a parameter (rather than reading storage itself) so
// it stays a pure function of the calendars query's `select` - see
// calendar-visibility.store.ts for where the set comes from and how it stays
// reactive.
export function applyClientVisibility(
  calendars: Calendar[],
  hidden: ReadonlySet<string>,
): Calendar[] {
  return calendars.map((calendar) => ({
    ...calendar,
    isVisible: !hidden.has(calendar.id),
  }));
}
