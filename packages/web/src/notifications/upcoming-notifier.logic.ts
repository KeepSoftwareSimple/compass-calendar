import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import { track } from "@web/auth/posthog/track";
import { toUTCOffset } from "@web/common/utils/datetime/web.date.util";
import { type NotificationPort } from "@web/notifications/notification.port";
import { inEffectiveTimeZone } from "@web/timezone/in-time-zone";

/** Fixed lead time. Long enough to walk to a meeting, short enough to be news. */
export const NOTIFY_LEAD_MINUTES = 5;

const FIRED_KEY_TTL_HOURS = 24;

/** The subset of a GridEvent this module needs; keeps the logic testable. */
export interface NotifiableEvent {
  _id: string;
  title?: string;
  startDate: string;
}

/** The GridEvent fields the notifier reads before deciding to announce. */
export interface CandidateEvent {
  _id?: string;
  title?: string;
  startDate: string;
  isDemo?: boolean;
}

/**
 * Narrow the day's timed events to the ones worth announcing.
 *
 * A saved event always carries an id; an unsaved draft on the grid may not,
 * and without one there is no stable key to de-dupe on. Seeded sample events
 * are dropped outright: first run seeds a workday of them and offers
 * notifications in the same breath, and an OS notification for a meeting that
 * does not exist is worse than no notification at all.
 */
export function toNotifiableEvents(
  events: readonly CandidateEvent[],
): NotifiableEvent[] {
  return events.flatMap((event) =>
    event._id && !event.isDemo
      ? [{ _id: event._id, title: event.title, startDate: event.startDate }]
      : [],
  );
}

/**
 * Start time is part of the key, not just the id: rescheduling an event should
 * earn a fresh notification at its new time. Recurring occurrences already
 * carry distinct ids, so they never collide.
 */
export function notificationKey(event: NotifiableEvent): string {
  return `${event._id}|${event.startDate}`;
}

/**
 * Event query range for the notifier and up-next: today's local day, plus the
 * lead window into tomorrow so a meeting just after midnight still gets a
 * full five-minute heads-up.
 *
 * Same `[start, end)` shape as `dayEventQueryRange`.
 */
export function notifiableEventQueryRange(now: Dayjs): {
  startDate: string;
  endDate: string;
} {
  return {
    startDate: toUTCOffset(now.startOf("day")),
    endDate: toUTCOffset(
      now.startOf("day").add(1, "day").add(NOTIFY_LEAD_MINUTES, "minute"),
    ),
  };
}

/**
 * Events starting within the lead window that have not been announced yet.
 *
 * Already-started events are excluded on purpose: after a laptop wakes, the
 * tick catches up all at once, and a burst of notifications for meetings that
 * began an hour ago is noise. The in-app UpNextBanner covers "happening now".
 */
export function selectEventsToNotify(
  now: Dayjs,
  events: readonly NotifiableEvent[],
  firedKeys: ReadonlySet<string>,
): NotifiableEvent[] {
  return events
    .filter((event) => {
      if (firedKeys.has(notificationKey(event))) return false;
      const minutesUntilStart = dayjs(event.startDate).diff(
        now,
        "minute",
        true,
      );
      return minutesUntilStart >= 0 && minutesUntilStart <= NOTIFY_LEAD_MINUTES;
    })
    .sort(
      (a, b) => dayjs(a.startDate).valueOf() - dayjs(b.startDate).valueOf(),
    );
}

/**
 * Drop keys for events that are long past so a tab left open for days does not
 * grow the set without bound.
 */
export function pruneFiredKeys(
  firedKeys: ReadonlySet<string>,
  now: Dayjs,
): Set<string> {
  const cutoff = now.subtract(FIRED_KEY_TTL_HOURS, "hour");
  return new Set(
    [...firedKeys].filter((key) => {
      const startDate = key.slice(key.indexOf("|") + 1);
      const start = dayjs(startDate);
      // An unparseable key can never match a real event again; drop it.
      return start.isValid() && start.isAfter(cutoff);
    }),
  );
}

/** Title, start-time body, and de-dupe tag used by the 5-minute notifier
 * and the Up Next banner retry. Same payload so the second attempt replaces
 * the first instead of stacking. */
export function showUpcomingEventNotification(
  port: NotificationPort,
  event: NotifiableEvent,
): boolean {
  return port.show(event.title?.trim() || "Untitled event", {
    body: `Starts at ${inEffectiveTimeZone(event.startDate).format("h:mm A")}`,
    tag: notificationKey(event),
    onClick: () => window.focus(),
  });
}

/**
 * Announce everything due and return the keys announced so far. Keeping this
 * out of the hook means the notification a user actually sees - its title,
 * its wording, and the fact that it fires exactly once - is testable without
 * a React tree.
 */
export function announceUpcomingEvents(
  port: NotificationPort,
  now: Dayjs,
  events: readonly NotifiableEvent[],
  firedKeys: ReadonlySet<string>,
): Set<string> {
  const due = selectEventsToNotify(now, events, firedKeys);
  if (due.length === 0) return new Set(firedKeys);

  const announced = pruneFiredKeys(firedKeys, now);
  for (const event of due) {
    const key = notificationKey(event);
    const shown = showUpcomingEventNotification(port, event);
    if (shown) {
      announced.add(key);
      track("notifications_shown");
      continue;
    }
    // A silent browser drop must not burn the key: the next tick retries.
    track("notifications_show_failed");
  }
  return announced;
}
