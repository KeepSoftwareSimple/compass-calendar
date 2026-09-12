import { type CalendarId } from "@core/types/domain-primitives";

/**
 * Add discovered calendars to a booking page's blockers unless the host
 * already opted them out. Discovery only adds; it never removes a blocker
 * the host still has selected.
 */
export function mergeDiscoveredBlockingCalendarIds(input: {
  readonly current: readonly CalendarId[];
  readonly optedOut: readonly CalendarId[];
  readonly discovered: readonly CalendarId[];
}): CalendarId[] {
  const optedOut = new Set(input.optedOut);
  const next = [...input.current];
  const seen = new Set(input.current);
  for (const calendarId of input.discovered) {
    if (optedOut.has(calendarId) || seen.has(calendarId)) continue;
    seen.add(calendarId);
    next.push(calendarId);
  }
  return next;
}

/**
 * Persist a host's blocker opt-outs: every eligible calendar they did not
 * submit, plus any earlier opt-out they have not added back.
 */
export function nextOptedOutBlockingCalendarIds(input: {
  readonly previousOptedOut: readonly CalendarId[];
  readonly eligible: readonly CalendarId[];
  readonly submitted: readonly CalendarId[];
}): CalendarId[] {
  const submitted = new Set(input.submitted);
  const next: CalendarId[] = [];
  const seen = new Set<CalendarId>();
  for (const calendarId of [...input.previousOptedOut, ...input.eligible]) {
    if (submitted.has(calendarId) || seen.has(calendarId)) continue;
    seen.add(calendarId);
    next.push(calendarId);
  }
  return next;
}
