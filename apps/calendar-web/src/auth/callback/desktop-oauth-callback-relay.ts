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

export function relayDesktopOAuthCallback(
  provider: ProviderKind,
  search: string,
): string {
  return buildDesktopOAuthRelayUrl(provider, search);
}

export function openDesktopOAuthRelay(relayUrl: string): void {
  window.location.assign(relayUrl);
}
