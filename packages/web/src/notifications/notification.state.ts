import { useSyncExternalStore } from "react";
import { track } from "@web/auth/posthog/track";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { NOTIFICATIONS_STATUS_TOAST_ID } from "@web/common/constants/toast.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { subscribeToStorageKey } from "@web/common/utils/external-store.util";
import { showStatusToast } from "@web/common/utils/toast/status-toast.util";
import { getNotificationPort } from "@web/notifications/notification.port";

/** Where a toggle came from for analytics. */
export type NotificationToggleSource = "palette";

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
      showStatusToast(
        NOTIFICATIONS_STATUS_TOAST_ID,
        "Event notifications on. You'll get a heads-up 5 minutes before each event while this browser is open.",
      );
      track("notifications_enabled", { source });
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
