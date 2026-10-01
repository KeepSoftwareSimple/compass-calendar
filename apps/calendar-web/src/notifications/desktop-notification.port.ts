import "@web/desktop/compass-desktop.global";
import { isDesktop } from "@web/desktop/isDesktop";
import {
  type NotificationPort,
  type ShowNotificationOptions,
} from "@web/notifications/notification.port";

const readBridgePermission = (): NotificationPermission => {
  const permission = window.compassDesktop?.notificationPermission;
  if (
    permission === "granted" ||
    permission === "denied" ||
    permission === "default"
  ) {
    return permission;
  }
  return "default";
};

const desktopNotificationPort: NotificationPort = {
  isSupported: () => isDesktop() && !!window.compassDesktop?.showNotification,

  getPermission: readBridgePermission,

  requestPermission: async () => {
    const bridge = window.compassDesktop;
    if (!bridge?.requestNotificationPermission) {
      return "denied";
    }
    const permission = await bridge.requestNotificationPermission();
    if (
      permission === "granted" ||
      permission === "denied" ||
      permission === "default"
    ) {
      return permission;
    }
    return readBridgePermission();
  },

  show: (title, options: ShowNotificationOptions = {}) => {
    const bridge = window.compassDesktop;
    if (!bridge?.showNotification || readBridgePermission() !== "granted") {
      return false;
    }
    const eventId = options.eventId?.trim();
    if (!eventId) {
      return false;
    }
    try {
      bridge.showNotification({
        title,
        body: options.body,
        tag: options.tag,
        eventId,
      });
      return true;
    } catch {
      return false;
    }
  },

  observePermission: (onChange) => {
    const bridge = window.compassDesktop;
    if (!bridge?.onNotificationPermissionChange) {
      return () => {};
    }
    return bridge.onNotificationPermissionChange(onChange);
  },
};

export function createDesktopNotificationPort(): NotificationPort {
  return desktopNotificationPort;
}
