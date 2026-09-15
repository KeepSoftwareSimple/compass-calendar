import { useUpcomingEventNotifier } from "@web/notifications/useUpcomingEventNotifier";

/**
 * 5-minute event heads-up. Mount on every calendar and Life route so the
 * notifier still fires when the week grid is not on screen. Kept off RootShell
 * so the day-events query (and rrule expansion) stay out of the boot graph.
 */
export function UpcomingEventNotifierHost() {
  useUpcomingEventNotifier();
  return null;
}
