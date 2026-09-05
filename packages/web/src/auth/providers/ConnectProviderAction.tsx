import { type FC } from "react";
import { type ProviderKind } from "@core/types/sync/identity.contracts";
import { useConnectProvider } from "@web/auth/providers/useConnectProvider";
import { OverlayPanelActionButton } from "@web/components/OverlayPanel/OverlayPanel";
import { settingsShortcutAttrs } from "@web/settings/useSettingsShortcuts";

const SIDEBAR_BUTTON_CLASSNAME =
  "c-button-compact c-button-primary w-full rounded-xs px-2 py-1.5 text-left text-xs";

interface ConnectProviderActionProps {
  connectingLabel: string;
  idleLabel: string;
  kind: ProviderKind;
  newAccount?: boolean;
  shortcut?: string;
  shortcutAttr?: boolean;
  showShortcut?: boolean;
  variant: "settings" | "sidebar";
}

export const ConnectProviderAction: FC<ConnectProviderActionProps> = ({
  connectingLabel,
  idleLabel,
  kind,
  newAccount,
  shortcut,
  shortcutAttr = false,
  showShortcut,
  variant,
}) => {
  const { connect, isConnecting } = useConnectProvider(kind, { newAccount });
  const label = isConnecting ? connectingLabel : idleLabel;

  if (variant === "settings") {
    return (
      <OverlayPanelActionButton
        aria-busy={isConnecting || undefined}
        disabled={isConnecting}
        onClick={connect}
        shortcut={shortcut}
        showShortcut={showShortcut}
        variant="primary"
        {...(shortcutAttr ? settingsShortcutAttrs("add-account") : {})}
      >
        {label}
      </OverlayPanelActionButton>
    );
  }

  return (
    <button
      aria-busy={isConnecting || undefined}
      className={SIDEBAR_BUTTON_CLASSNAME}
      disabled={isConnecting}
      onClick={connect}
      type="button"
    >
      {label}
    </button>
  );
};
