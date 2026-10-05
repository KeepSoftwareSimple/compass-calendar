import { type FC, useEffect } from "react";
import { buildDesktopOAuthRelayUrl } from "@core/desktop/desktop-oauth-state.util";
import { type ProviderKind } from "@core/types/sync/identity.contracts";
import { openDesktopOAuthRelay } from "@web/auth/callback/desktop-oauth-callback-relay";
import {
  OverlayPanel,
  OverlayPanelActionButton,
  OverlayPanelActions,
} from "@web/components/OverlayPanel/OverlayPanel";

type Props = {
  provider: ProviderKind;
  search: string;
};

/**
 * Shown in the default browser when a desktop OAuth flow returns to the web
 * callback. The deep link opens Compass; the button is the manual fallback.
 */
export const DesktopOAuthCallbackRelay: FC<Props> = ({ provider, search }) => {
  const relayUrl = buildDesktopOAuthRelayUrl(provider, search);

  useEffect(() => {
    openDesktopOAuthRelay(relayUrl);
  }, [relayUrl]);

  return (
    <OverlayPanel
      title="Open Compass to finish signing in"
      message="Your browser completed the provider step. Compass will finish connecting your account."
      role="status"
      variant="status"
    >
      <OverlayPanelActions align="start">
        <OverlayPanelActionButton
          variant="primary"
          onClick={() => openDesktopOAuthRelay(relayUrl)}
        >
          Open Compass
        </OverlayPanelActionButton>
      </OverlayPanelActions>
    </OverlayPanel>
  );
};
