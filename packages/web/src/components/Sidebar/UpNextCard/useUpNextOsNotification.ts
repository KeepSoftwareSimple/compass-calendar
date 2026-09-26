import { useEffect, useRef } from "react";
import { track } from "@web/auth/posthog/track";
import { getNotificationPort } from "@web/notifications/notification.port";
import { useNotificationsEffectivelyOn } from "@web/notifications/notification.state";
import {
  type NotifiableEvent,
  notificationKey,
  showUpcomingEventNotification,
} from "@web/notifications/upcoming-notifier.logic";

/**
 * When the in-app Up Next banner appears, try the OS notification again with
 * the same tag as the 5-minute notifier. Some browsers accept the constructor
 * but drop the banner on screen; a second attempt while the user is already
 * looking at the app often succeeds without stacking duplicates.
 */
export function useUpNextOsNotification(
  upNext: NotifiableEvent | undefined,
  isActive: boolean,
): void {
  const effectivelyOn = useNotificationsEffectivelyOn();
  const attemptedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!effectivelyOn || !isActive || !upNext?._id) return;

    const key = notificationKey(upNext);
    if (attemptedKeysRef.current.has(key)) return;

    const shown = showUpcomingEventNotification(getNotificationPort(), upNext);
    attemptedKeysRef.current.add(key);

    if (shown) {
      track("notifications_shown");
    } else {
      track("notifications_show_failed");
    }
  }, [effectivelyOn, isActive, upNext]);
}
