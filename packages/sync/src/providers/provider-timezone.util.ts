import { TimezoneSchema } from "@core/types/type.utils";

/** Whether the provider handed us a name IANA (and therefore `Intl`) knows. */
export function isIanaTimeZone(timeZone: string): boolean {
  return TimezoneSchema.safeParse(timeZone).success;
}

/**
 * Every provider occasionally emits a zone field that is not an IANA name:
 * Google sends fixed offsets ("GMT-07:00"), iCal sends floating zones, Graph
 * sends Windows display names. Falling back to UTC keeps the instant and only
 * loses the wall-clock display context, rather than dropping the event.
 *
 * Microsoft reads go through `toIanaTimeZone`, which tries the Windows zone
 * table before this fallback.
 */
export function toIanaTimeZoneOrUtc(timeZone: string): string {
  return isIanaTimeZone(timeZone) ? timeZone : "UTC";
}
