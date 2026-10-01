import "@web/desktop/compass-desktop.global";
import { type NotificationPort } from "@web/notifications/notification.port";

function eventIdFromTag(tag: string | undefined): string | undefined {
  const trimmed = tag?.trim();
  if (!trimmed) return undefined;
  const pipe = trimmed.indexOf("|");
  return pipe === -1 ? trimmed : trimmed.slice(0, pipe);
}

const bridge = () => window.compassDesktop;

/** The shell can only report the three browser permission states. */
function normalizePermission(
  value: unknown,
  fallback: NotificationPermission = "default",
): NotificationPermission {
  return value === "granted" || value === "denied" || value === "default"
    ? value
    : fallback;
}

const permission = (): NotificationPermission =>
  normalizePermission(bridge()?.notificationPermission);

export const desktopNotificationPort: NotificationPort = {
  isSupported: () => typeof bridge()?.showNotification === "function",
  getPermission: permission,
  requestPermission: async () => {
    const request = bridge()?.requestNotificationPermission;
    if (!request) return "denied";
    return normalizePermission(await request(), permission());
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
