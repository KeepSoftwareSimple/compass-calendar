import dayjs from "@core/util/date/dayjs";
import {
  normalizePickerCursor,
  resolveMonthJumpCursor,
  startOfPickerWeek,
} from "./monthPickerCursor";
import { describe, expect, it } from "bun:test";

const fmt = (date: dayjs.Dayjs) => date.format("YYYY-MM-DD");

describe("startOfPickerWeek", () => {
  it("snaps to Sunday for a Sunday-start week", () => {
    expect(fmt(startOfPickerWeek(dayjs("2026-05-20"), 0))).toBe("2026-05-17");
    expect(fmt(startOfPickerWeek(dayjs("2026-05-17"), 0))).toBe("2026-05-17");
  });

  it("snaps to Monday for a Monday-start week, including Sundays", () => {
    expect(fmt(startOfPickerWeek(dayjs("2026-05-20"), 1))).toBe("2026-05-18");
    expect(fmt(startOfPickerWeek(dayjs("2026-05-17"), 1))).toBe("2026-05-11");
  });
});

describe("normalizePickerCursor", () => {
  it("leaves the day untouched in day mode", () => {
    expect(fmt(normalizePickerCursor(dayjs("2026-05-20"), "day", 0))).toBe(
      "2026-05-20",
    );
  });
});

describe("resolveMonthJumpCursor", () => {
  it("keeps the day-of-month, clamped to the shorter month", () => {
    expect(
      fmt(
        resolveMonthJumpCursor({
          cursor: dayjs("2026-01-31"),
          targetMonth: dayjs("2026-02-01"),
          unit: "day",
          weekStartDay: 0,
        }),
      ),
    ).toBe("2026-02-28");
  });

  it("snaps to the week start in week mode", () => {
    expect(
      fmt(
        resolveMonthJumpCursor({
          cursor: dayjs("2026-05-20"),
          targetMonth: dayjs("2026-06-01"),
          unit: "week",
          weekStartDay: 0,
        }),
      ),
    ).toBe("2026-06-14");
  });

  it("advances a week whose start falls in the previous month", () => {
    // June 1st 2026 is a Monday; its Sunday-start week begins May 31st.
    expect(
      fmt(
        resolveMonthJumpCursor({
          cursor: dayjs("2026-05-03"),
          targetMonth: dayjs("2026-06-01"),
          unit: "week",
          weekStartDay: 0,
        }),
      ),
    ).toBe("2026-06-07");
  });
});
