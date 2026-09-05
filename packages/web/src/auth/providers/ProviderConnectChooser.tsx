import { type FC } from "react";
import { providerDisplayName } from "@core/types/sync/identity.contracts";
import { ConnectProviderAction } from "@web/auth/providers/ConnectProviderAction";
import {
  CONNECT_CALENDAR_LABEL,
  openingProviderCopy,
} from "@web/auth/providers/provider-copy.util";
import { useConnectableProviders } from "@web/auth/providers/useIsProviderAvailable";
import { OverlayPanelActions } from "@web/components/OverlayPanel/OverlayPanel";

interface ProviderConnectChooserProps {
  showShortcuts?: boolean;
  variant: "settings" | "sidebar";
}

export const ProviderConnectChooser: FC<ProviderConnectChooserProps> = ({
  showShortcuts = false,
  variant,
}) => {
  const connectable = useConnectableProviders();
  if (connectable.length === 0) return null;

  if (variant === "settings") {
    const single = connectable.length === 1;
    return (
      <OverlayPanelActions align="start">
        {connectable.map((kind, index) => (
          <ConnectProviderAction
            connectingLabel={openingProviderCopy(kind)}
            idleLabel={single ? "Add account" : providerDisplayName(kind)}
            key={kind}
            kind={kind}
            newAccount
            shortcut={index === 0 ? "A" : undefined}
            shortcutAttr={index === 0}
            showShortcut={showShortcuts && index === 0}
            variant="settings"
          />
        ))}
      </OverlayPanelActions>
    );
  }

  return (
    <div className="mb-2 flex flex-col gap-1.5">
      {connectable.map((kind) => (
        <ConnectProviderAction
          connectingLabel="Connecting…"
          idleLabel={CONNECT_CALENDAR_LABEL[kind]}
          key={kind}
          kind={kind}
          newAccount
          variant="sidebar"
        />
      ))}
    </div>
  );
};
