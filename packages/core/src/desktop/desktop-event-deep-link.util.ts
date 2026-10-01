const DESKTOP_EVENT_DEEP_LINK_PATTERN =
  /^compass:\/\/event\/(?<eventId>[^/?#]+)$/;

/** Parses compass://event/<id> deep links from the macOS shell. */
export function parseDesktopEventDeepLink(
  url: string,
): { eventId: string } | null {
  const match = DESKTOP_EVENT_DEEP_LINK_PATTERN.exec(url);
  const rawEventId = match?.groups?.["eventId"];
  if (!rawEventId) return null;
  try {
    return { eventId: decodeURIComponent(rawEventId) };
  } catch {
    return null;
  }
}

/** Builds the deep link the macOS shell sends when a notification is tapped. */
export function buildDesktopEventDeepLink(eventId: string): string {
  return `compass://event/${encodeURIComponent(eventId)}`;
}
