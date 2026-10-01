import { useSyncExternalStore } from "react";
import { track } from "@web/auth/posthog/track";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { NOTIFICATIONS_STATUS_TOAST_ID } from "@web/common/constants/toast.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { subscribeToStorageKey } from "@web/common/utils/external-store.util";
import { showStatusToast } from "@web/common/utils/toast/status-toast.util";
import {
  getNotificationPort,
  type NotificationPort,
} from "@web/notifications/notification.port";

/** Where a toggle came from for analytics. */
export type NotificationToggleSource = "palette";

export const SAMPLE_NOTIFICATION_TITLE = "Compass notifications are on";
export const SAMPLE_NOTIFICATION_BODY =
  "You'll get a heads-up like this 5 minutes before each event.";

export const NOTIFICATIONS_ENABLED_TOAST =
  "Event notifications on. A test notification should have just appeared. If it didn't, allow this browser in your system's notification settings.";
/** Fallback when the browser accepted the grant but refused to construct one. */
export const NOTIFICATIONS_ENABLED_NO_SAMPLE_TOAST =
  "Event notifications on. You'll get a heads-up 5 minutes before each event while this browser is open.";

/**
 * A browser grant is not the whole story: the OS can still swallow every
 * notification (macOS never asked for the browser, a Focus mode, screen
 * sharing) while the constructor reports success. Firing one right away is
 * the only way the user finds that out before a meeting does it for them.
 */
function showSampleNotification(port: NotificationPort): boolean {
  return port.show(SAMPLE_NOTIFICATION_TITLE, {
    body: SAMPLE_NOTIFICATION_BODY,
    tag: "compass-notifications-enabled",
    eventId: "compass-notifications-sample",
    onClick: () => window.focus(),
  });
}

/**
 * Device-local opt-in, deliberately not synced: a grant belongs to one
 * browser profile, so a pref that outran it would promise notifications the
 * browser will never deliver.
 */
export function isNotificationsPrefEnabled(): boolean {
  return (
    persistentBrowserStore.get(STORAGE_KEYS.NOTIFICATIONS_ENABLED) === "true"
  );
}

function persistNotificationsPref(enabled: boolean): void {
  if (enabled) {
    persistentBrowserStore.set(STORAGE_KEYS.NOTIFICATIONS_ENABLED, "true");
    return;
  }
  persistentBrowserStore.remove(STORAGE_KEYS.NOTIFICATIONS_ENABLED);
}

/**
 * The only state worth acting on: opted in, still granted, still supported.
 * A revoked grant reads as off everywhere without a separate stuck state.
 */
export function areNotificationsEffectivelyOn(): boolean {
  return (
    isNotificationsPrefEnabled() &&
    getNotificationPort().getPermission() === "granted"
  );
}

const listeners = new Set<() => void>();
let subscriberCount = 0;
let stopExternal: (() => void) | undefined;

const emit = () => {
  for (const listener of listeners) listener();
};

const startExternalSubscriptions = (): (() => void) => {
  const unobserve = getNotificationPort().observePermission(emit);
  const unstorage = subscribeToStorageKey(
    STORAGE_KEYS.NOTIFICATIONS_ENABLED,
    emit,
  );
  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") emit();
  };
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("focus", emit);

  return () => {
    unobserve();
    unstorage();
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("focus", emit);
  };
};

const subscribe = (onChange: () => void): (() => void) => {
  listeners.add(onChange);
  if (subscriberCount === 0) {
    stopExternal = startExternalSubscriptions();
  }
  subscriberCount += 1;

  return () => {
    listeners.delete(onChange);
    subscriberCount -= 1;
    if (subscriberCount === 0) {
      stopExternal?.();
      stopExternal = undefined;
    }
  };
};

export function useNotificationsEffectivelyOn(): boolean {
  return useSyncExternalStore(
    subscribe,
    areNotificationsEffectivelyOn,
    () => false,
  );
}

export const notificationActions = {
  /**
   * Ask the browser, then opt in only on a grant. Keeping the pref and the
   * permission in lockstep means there is no "on but silent" state to explain.
   */
  enable: async (source: NotificationToggleSource): Promise<void> => {
    const port = getNotificationPort();
    if (!port.isSupported()) return;

    const permission = await port.requestPermission();
    emit();

    if (permission === "granted") {
      persistNotificationsPref(true);
      emit();
      const sampleShown = showSampleNotification(port);
      showStatusToast(
        NOTIFICATIONS_STATUS_TOAST_ID,
        sampleShown
          ? NOTIFICATIONS_ENABLED_TOAST
          : NOTIFICATIONS_ENABLED_NO_SAMPLE_TOAST,
      );
      track("notifications_enabled", { source, sampleShown });
      return;
    }

    if (permission === "denied") {
      // The browser will not prompt again for this origin, so point at the
      // only place that can undo it.
      showStatusToast(
        NOTIFICATIONS_STATUS_TOAST_ID,
        "Notifications are blocked for this site. Allow them in your browser's site settings, then try again.",
      );
      track("notifications_enable_denied", { source });
    }
    // "default" means the prompt was dismissed without a choice: stay quiet,
    // the user can ask again.
  },

  disable: (source: NotificationToggleSource): void => {
    persistNotificationsPref(false);
    emit();
    showStatusToast(NOTIFICATIONS_STATUS_TOAST_ID, "Event notifications off.");
    track("notifications_disabled", { source });
  },
};
