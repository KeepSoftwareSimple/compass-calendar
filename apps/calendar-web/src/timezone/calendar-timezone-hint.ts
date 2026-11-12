import { type Calendar } from "@core/types/calendar.contracts";
import { isValidTimeZone } from "@web/timezone/browser-timezone";
import { setCalendarTimeZoneHint } from "@web/timezone/effective-timezone.store";
import { isUtcLikeTimeZone } from "@web/timezone/utc-like-timezone";

/**
 * Best IANA zone from connected calendars: primary first, then any non-UTC
 * provider zone, then any provider zone.
 */
export function pickCalendarTimeZoneHint(
  calendars: readonly Calendar[],
): string | null {
  const primary = calendars.find(
    (calendar) => calendar.isPrimary && calendar.timeZone,
  );
  if (primary?.timeZone && isValidTimeZone(primary.timeZone)) {
    return primary.timeZone;
  }

  for (const calendar of calendars) {
    const zone = calendar.timeZone;
    if (zone && isValidTimeZone(zone) && !isUtcLikeTimeZone(zone)) {
      return zone;
    }
  }

  for (const calendar of calendars) {
    const zone = calendar.timeZone;
    if (zone && isValidTimeZone(zone)) {
      return zone;
    }
  }

  return null;
}

/** Keep Auto effective zone aligned with connected calendars (see CalendarTimeZoneHintSync). */
export function syncCalendarTimeZoneHintFromCalendars(
  calendars: readonly Calendar[] | null | undefined,
): void {
  setCalendarTimeZoneHint(
    calendars ? pickCalendarTimeZoneHint(calendars) : null,
  );
}
