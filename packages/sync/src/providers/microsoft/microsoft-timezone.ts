import { windowsZoneToIana } from "@sync/providers/microsoft/windows-zones";
import {
  isIanaTimeZone,
  toIanaTimeZoneOrUtc,
} from "@sync/providers/provider-timezone.util";

// Graph zone fields carry either an IANA name or a Windows display name, and
// occasionally a value from neither set. Falling back to UTC only loses the
// wall-clock display context rather than dropping the event.
export function toIanaTimeZone(timeZone: string): string {
  if (isIanaTimeZone(timeZone)) return timeZone;
  try {
    return windowsZoneToIana(timeZone);
  } catch {
    return toIanaTimeZoneOrUtc(timeZone);
  }
}

/**
 * Writes cannot fall back: a zone Compass cannot name would anchor UNTIL to
 * the wrong wall clock, so an unmappable value is an unsupported recurrence.
 */
export function requireIanaTimeZone(timeZone: string): string {
  if (isIanaTimeZone(timeZone)) return timeZone;
  return windowsZoneToIana(timeZone);
}
