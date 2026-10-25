import { TimezoneSchema } from "@core/types/type.utils";
import { windowsZoneToIana } from "@sync/providers/microsoft/windows-zones";

/** Graph zone to IANA. Unknown Windows names fall back to UTC. */
export function graphTimeZoneToIana(timeZone: string): string {
  if (TimezoneSchema.safeParse(timeZone).success) return timeZone;
  try {
    return windowsZoneToIana(timeZone);
  } catch {
    return "UTC";
  }
}

/** Graph dateTime values often include a 7-digit fraction. */
export function stripGraphDateTimeFraction(dateTime: string): string {
  return dateTime.replace(/\.\d+$/, "");
}
