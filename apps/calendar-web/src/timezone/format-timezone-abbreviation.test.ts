import { formatTimeZoneAbbreviation } from "@web/timezone/format-timezone-abbreviation";
import { describe, expect, it } from "bun:test";

describe("formatTimeZoneAbbreviation", () => {
  it("uses the daylight abbreviation on the summer side of a DST boundary", () => {
    expect(
      formatTimeZoneAbbreviation(
        "America/Denver",
        new Date("2026-07-15T18:00:00.000Z"),
      ),
    ).toBe("MDT");
  });

  it("uses the standard abbreviation on the winter side of a DST boundary", () => {
    expect(
      formatTimeZoneAbbreviation(
        "America/Denver",
        new Date("2026-01-15T18:00:00.000Z"),
      ),
    ).toBe("MST");
  });

  it("falls back to the offset form when the zone has no named abbreviation", () => {
    expect(
      formatTimeZoneAbbreviation(
        "Asia/Kolkata",
        new Date("2026-07-15T12:00:00.000Z"),
      ),
    ).toBe("GMT+5:30");
  });

  it("labels UTC as UTC", () => {
    expect(
      formatTimeZoneAbbreviation("UTC", new Date("2026-07-15T12:00:00.000Z")),
    ).toBe("UTC");
  });
});
