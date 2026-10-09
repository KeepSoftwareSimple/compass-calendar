import { type gSchema$Event } from "@core/types/gcal";

/** Compass-native events with no synced reminder use a 5-minute heads-up. */
export const DEFAULT_POPUP_REMINDER_MINUTES = [5] as const;

/**
 * When Google says `useDefault` but calendar defaults are not on the record yet
 * (pre-resync), match Google's usual calendar default: 10 minutes popup.
 */
export const GOOGLE_ACCOUNT_DEFAULT_POPUP_REMINDER_MINUTES = [10] as const;

const popupMinutesFromOverrides = (
  overrides: readonly { method?: string | null; minutes?: number | null }[],
): readonly number[] =>
  overrides
    .filter(
      (entry): entry is { method: "popup"; minutes: number } =>
        entry.method === "popup" &&
        typeof entry.minutes === "number" &&
        entry.minutes >= 0,
    )
    .map((entry) => entry.minutes);

export function googleCalendarListDefaultPopupMinutes(
  defaultReminders:
    | readonly { method?: string | null; minutes?: number | null }[]
    | null
    | undefined,
): readonly number[] {
  return popupMinutesFromOverrides(defaultReminders ?? []);
}

/**
 * Resolve popup reminder offsets for one Google event read.
 *
 * Email-only reminders are ignored; Compass only mirrors popup timing.
 * An explicit empty override list means no popup reminders.
 */
export function resolveGooglePopupReminderMinutes(
  reminders: gSchema$Event["reminders"] | null | undefined,
  calendarDefaultPopupMinutes: readonly number[],
): readonly number[] {
  if (!reminders) {
    return calendarDefaultPopupMinutes.length > 0
      ? calendarDefaultPopupMinutes
      : DEFAULT_POPUP_REMINDER_MINUTES;
  }

  if (reminders.useDefault) {
    if (calendarDefaultPopupMinutes.length > 0) {
      return calendarDefaultPopupMinutes;
    }
    return GOOGLE_ACCOUNT_DEFAULT_POPUP_REMINDER_MINUTES;
  }

  const popup = popupMinutesFromOverrides(reminders.overrides ?? []);
  return popup;
}

const POPUP_REMINDERS_NONE = "none";

export function encodePopupReminderMinutes(minutes: readonly number[]): string {
  if (minutes.length === 0) return POPUP_REMINDERS_NONE;
  const unique = [...new Set(minutes)].sort((left, right) => right - left);
  return unique.join(",");
}

export function decodePopupReminderMinutes(
  encoded: string | null | undefined,
): readonly number[] | undefined {
  if (!encoded?.trim()) return undefined;
  if (encoded.trim() === POPUP_REMINDERS_NONE) return [];
  const parsed = encoded
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((value) => Number.isFinite(value) && value >= 0);
  return parsed.length > 0 ? parsed : undefined;
}
