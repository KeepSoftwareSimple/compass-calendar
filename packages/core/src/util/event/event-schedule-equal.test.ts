import { eventSchedulesEqual } from "@core/util/event/event-schedule-equal";
import { describe, expect, it } from "bun:test";

describe("eventSchedulesEqual", () => {
  it("treats the same instant with different offsets as equal", () => {
    expect(
      eventSchedulesEqual(
        {
          kind: "timed",
          start: "2026-10-30T20:00:00-04:00" as never,
          end: "2026-10-30T21:00:00-04:00" as never,
          timeZone: "America/New_York" as never,
        },
        {
          kind: "timed",
          start: "2026-10-31T00:00:00.000Z" as never,
          end: "2026-10-31T01:00:00.000Z" as never,
          timeZone: "America/New_York" as never,
        },
      ),
    ).toBe(true);
  });
});
