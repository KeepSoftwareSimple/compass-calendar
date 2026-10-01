import {
  type ProviderKind,
  ProviderKindSchema,
} from "@core/types/sync/identity.contracts";

/** Prefix on OAuth state when authorization started inside Compass Desktop. */
export const DESKTOP_OAUTH_STATE_PREFIX = "compass-desktop:";

const DESKTOP_AUTH_CALLBACK_PATTERN =
  /^compass:\/\/auth\/(?<provider>google|microsoft|apple)\/callback(?<query>\?.*)?$/;

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
  return query.length > 0
    ? `compass://auth/${provider}/callback?${query}`
    : `compass://auth/${provider}/callback`;
}

/** Inverse of {@link buildDesktopOAuthRelayUrl} for compass:// deep links. */
export function parseDesktopAuthDeepLink(
  url: string,
): { provider: ProviderKind; query: string } | null {
  const match = DESKTOP_AUTH_CALLBACK_PATTERN.exec(url);
  const provider = ProviderKindSchema.safeParse(match?.groups?.["provider"]);
  if (!provider.success) return null;
  return {
    provider: provider.data,
    query: match?.groups?.["query"] ?? "",
  };
}
