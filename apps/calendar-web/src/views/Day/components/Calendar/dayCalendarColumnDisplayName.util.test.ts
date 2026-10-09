import { formatDayCalendarColumnDisplayName } from "./dayCalendarColumnDisplayName.util";
import { describe, expect, it } from "bun:test";

describe("formatDayCalendarColumnDisplayName", () => {
  it("uses the local part for email calendar names", () => {
    expect(formatDayCalendarColumnDisplayName("tyler@tylerdane.com")).toBe(
      "tyler",
    );
  });

  it("keeps spaced and ordinary names unchanged", () => {
    expect(
      formatDayCalendarColumnDisplayName("Holidays in United States"),
    ).toBe("Holidays in United States");
    expect(formatDayCalendarColumnDisplayName("journey-mens-group")).toBe(
      "journey-mens-group",
    );
  });
});
