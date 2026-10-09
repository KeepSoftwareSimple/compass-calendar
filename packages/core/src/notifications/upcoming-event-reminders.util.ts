import {
  DEFAULT_POPUP_REMINDER_MINUTES,
  decodePopupReminderMinutes,
} from "@core/notifications/google-popup-reminders.util";

export { DEFAULT_POPUP_REMINDER_MINUTES } from "@core/notifications/google-popup-reminders.util";

import dayjs, { type Dayjs } from "@core/util/date/dayjs";

/** How far back a visibility catch-up may still fire a missed popup reminder. */
export const MISSED_REMINDER_GRACE_MINUTES = 60;

/** Extend day queries so same-day events with long lead times still load. */
export const MAX_NOTIFICATION_LOOKAHEAD_MINUTES = 24 * 60;

export interface RemindableEvent {
  _id: string;
  title?: string;
  startDate: string;
  /** Synced popup offsets; absent uses {@link DEFAULT_POPUP_REMINDER_MINUTES}. */
  popupReminderMinutes?: readonly number[];
}

export interface DueEventReminder {
  event: RemindableEvent;
  reminderMinutes: number;
}

export function effectivePopupReminderMinutes(
  event: Pick<RemindableEvent, "popupReminderMinutes">,
): readonly number[] {
  const synced = event.popupReminderMinutes;
  if (synced !== undefined) return synced;
  return DEFAULT_POPUP_REMINDER_MINUTES;
}

export function notificationKey(
  event: Pick<RemindableEvent, "_id" | "startDate">,
  reminderMinutes: number,
): string {
  return `${event._id}|${event.startDate}|${reminderMinutes}`;
}

export function selectDueEventReminders(
  now: Dayjs,
  events: readonly RemindableEvent[],
  firedKeys: ReadonlySet<string>,
  options?: { allowMissedGrace?: boolean },
): DueEventReminder[] {
  const due: DueEventReminder[] = [];

  for (const event of events) {
    const minutesUntilStart = dayjs(event.startDate).diff(now, "minute", true);

    for (const reminderMinutes of effectivePopupReminderMinutes(event)) {
      const key = notificationKey(event, reminderMinutes);
      if (firedKeys.has(key)) continue;
      if (minutesUntilStart > reminderMinutes) continue;

      const beforeStart = minutesUntilStart >= 0;
      const missedWithinGrace =
        options?.allowMissedGrace === true &&
        minutesUntilStart < 0 &&
        minutesUntilStart >= -MISSED_REMINDER_GRACE_MINUTES;

      if (beforeStart || missedWithinGrace) {
        due.push({ event, reminderMinutes });
      }
    }
  }

  return due.sort((left, right) => {
    const startDelta =
      dayjs(left.event.startDate).valueOf() -
      dayjs(right.event.startDate).valueOf();
    if (startDelta !== 0) return startDelta;
    return right.reminderMinutes - left.reminderMinutes;
  });
}

export function reminderMinutesFromProviderMetadata(
  metadata: Readonly<Record<string, string>> | null | undefined,
): readonly number[] | undefined {
  return decodePopupReminderMinutes(metadata?.["popupReminders"]);
}
