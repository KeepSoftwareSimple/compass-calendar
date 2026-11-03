import {
  isIanaTimeZone,
  toIanaTimeZoneOrUtc,
} from "@sync/providers/provider-timezone.util";
import { describe, expect, it } from "bun:test";

describe("isIanaTimeZone", () => {
  it("accepts an IANA zone name", () => {
    expect(isIanaTimeZone("America/Denver")).toBe(true);
    expect(isIanaTimeZone("UTC")).toBe(true);
  });

  it("rejects a fixed-offset string and a Windows display name", () => {
    expect(isIanaTimeZone("GMT-07:00")).toBe(false);
    expect(isIanaTimeZone("Pacific Standard Time")).toBe(false);
  });
});

describe("toIanaTimeZoneOrUtc", () => {
  it("passes an IANA zone through", () => {
    expect(toIanaTimeZoneOrUtc("America/Denver")).toBe("America/Denver");
  });

  it("falls back to UTC for Google fixed offsets", () => {
    expect(toIanaTimeZoneOrUtc("GMT-07:00")).toBe("UTC");
  });

  it("falls back to UTC for an iCal floating zone and empty input", () => {
    expect(toIanaTimeZoneOrUtc("floating")).toBe("UTC");
    expect(toIanaTimeZoneOrUtc("")).toBe("UTC");
  });
});
