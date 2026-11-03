import {
  allDayClickIntentContext,
  dayJumpKeycapsForDate,
} from "@web/views/Week/pointer-intent/allday-click-context";
import { teachingMessageForIntent } from "@web/views/Week/pointer-intent/pointer-intent";
import { describe, expect, it } from "bun:test";

describe("dayJumpKeycapsForDate", () => {
  it("maps each weekday to its Shift day-jump keycaps", () => {
    expect(dayJumpKeycapsForDate("2026-09-27")).toEqual(["Shift", "S", "U"]);
    expect(dayJumpKeycapsForDate("2026-09-28")).toEqual(["Shift", "M"]);
    expect(dayJumpKeycapsForDate("2026-09-30")).toEqual(["Shift", "W"]);
    expect(dayJumpKeycapsForDate("2026-10-01")).toEqual(["Shift", "R"]);
    expect(dayJumpKeycapsForDate("2026-10-03")).toEqual(["Shift", "S", "A"]);
  });
});

describe("allDayClickIntentContext", () => {
  it("teaches picking the day first in Week view", () => {
    const ctx = allDayClickIntentContext("2026-09-30", "/week");
    expect(ctx).toEqual({ dayKeycaps: ["Shift", "W"], dayLabel: "Wednesday" });
    expect(teachingMessageForIntent("allday-click", ctx)).toBe(
      "Press {0} to pick Wednesday, then {1} for an all-day event.",
    );
  });

  it("skips the day pick in Day view, which already targets one day", () => {
    const ctx = allDayClickIntentContext("2026-09-30", "/day/2026-09-30");
    expect(ctx).toEqual({});
    expect(teachingMessageForIntent("allday-click", ctx)).toBe(
      "Press {1} for an all-day event.",
    );
  });
});
