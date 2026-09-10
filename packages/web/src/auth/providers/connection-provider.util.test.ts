import { createMockCalendar } from "@web/__tests__/utils/factories/calendar.factory";
import { calendarProviderKind } from "@web/auth/providers/connection-provider.util";
import { describe, expect, it } from "bun:test";

describe("calendarProviderKind", () => {
  it("returns the provider kind of a provider-backed calendar", () => {
    expect(calendarProviderKind(createMockCalendar())).toBe("google");
    expect(
      calendarProviderKind(createMockCalendar({ provider: "microsoft" })),
    ).toBe("microsoft");
  });

  it("is undefined for the local calendar, which belongs to no account", () => {
    expect(
      calendarProviderKind(createMockCalendar({ provider: "local" })),
    ).toBeUndefined();
  });
});
