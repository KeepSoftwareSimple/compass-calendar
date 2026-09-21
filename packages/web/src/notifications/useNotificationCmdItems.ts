import { BellIcon } from "@phosphor-icons/react/dist/csr/Bell";
import { BellSlashIcon } from "@phosphor-icons/react/dist/csr/BellSlash";
import { type CommandItem } from "@web/components/CommandPalette/command-palette.types";
import { getNotificationPort } from "@web/notifications/notification.port";
import {
  notificationActions,
  useNotificationsEffectivelyOn,
} from "@web/notifications/notification.state";

/**
 * One toggle, labelled by the effective state. A grant revoked in browser
 * settings flips the label back to "Enable", and clicking then re-asks the
 * browser — which explains the block rather than silently doing nothing.
 */
export function useNotificationCmdItems(): CommandItem[] {
  const isOn = useNotificationsEffectivelyOn();

  // Nothing to offer where the API does not exist (older Safari, some
  // in-app browsers): hide the row rather than show a dead end.
  if (!getNotificationPort().isSupported()) return [];

  return [
    {
      id: "toggle-event-notifications",
      label: isOn
        ? "Disable event notifications"
        : "Enable event notifications",
      icon: isOn ? BellSlashIcon : BellIcon,
      keywords: ["notifications", "notify", "alert", "reminder", "upcoming"],
      onClick: () => {
        if (isOn) {
          notificationActions.disable("palette");
          return;
        }
        void notificationActions.enable("palette");
      },
    },
  ];
}
