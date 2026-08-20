import { act } from "react";
import dayjs from "@core/util/date/dayjs";
import {
  resetEffectiveTimeZoneStoreForTests,
  setPinnedTimeZone,
} from "@web/timezone/effective-timezone.store";
import {
  anchorDateForWindowOffset,
  computeVisibleDayCount,
  computeVisibleWindowOffset,
  isAllDayEventInVisibleDays,
  isTimedEventInVisibleDays,
  WEEK_DAY_COUNT,
} from "@web/views/Week/util/week-window.util";
import { afterEach, describe, expect, it } from "bun:test";

// Sunday-start week used across the tests
const weekStart = dayjs("2026-06-28T00:00:00.000");
const weekDay = (index: number) => weekStart.add(index, "day");
const windowDays = (offset: number, count: number) =>
  [...Array(count)].map((_, index) => weekDay(offset + index));

afterEach(() => {
  act(() => {
    resetEffectiveTimeZoneStoreForTests();
  });
});

describe("computeVisibleDayCount", () => {
  it("fits the full week on wide tracks", () => {
    expect(computeVisibleDayCount(1728)).toBe(7);
  });

  it("drops days as the track narrows instead of squishing columns", () => {
    // (850 - 50 margin) / 140 usable = 5.7 -> 5 days
    expect(computeVisibleDayCount(850)).toBe(5);
    expect(computeVisibleDayCount(520)).toBe(3);
  });

  it("never goes below one day or above seven", () => {
    expect(computeVisibleDayCount(0)).toBe(1);
    expect(computeVisibleDayCount(100000)).toBe(WEEK_DAY_COUNT);
  });

  it("subtracts a wider gutter when time travel is on", () => {
    // (890 - 50) / 140 = 6 days; (890 - 100) / 140 = 5 days
    expect(computeVisibleDayCount(890)).toBe(6);
    expect(computeVisibleDayCount(890, 100)).toBe(5);
  });
});

describe("computeVisibleWindowOffset", () => {
  it("is always 0 for a full week", () => {
    for (let anchorIndex = 0; anchorIndex < 7; anchorIndex++) {
      expect(
        computeVisibleWindowOffset({ anchorIndex, visibleDayCount: 7 }),
      ).toBe(0);
    }
  });

  it("centers the anchor day", () => {
    expect(
      computeVisibleWindowOffset({ anchorIndex: 3, visibleDayCount: 3 }),
    ).toBe(2); // Tue..Thu around Wed
  });

  it("clamps at the week boundaries", () => {
    expect(
      computeVisibleWindowOffset({ anchorIndex: 0, visibleDayCount: 3 }),
    ).toBe(0);
    expect(
      computeVisibleWindowOffset({ anchorIndex: 6, visibleDayCount: 3 }),
    ).toBe(4);
  });

  it("round-trips with anchorDateForWindowOffset", () => {
    for (let count = 1; count <= 7; count++) {
      const maxOffset = WEEK_DAY_COUNT - count;
      for (let offset = 0; offset <= maxOffset; offset++) {
        const anchor = anchorDateForWindowOffset({
          weekStart,
          windowOffset: offset,
          visibleDayCount: count,
        });
        expect(
          computeVisibleWindowOffset({
            anchorIndex: anchor.diff(weekStart, "day"),
            visibleDayCount: count,
          }),
        ).toBe(offset);
      }
    }
  });
});

describe("isTimedEventInVisibleDays", () => {
  const event = {
    startDate: weekDay(3).hour(10).format(),
    endDate: weekDay(3).hour(11).format(),
  };

  it("shows an event starting on a visible day", () => {
    expect(isTimedEventInVisibleDays(event, windowDays(2, 3))).toBe(true);
  });

  it("hides an event starting outside the window", () => {
    expect(isTimedEventInVisibleDays(event, windowDays(0, 3))).toBe(false);
    expect(isTimedEventInVisibleDays(event, windowDays(4, 3))).toBe(false);
  });
});

describe("isAllDayEventInVisibleDays", () => {
  // All-day events use exclusive end dates: Mon..Tue spans Mon only
  const singleDay = {
    startDate: weekDay(1).format("YYYY-MM-DD"),
    endDate: weekDay(2).format("YYYY-MM-DD"),
  };
  const multiDay = {
    startDate: weekDay(1).format("YYYY-MM-DD"),
    endDate: weekDay(5).format("YYYY-MM-DD"), // Mon..Thu inclusive
  };

  it("shows a single-day event on its own day", () => {
    expect(isAllDayEventInVisibleDays(singleDay, windowDays(0, 3))).toBe(true);
    expect(isAllDayEventInVisibleDays(singleDay, windowDays(2, 3))).toBe(false);
  });

  it("shows a multi-day event overlapping the window from either side", () => {
    expect(isAllDayEventInVisibleDays(multiDay, windowDays(0, 2))).toBe(true);
    expect(isAllDayEventInVisibleDays(multiDay, windowDays(3, 2))).toBe(true);
    expect(isAllDayEventInVisibleDays(multiDay, windowDays(5, 2))).toBe(false);
  });

  it("does not leak the exclusive end date into the next day", () => {
    // Ends (exclusively) on Friday: hidden in a Fri..Sat window
    expect(isAllDayEventInVisibleDays(multiDay, windowDays(5, 2))).toBe(false);
  });

  it("keeps a date-only all-day event on the pinned calendar day", () => {
    act(() => {
      setPinnedTimeZone("America/Chicago");
    });
    const chicagoWeek = Array.from({ length: 7 }, (_, index) =>
      dayjs.tz("2026-05-17", "America/Chicago").add(index, "day"),
    );

    expect(
      isAllDayEventInVisibleDays(
        { startDate: "2026-05-17", endDate: "2026-05-18" },
        chicagoWeek,
      ),
    ).toBe(true);
    expect(
      isAllDayEventInVisibleDays(
        { startDate: "2026-05-24", endDate: "2026-05-25" },
        chicagoWeek,
      ),
    ).toBe(false);
  });
});
