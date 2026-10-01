import { type NotificationPort } from "@web/notifications/notification.port";

function eventIdFromTag(tag: string | undefined): string | undefined {
  const trimmed = tag?.trim();
  if (!trimmed) return undefined;
  const pipe = trimmed.indexOf("|");
  return pipe === -1 ? trimmed : trimmed.slice(0, pipe);
}

const bridge = () =>
  (window as Window & { compassDesktop?: Record<string, unknown> })
    .compassDesktop as
    | {
        notificationPermission?: NotificationPermission;
        showNotification?: (payload: {
          title: string;
          body?: string;
          tag?: string;
          eventId: string;
        }) => void;
        requestNotificationPermission?: () => Promise<NotificationPermission>;
        onNotificationPermissionChange?: (handler: () => void) => () => void;
      }
    | undefined;

const permission = (): NotificationPermission => {
  const value = bridge()?.notificationPermission;
  return value === "granted" || value === "denied" || value === "default"
    ? value
    : "default";
};

export const desktopNotificationPort: NotificationPort = {
  isSupported: () => typeof bridge()?.showNotification === "function",
  getPermission: permission,
  requestPermission: async () => {
    const request = bridge()?.requestNotificationPermission;
    if (!request) return "denied";
    const value = await request();
    return value === "granted" || value === "denied" || value === "default"
      ? value
      : permission();
  },
  show: (title, options = {}) => {
    const show = bridge()?.showNotification;
    const eventId = eventIdFromTag(options.tag);
    if (!show || permission() !== "granted" || !eventId) return false;
    try {
      show({ title, body: options.body, tag: options.tag, eventId });
      return true;
    } catch {
      return false;
    }
  },
  observePermission: (onChange) =>
    bridge()?.onNotificationPermissionChange?.(onChange) ?? (() => {}),
};
