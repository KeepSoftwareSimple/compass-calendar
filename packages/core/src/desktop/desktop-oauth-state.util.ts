import {
  type ProviderKind,
  ProviderKindSchema,
} from "@core/types/sync/identity.contracts";

/**
 * OAuth state marker and `compass://` link shapes for Compass Desktop. The
 * scheme, the links the macOS shell hands the web view, and the state prefix
 * that routes a browser callback back into one all live here, so no call site
 * spells out a path or a provider list of its own.
 *
 * Kept as one module on purpose: splitting it adds a boot chunk, and
 * `apps/calendar-web/boot-size-budget.json` counts them.
 */

/** Prefix on OAuth state when authorization started inside Compass Desktop. */
export const DESKTOP_OAUTH_STATE_PREFIX = "compass-desktop:";

const DESKTOP_DEEP_LINK_SCHEME = "compass://";

const DESKTOP_AUTH_CALLBACK_PATTERN =
  /^compass:\/\/auth\/(?<provider>[^/?#]+)\/callback(?<query>\?.*)?$/;

const DESKTOP_EVENT_LINK_PREFIX = `${DESKTOP_DEEP_LINK_SCHEME}event/`;

export function buildOAuthStateForClient(isDesktopClient: boolean): string {
  const id = crypto.randomUUID();
  return isDesktopClient ? `${DESKTOP_OAUTH_STATE_PREFIX}${id}` : id;
}

export function hasDesktopOAuthStateMarker(state: string): boolean {
  return state.startsWith(DESKTOP_OAUTH_STATE_PREFIX);
}

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
  const match = DESKTOP_AUTH_CALLBACK_PATTERN.exec(url);
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
  if (!url.startsWith(DESKTOP_EVENT_LINK_PREFIX)) return null;
  const eventId = url.slice(DESKTOP_EVENT_LINK_PREFIX.length).trim();
  return eventId.length > 0 ? eventId : null;
}
