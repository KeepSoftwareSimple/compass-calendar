export const EMPTY_HIDDEN_EVENT_IDS: ReadonlySet<string> = Object.freeze(
  new Set<string>(),
);

export function isEventIdHidden(
  eventId: string | undefined,
  hiddenEventIds: ReadonlySet<string>,
): boolean {
  return Boolean(eventId && hiddenEventIds.has(eventId));
}
