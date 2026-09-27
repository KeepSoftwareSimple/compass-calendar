import { type FC } from "react";
import { type Calendar } from "@core/types/calendar.contracts";
import { type SyncConnectionSummary } from "@core/types/user.types";
import { ConnectProviderChooser } from "@web/auth/providers/ConnectProviderChooser";
import { CALENDAR_HOST_EXPLAINER } from "@web/auth/providers/provider-copy.util";
import { useDisconnectGoogleAccount } from "@web/auth/providers/useDisconnectAccount";
import {
  accountKey,
  calendarAccount,
  connectionAccount,
} from "@web/calendars/calendar.util";
import { OverlayPanelActions } from "@web/components/OverlayPanel/OverlayPanel";
import { AccountRow } from "@web/components/Settings/AccountRow";
import { settingsShortcutAttrs } from "@web/settings/useSettingsShortcuts";

interface AccountsSectionProps {
  confirmingId: string | null;
  connections: SyncConnectionSummary[];
  resolvedDefault: Calendar | undefined;
  setConfirmingId: (id: string | null) => void;
  showShortcuts: boolean;
}

export const AccountsSection: FC<AccountsSectionProps> = ({
  confirmingId,
  connections,
  resolvedDefault,
  setConfirmingId,
  showShortcuts,
}) => {
  const { disconnect, disconnectingId } = useDisconnectGoogleAccount();
  const defaultAccount = resolvedDefault && calendarAccount(resolvedDefault);
  const defaultKey = defaultAccount && accountKey(defaultAccount);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3">
        {connections.length === 0 ? (
          <p className="text-sm text-text-muted">No accounts connected yet.</p>
        ) : (
          connections.map((connection) => {
            const account = connectionAccount(connection);
            return (
              <AccountRow
                connection={connection}
                disconnect={disconnect}
                isConfirming={confirmingId === connection.id}
                isDefault={
                  account !== undefined && accountKey(account) === defaultKey
                }
                isDisconnecting={disconnectingId === connection.id}
                key={connection.id}
                setConfirming={(confirming) =>
                  setConfirmingId(confirming ? connection.id : null)
                }
              />
            );
          })
        )}
      </div>

      <OverlayPanelActions align="start">
        <ConnectProviderChooser
          idleLabel="Add account"
          newAccount
          showShortcut={showShortcuts}
          shortcut="A"
          shortcutAttrs={settingsShortcutAttrs("add-account")}
          variant="overlay-primary"
        />
      </OverlayPanelActions>
      <p className="text-text-muted text-xs">{CALENDAR_HOST_EXPLAINER}</p>
    </div>
  );
};
