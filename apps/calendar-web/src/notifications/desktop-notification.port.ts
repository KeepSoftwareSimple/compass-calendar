import { DesktopBridgeShowNotificationMessageSchema } from "@core/types/desktop-bridge.contracts";
import { isDesktop } from "@web/desktop/isDesktop";
import {
  type NotificationPort,
  type ShowNotificationOptions,
} from "@web/notifications/notification.port";

type DesktopNotificationPermission = NotificationPermission;

let cachedPermission: DesktopNotificationPermission = "default";

const hasDesktopNotificationBridge = (): boolean =>
  typeof window.compassDesktop?.showNotification === "function" &&
  typeof window.compassDesktop?.requestNotificationPermission === "function";

export function createDesktopNotificationPort(): NotificationPort {
  return {
    isSupported: () => isDesktop() && hasDesktopNotificationBridge(),

    getPermission: () => cachedPermission,

    requestPermission: async () => {
      const bridge = window.compassDesktop;
      if (!bridge?.requestNotificationPermission) return "denied";
      const status = await bridge.requestNotificationPermission();
      cachedPermission =
        status === "granted" || status === "denied" || status === "default"
          ? status
          : "denied";
      return cachedPermission;
    },

    show: (title, options: ShowNotificationOptions = {}) => {
      const bridge = window.compassDesktop;
      if (!bridge?.showNotification || cachedPermission !== "granted") {
        return false;
      }
      const eventId = options.eventId?.trim();
      if (!eventId) return false;
      const payload = DesktopBridgeShowNotificationMessageSchema.safeParse({
        method: "showNotification",
        title,
        body: options.body,
        tag: options.tag,
        eventId,
      });
      if (!payload.success) return false;
      bridge.showNotification({
        title: payload.data.title,
        body: payload.data.body,
        tag: payload.data.tag,
        eventId: payload.data.eventId,
      });
      return true;
    },

    observePermission: () => () => {},
  };
}
