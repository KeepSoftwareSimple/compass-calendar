/**
 * Injectable seam over the browser Notification API, mirroring toast.port.ts.
 *
 * Everything that touches `window.Notification` or `navigator.permissions`
 * goes through here so tests can drive grant/deny without a real browser
 * prompt, and so an unsupported browser is a single `isSupported()` check
 * rather than a scatter of `"Notification" in window` guards.
 */

export interface ShowNotificationOptions {
  body?: string;
  /** Replaces an earlier notification with the same tag instead of stacking. */
  tag?: string;
  onClick?: () => void;
  icon?: string;
}

export interface NotificationPort {
  isSupported(): boolean;
  getPermission(): NotificationPermission;
  requestPermission(): Promise<NotificationPermission>;
  /** Returns true only when the OS notification was actually constructed. */
  show(title: string, options?: ShowNotificationOptions): boolean;
  /** Fires when the browser-level permission changes; returns an unsubscribe. */
  observePermission(onChange: () => void): () => void;
}

const isSupported = (): boolean =>
  typeof window !== "undefined" && "Notification" in window;

const defaultNotificationIcon = (): string | undefined => {
  if (typeof window === "undefined") return undefined;
  return new URL("/favicon.ico", window.location.origin).href;
};

const productionNotificationPort: NotificationPort = {
  isSupported,

  getPermission: () => (isSupported() ? Notification.permission : "denied"),

  requestPermission: async () => {
    if (!isSupported()) return "denied";
    try {
      return await Notification.requestPermission();
    } catch {
      // Older Safari used a callback signature and can throw on the promise
      // form. Report whatever the browser already decided rather than lying.
      return Notification.permission;
    }
  },

  show: (title, options = {}) => {
    if (!isSupported() || Notification.permission !== "granted") return false;
    try {
      const notification = new Notification(title, {
        body: options.body,
        tag: options.tag,
        icon: options.icon ?? defaultNotificationIcon(),
      });
      notification.onclick = () => {
        options.onClick?.();
        notification.close();
      };
      return true;
    } catch {
      // Constructing a Notification throws on platforms that require a
      // service worker (Android Chrome). The caller must not burn its
      // de-dupe key, so the next tick can retry.
      return false;
    }
  },

  observePermission: (onChange) => {
    if (typeof navigator === "undefined" || !navigator.permissions) {
      return () => {};
    }
    let status: PermissionStatus | undefined;
    let cancelled = false;
    // The query is async, so the unsubscribe has to cover the window before
    // it resolves as well as after.
    navigator.permissions
      // Safari has no "notifications" descriptor and rejects here.
      .query({ name: "notifications" as PermissionName })
      .then((result) => {
        if (cancelled) return;
        status = result;
        result.addEventListener("change", onChange);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      status?.removeEventListener("change", onChange);
    };
  },
};

let notificationPort: NotificationPort = productionNotificationPort;

export function getNotificationPort(): NotificationPort {
  return notificationPort;
}

export function registerNotificationPort(port: NotificationPort): void {
  notificationPort = port;
}

export function resetNotificationPort(): void {
  notificationPort = productionNotificationPort;
}
