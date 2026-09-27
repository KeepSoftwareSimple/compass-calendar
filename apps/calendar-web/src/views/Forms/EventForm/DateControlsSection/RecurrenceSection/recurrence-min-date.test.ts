import { recurrenceMinDateFromStart } from "./recurrence-min-date";
import { describe, expect, it } from "bun:test";

describe("recurrenceMinDateFromStart", () => {
  it("uses the start calendar day, not the end, when the event crosses midnight", () => {
    expect(
      recurrenceMinDateFromStart(new Date("2026-08-03T23:00:00.000Z")),
    ).toBe("2026-08-03");
    expect(
      recurrenceMinDateFromStart(new Date("2026-08-04T00:30:00.000Z")),
    ).toBe("2026-08-04");
  });
});
