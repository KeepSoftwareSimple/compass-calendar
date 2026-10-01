import {
  type ProviderKind,
  ProviderKindSchema,
} from "@core/types/sync/identity.contracts";

/**
 * Custom URL scheme the macOS shell registers. Every `compass://` link the
 * shell hands the web view is built and parsed here, so the scheme and its
 * path shapes live in one place instead of being spelled out at each site.
 */
const DESKTOP_DEEP_LINK_SCHEME = "compass://";

const AUTH_CALLBACK_PATTERN =
  /^compass:\/\/auth\/(?<provider>[^/?#]+)\/callback(?<query>\?.*)?$/;

const EVENT_DEEP_LINK_PREFIX = `${DESKTOP_DEEP_LINK_SCHEME}event/`;

export function buildDesktopOAuthRelayUrl(
  provider: ProviderKind,
  search: string,
): string {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const base = `${DESKTOP_DEEP_LINK_SCHEME}auth/${provider}/callback`;
  return query.length > 0 ? `${base}?${query}` : base;
}

/**
 * Inverse of {@link buildDesktopOAuthRelayUrl}. The provider segment is matched
 * loosely and validated by {@link ProviderKindSchema}, so adding a provider to
 * the schema is the only edit a new callback link needs.
 */
export function parseDesktopAuthDeepLink(
  url: string,
): { provider: ProviderKind; query: string } | null {
  const match = AUTH_CALLBACK_PATTERN.exec(url);
  if (!match) return null;
  const provider = ProviderKindSchema.safeParse(match.groups?.["provider"]);
  if (!provider.success) return null;
  return {
    provider: provider.data,
    query: match.groups?.["query"] ?? "",
  };
}

/**
 * Reads the event id out of the link `CompassNotificationCenter` sends when a
 * native notification is tapped. Null for any other `compass://` link.
 */
export function parseDesktopEventDeepLink(url: string): string | null {
  if (!url.startsWith(EVENT_DEEP_LINK_PREFIX)) return null;
  const eventId = url.slice(EVENT_DEEP_LINK_PREFIX.length).trim();
  return eventId.length > 0 ? eventId : null;
}
