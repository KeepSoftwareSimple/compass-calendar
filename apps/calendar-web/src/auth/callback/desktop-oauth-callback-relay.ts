import { hasDesktopOAuthStateMarker } from "@core/desktop/desktop-oauth-state.util";

export function shouldRelayDesktopOAuthCallback(
  state: string | null,
  inDesktopShell: boolean,
): boolean {
  if (!state || inDesktopShell) {
    return false;
  }

  return hasDesktopOAuthStateMarker(state);
}

/** Browser callback should open Compass when sync or Apple marked `desktop=1`. */
export function shouldRelayDesktopConnectRedirect(
  search: string,
  inDesktopShell: boolean,
): boolean {
  return searchHasDesktopRelayFlag(search, inDesktopShell);
}

/** Same `desktop=1` relay rule as calendar connect; Apple uses a base64 state blob. */
export const shouldRelayDesktopAppleOAuthCallback =
  shouldRelayDesktopConnectRedirect;

function searchHasDesktopRelayFlag(
  search: string,
  inDesktopShell: boolean,
): boolean {
  if (inDesktopShell) {
    return false;
  }
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  return params.get("desktop") === "1";
}

export function openDesktopOAuthRelay(relayUrl: string): void {
  window.location.assign(relayUrl);
}
