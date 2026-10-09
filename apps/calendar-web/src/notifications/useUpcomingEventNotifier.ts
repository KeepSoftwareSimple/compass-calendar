import { useEffect, useRef } from "react";
import dayjs from "@core/util/date/dayjs";
import { useTodayTimedEvents } from "@web/components/Sidebar/UpNextCard/useUpNextEvent";
import { getNotificationPort } from "@web/notifications/notification.port";
import { useNotificationsEffectivelyOn } from "@web/notifications/notification.state";
import {
  announceUpcomingEvents,
  toNotifiableEvents,
} from "@web/notifications/upcoming-notifier.logic";

/**
 * Fires a browser notification NOTIFY_LEAD_MINUTES before each timed event.
 *
 * Runs on the shared minute tick rather than a setTimeout chain: 60s
 * granularity is plenty for a 5-minute lead, and it stays correct across
 * sleep/wake, where pending timers do not. Background tabs throttle timers to
 * roughly one per minute, which is exactly this cadence.
 */
export function useUpcomingEventNotifier(): void {
  const effectivelyOn = useNotificationsEffectivelyOn();
  const { now, allTimedEvents } = useTodayTimedEvents();
  const firedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!effectivelyOn) return;

    firedKeysRef.current = announceUpcomingEvents(
      getNotificationPort(),
      now,
      toNotifiableEvents(allTimedEvents),
      firedKeysRef.current,
    );
  }, [effectivelyOn, now, allTimedEvents]);

  // Background tabs freeze the minute tick; on return, retry reminders that
  // became due while the tab slept (same cadence as useMinuteTick catch-up).
  useEffect(() => {
    if (!effectivelyOn) return;

    const catchUpMissed = () => {
      if (document.visibilityState !== "visible") return;
      firedKeysRef.current = announceUpcomingEvents(
        getNotificationPort(),
        dayjs(),
        toNotifiableEvents(allTimedEvents),
        firedKeysRef.current,
        { allowMissedGrace: true },
      );
    };

    document.addEventListener("visibilitychange", catchUpMissed);
    window.addEventListener("focus", catchUpMissed);
    return () => {
      document.removeEventListener("visibilitychange", catchUpMissed);
      window.removeEventListener("focus", catchUpMissed);
    };
  }, [effectivelyOn, allTimedEvents]);
}
