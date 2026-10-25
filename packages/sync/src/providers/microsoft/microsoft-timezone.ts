import { TimezoneSchema } from "@core/types/type.utils";
import { windowsZoneToIana } from "@sync/providers/microsoft/windows-zones";

// Graph zone fields carry either an IANA name or a Windows display name, and
// occasionally a value from neither set. Falling back to UTC only loses the
// wall-clock display context rather than dropping the event.
export function toIanaTimeZone(timeZone: string): string {
  if (TimezoneSchema.safeParse(timeZone).success) return timeZone;
  try {
    return windowsZoneToIana(timeZone);
  } catch {
    return "UTC";
  }
}
