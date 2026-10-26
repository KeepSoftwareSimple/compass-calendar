export const EMPTY_HIDDEN_EVENT_IDS: ReadonlySet<string> = Object.freeze(
  new Set<string>(),
);

export function isEventIdHidden(
  eventId: string | undefined,
  hiddenEventIds: ReadonlySet<string>,
): boolean {
  return Boolean(eventId && hiddenEventIds.has(eventId));
}

/** Drop one id so a hidden draft still participates in layout. */
export function withoutHiddenEventId(
  hiddenEventIds: ReadonlySet<string>,
  eventId: string | undefined,
): ReadonlySet<string> {
  if (!eventId || !hiddenEventIds.has(eventId)) {
    return hiddenEventIds;
  }
  const next = new Set(hiddenEventIds);
  next.delete(eventId);
  return next;
}
