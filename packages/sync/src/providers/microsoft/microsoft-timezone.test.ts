import {
  requireIanaTimeZone,
  toIanaTimeZone,
} from "@sync/providers/microsoft/microsoft-timezone";
import { describe, expect, it } from "bun:test";

describe("toIanaTimeZone", () => {
  it("passes an IANA zone through", () => {
    expect(toIanaTimeZone("America/Denver")).toBe("America/Denver");
  });

  it("maps a Windows display name", () => {
    expect(toIanaTimeZone("Pacific Standard Time")).toBe("America/Los_Angeles");
  });

  it("falls back to UTC for a value from neither set", () => {
    expect(toIanaTimeZone("Middle Earth Standard Time")).toBe("UTC");
  });
});

describe("requireIanaTimeZone", () => {
  it("resolves IANA and Windows names", () => {
    expect(requireIanaTimeZone("America/Denver")).toBe("America/Denver");
    expect(requireIanaTimeZone("UTC")).toBe("UTC");
    expect(requireIanaTimeZone("Pacific Standard Time")).toBe(
      "America/Los_Angeles",
    );
  });

  it("throws rather than silently anchoring UNTIL to the wrong zone", () => {
    expect(() => requireIanaTimeZone("Middle Earth Standard Time")).toThrow(
      /Unknown Windows time zone/,
    );
    expect(() => requireIanaTimeZone("Not/AZone")).toThrow(
      /Unknown Windows time zone/,
    );
  });
});
