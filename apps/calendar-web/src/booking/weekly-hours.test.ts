import {
  DEFAULT_WEEKLY_AVAILABILITY,
  type WeeklyAvailability,
} from "@core/types/booking.contracts";
import { type IsoWeekday } from "@web/booking/booking.util";
import {
  addBlock,
  endOptions,
  formatTimeLabel,
  intervalsForDay,
  removeBlock,
  setDayAvailable,
  snapEndAfterStart,
  startOptions,
  summarizeAvailability,
  updateBlock,
} from "@web/booking/weekly-hours";
import { describe, expect, test } from "bun:test";

const tuesday = 2 as IsoWeekday;

describe("setDayAvailable", () => {
  test("adds 09:00 to 17:00 when turning a day on", () => {
    expect(setDayAvailable([], 6, true)).toEqual([
      { weekday: 6, start: "09:00", end: "17:00" },
    ]);
  });

  test("removes every interval of that day when turning off", () => {
    expect(setDayAvailable(DEFAULT_WEEKLY_AVAILABILITY, 1, false)).toEqual(
      DEFAULT_WEEKLY_AVAILABILITY.filter((entry) => entry.weekday !== 1),
    );
  });
});

describe("addBlock", () => {
  test("after 09:00 to 17:00 yields 18:00 to 19:00", () => {
    const monday = setDayAvailable([], 1, true);
    expect(addBlock(monday, 1)).toEqual([
      { weekday: 1, start: "09:00", end: "17:00" },
      { weekday: 1, start: "18:00", end: "19:00" },
    ]);
  });

  test("after a block ending 23:00 returns the input unchanged", () => {
    const value: WeeklyAvailability = [
      { weekday: 1 as IsoWeekday, start: "22:00", end: "23:00" },
    ];
    expect(addBlock(value, 1 as IsoWeekday)).toBe(value);
  });
});

describe("removeBlock", () => {
  test("drops the extra interval and keeps the first", () => {
    const withExtra = addBlock(setDayAvailable([], 1, true), 1);
    expect(removeBlock(withExtra, 1, 1)).toEqual([
      { weekday: 1, start: "09:00", end: "17:00" },
    ]);
  });
});

describe("updateBlock", () => {
  test("snaps end and clamps to the next block start", () => {
    const value = [
      { weekday: tuesday, start: "09:00", end: "12:00" },
      { weekday: tuesday, start: "13:00", end: "17:00" },
    ];
    expect(updateBlock(value, tuesday, 0, { start: "12:00" })).toEqual([
      { weekday: tuesday, start: "12:00", end: "13:00" },
      { weekday: tuesday, start: "13:00", end: "17:00" },
    ]);
  });
});

describe("startOptions and endOptions", () => {
  test("second block start options begin at the first block end", () => {
    const value = [
      { weekday: tuesday, start: "09:00", end: "12:00" },
      { weekday: tuesday, start: "13:00", end: "17:00" },
    ];
    expect(startOptions(value, tuesday, 1)[0]).toBe("12:00");
  });

  test("first block end options stop at the second block start", () => {
    const value = [
      { weekday: tuesday, start: "09:00", end: "12:00" },
      { weekday: tuesday, start: "13:00", end: "17:00" },
    ];
    const options = endOptions(value, tuesday, 0);
    expect(options[options.length - 1]).toBe("13:00");
    expect(options).not.toContain("13:15");
  });
});

describe("round-trip", () => {
  test("a two-block day round-trips unchanged", () => {
    const value = [
      { weekday: tuesday, start: "09:00", end: "12:00" },
      { weekday: tuesday, start: "13:00", end: "17:00" },
    ];
    expect(intervalsForDay(value, tuesday)).toEqual(value);
    expect(updateBlock(value, tuesday, 0, {})).toEqual(value);
  });
});

describe("snapEndAfterStart", () => {
  test("snaps End to Start plus one hour when Start passes it", () => {
    expect(snapEndAfterStart("17:00", "17:00")).toBe("18:00");
    expect(snapEndAfterStart("17:00", "16:45")).toBe("18:00");
    expect(snapEndAfterStart("09:00", "17:00")).toBe("17:00");
  });
});

describe("formatTimeLabel", () => {
  test("renders 12-hour labels", () => {
    expect(formatTimeLabel("09:00")).toBe("9:00 AM");
    expect(formatTimeLabel("17:00")).toBe("5:00 PM");
  });
});

describe("summarizeAvailability", () => {
  test("renders the default Mon-Fri span", () => {
    expect(summarizeAvailability(DEFAULT_WEEKLY_AVAILABILITY)).toBe(
      "Mon to Fri, 9:00 AM to 5:00 PM",
    );
  });

  test("renders a two-block day", () => {
    expect(
      summarizeAvailability([
        { weekday: tuesday, start: "09:00", end: "12:00" },
        { weekday: tuesday, start: "13:00", end: "17:00" },
      ]),
    ).toBe("Tue, 9:00 AM to 12:00 PM and 1:00 PM to 5:00 PM");
  });
});
