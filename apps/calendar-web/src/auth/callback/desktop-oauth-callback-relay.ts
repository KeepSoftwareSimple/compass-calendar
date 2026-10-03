import {
  buildDesktopOAuthRelayUrl,
  hasDesktopOAuthStateMarker,
} from "@core/desktop/desktop-oauth-state.util";
import { type ProviderKind } from "@core/types/sync/identity.contracts";

export function shouldRelayDesktopOAuthCallback(
  state: string | null,
  inDesktopShell: boolean,
): boolean {
  if (!state || inDesktopShell) {
    return false;
  }

  return hasDesktopOAuthStateMarker(state);
}

/** Apple Sign in uses a base64 state blob; native marks the SPA callback with `desktop=1`. */
export function shouldRelayDesktopAppleOAuthCallback(
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

export function relayDesktopOAuthCallback(
  provider: ProviderKind,
  search: string,
): string {
  return buildDesktopOAuthRelayUrl(provider, search);
}

export function openDesktopOAuthRelay(relayUrl: string): void {
  window.location.assign(relayUrl);
}
