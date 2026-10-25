import {
  graphTimeZoneToIana,
  stripGraphDateTimeFraction,
} from "@sync/providers/microsoft/microsoft-graph-timezone";
import { describe, expect, test } from "bun:test";

describe("microsoft-graph-timezone", () => {
  test("passes IANA through and maps Windows names", () => {
    expect(graphTimeZoneToIana("America/Denver")).toBe("America/Denver");
    expect(graphTimeZoneToIana("Mountain Standard Time")).toBe(
      "America/Denver",
    );
  });

  test("falls back to UTC for unknown Windows names", () => {
    expect(graphTimeZoneToIana("Not A Real Zone")).toBe("UTC");
  });

  test("strips Graph fractional seconds", () => {
    expect(stripGraphDateTimeFraction("2025-10-20T01:00:00.0000000")).toBe(
      "2025-10-20T01:00:00",
    );
    expect(stripGraphDateTimeFraction("2025-10-20T01:00:00")).toBe(
      "2025-10-20T01:00:00",
    );
  });
});
