/** Prefix on OAuth state when authorization started inside Compass Desktop. */
export const DESKTOP_OAUTH_STATE_PREFIX = "compass-desktop:";

export function buildOAuthStateForClient(isDesktopClient: boolean): string {
  const id = crypto.randomUUID();
  return isDesktopClient ? `${DESKTOP_OAUTH_STATE_PREFIX}${id}` : id;
}

export function hasDesktopOAuthStateMarker(state: string): boolean {
  return state.startsWith(DESKTOP_OAUTH_STATE_PREFIX);
}
