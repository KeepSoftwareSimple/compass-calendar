import { parseGridDateTime } from "@core/util/date/parse-grid-datetime";
import { describe, expect, it } from "bun:test";

const denver = "America/Denver";

describe("parseGridDateTime", () => {
  it("parses Z instants in the calendar zone", () => {
    expect(parseGridDateTime("2026-11-01T01:00:00.000Z", denver).format()).toBe(
      "2026-10-31T19:00:00-06:00",
    );
  });

  it("parses naive strings as wall clock in the calendar zone on a UTC host", () => {
    const parsed = parseGridDateTime("2026-10-31T19:30:00", denver);
    expect(parsed.format()).toBe("2026-10-31T19:30:00-06:00");
  });

  it("parses offset strings as absolute instants", () => {
    expect(
      parseGridDateTime("2026-10-31T19:00:00-06:00", denver).format(),
    ).toBe("2026-10-31T19:00:00-06:00");
  });
});
