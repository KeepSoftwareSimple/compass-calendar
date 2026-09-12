import { type CalendarId } from "@core/types/domain-primitives";

const sameCalendarIdSet = (
  left: readonly CalendarId[],
  right: readonly CalendarId[],
): boolean => {
  if (left.length !== right.length) return false;
  const rightIds = new Set(right);
  return left.every((calendarId) => rightIds.has(calendarId));
};

const appendUniqueIds = (
  start: readonly CalendarId[],
  candidates: readonly CalendarId[],
  skip: ReadonlySet<CalendarId>,
): CalendarId[] => {
  const next = [...start];
  const seen = new Set(start);
  for (const calendarId of candidates) {
    if (skip.has(calendarId) || seen.has(calendarId)) continue;
    seen.add(calendarId);
    next.push(calendarId);
  }
  return next;
};

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
  return appendUniqueIds(
    input.current,
    input.discovered,
    new Set(input.optedOut),
  );
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
  return appendUniqueIds(
    [],
    [...input.previousOptedOut, ...input.eligible],
    new Set(input.submitted),
  );
}

/**
 * Apply discovery to a page-shaped object. Returns the same reference when
 * the blocker set is already complete so callers can skip a write or a
 * React state update.
 */
export function withDiscoveredBlockingCalendarIds<
  T extends { readonly blockingCalendarIds: readonly CalendarId[] },
>(
  page: T,
  optedOut: readonly CalendarId[],
  discovered: readonly CalendarId[],
): T {
  const blockingCalendarIds = mergeDiscoveredBlockingCalendarIds({
    current: page.blockingCalendarIds,
    optedOut,
    discovered,
  });
  if (sameCalendarIdSet(blockingCalendarIds, page.blockingCalendarIds)) {
    return page;
  }
  return { ...page, blockingCalendarIds };
}
