import {
  DEFAULT_POPUP_REMINDER_MINUTES,
  type DueEventReminder,
  MAX_NOTIFICATION_LOOKAHEAD_MINUTES,
  notificationKey,
  type RemindableEvent,
  selectDueEventReminders,
} from "@core/notifications/upcoming-event-reminders.util";
import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import { track } from "@web/auth/posthog/track";
import { toUTCOffset } from "@web/common/utils/datetime/web.date.util";
import { type NotificationPort } from "@web/notifications/notification.port";
import { inEffectiveTimeZone } from "@web/timezone/in-time-zone";
import { dayEventQueryRange } from "@web/views/Day/util/day-window.util";

/** @deprecated Use synced popup offsets; kept for tests and sample copy. */
export const NOTIFY_LEAD_MINUTES = DEFAULT_POPUP_REMINDER_MINUTES[0]!;

const FIRED_KEY_TTL_HOURS = 24;

/** The subset of a GridEvent this module needs; keeps the logic testable. */
export type NotifiableEvent = RemindableEvent;

/** The GridEvent fields the notifier reads before deciding to announce. */
export interface CandidateEvent {
  _id?: string;
  title?: string;
  startDate: string;
  isDemo?: boolean;
  popupReminderMinutes?: readonly number[];
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
      ? [
          {
            _id: event._id,
            title: event.title,
            startDate: event.startDate,
            popupReminderMinutes: event.popupReminderMinutes,
          },
        ]
      : [],
  );
}

export { notificationKey };

/**
 * Event query range for the notifier and up-next: today's local day, plus the
 * lead window into tomorrow so a meeting just after midnight still gets a
 * full heads-up for long synced reminders.
 *
 * Same `[start, end)` shape as `dayEventQueryRange`.
 */
export function notifiableEventQueryRange(now: Dayjs): {
  startDate: string;
  endDate: string;
} {
  const { startDate } = dayEventQueryRange(now);
  return {
    startDate,
    endDate: toUTCOffset(
      now
        .startOf("day")
        .add(1, "day")
        .add(MAX_NOTIFICATION_LOOKAHEAD_MINUTES, "minute"),
    ),
  };
}

export function selectEventsToNotify(
  now: Dayjs,
  events: readonly NotifiableEvent[],
  firedKeys: ReadonlySet<string>,
  options?: { allowMissedGrace?: boolean },
): DueEventReminder[] {
  return selectDueEventReminders(now, events, firedKeys, options);
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
      const parsedStart = key.split("|")[1];
      if (!parsedStart) return false;
      const start = dayjs(parsedStart);
      // An unparseable key can never match a real event again; drop it.
      return start.isValid() && start.isAfter(cutoff);
    }),
  );
}

/** Title, start-time body, and de-dupe tag used by the notifier
 * and the Up Next banner retry. Same payload so the second attempt replaces
 * the first instead of stacking. */
export function showUpcomingEventNotification(
  port: NotificationPort,
  event: NotifiableEvent,
  reminderMinutes: number,
  now: Dayjs = dayjs(),
): boolean {
  const minutesUntilStart = Math.max(
    0,
    Math.ceil(dayjs(event.startDate).diff(now, "minute", true)),
  );
  const startLabel = inEffectiveTimeZone(event.startDate).format("h:mm A");
  const body =
    minutesUntilStart === 0
      ? `Starting now (${startLabel})`
      : minutesUntilStart === 1
        ? `Starts in 1 minute (${startLabel})`
        : `Starts in ${minutesUntilStart} minutes (${startLabel})`;

  return port.show(event.title?.trim() || "Untitled event", {
    body,
    tag: notificationKey(event, reminderMinutes),
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
  options?: { allowMissedGrace?: boolean },
): Set<string> {
  const due = selectEventsToNotify(now, events, firedKeys, options);
  if (due.length === 0) return new Set(firedKeys);

  const announced = pruneFiredKeys(firedKeys, now);
  for (const { event, reminderMinutes } of due) {
    const key = notificationKey(event, reminderMinutes);
    const shown = showUpcomingEventNotification(
      port,
      event,
      reminderMinutes,
      now,
    );
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
