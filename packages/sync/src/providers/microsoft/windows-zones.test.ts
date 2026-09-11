import { TimezoneSchema } from "@core/types/type.utils";
import {
  ianaZoneToWindows,
  listWindowsZones,
  windowsZoneToIana,
} from "@sync/providers/microsoft/windows-zones";

describe("windows-zones", () => {
  it("maps known Windows zones to IANA names", () => {
    expect(windowsZoneToIana("Pacific Standard Time")).toBe(
      "America/Los_Angeles",
    );
    expect(windowsZoneToIana("Eastern Standard Time")).toBe("America/New_York");
    expect(windowsZoneToIana("GMT Standard Time")).toBe("Europe/London");
  });

  it("maps IANA names back to Windows zones", () => {
    expect(ianaZoneToWindows("America/Los_Angeles")).toBe(
      "Pacific Standard Time",
    );
    expect(ianaZoneToWindows("America/New_York")).toBe("Eastern Standard Time");
  });

  it("maps every Windows zone to a supported IANA name", () => {
    for (const windowsZone of listWindowsZones()) {
      const iana = windowsZoneToIana(windowsZone);
      expect(TimezoneSchema.safeParse(iana).success).toBe(true);
    }
  });
});
