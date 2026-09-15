import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import { type CompassEvent } from "@core/types/compass-event.contracts";
import { TimeZoneSchema } from "@core/types/domain-primitives";
import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import {
  computeCurrentEventDateRange,
  computeRelativeEventDateRange,
  filterTimeOption,
  getCalendarHeadingLabel,
  getColorsByHour,
  getHourLabels,
  getTimeOptionByValue,
  getTimesLabel,
  getWeekRangeLabel,
  mapToBackend,
  parseUserDate,
  parseUserTime,
  toUTCOffset,
  tryMapToBackend,
} from "@web/common/utils/datetime/web.date.util";
import { setPinnedTimeZone } from "@web/timezone/effective-timezone.store";
import { getFormDates } from "@web/views/Forms/EventForm/DateControlsSection/DateTimeSection/form.datetime.util";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  setSystemTime,
} from "bun:test";

describe("computeRelativeEventDateRange", () => {
  const baseEvent: CompassEvent = {
    _id: "test-id",
    startDate: "2024-03-19", // A Tuesday
    endDate: "2024-03-20",
  };

  // Helper function to format dates to YYYY-MM-DD
  const formatDate = (date: string | undefined) =>
    dayjs(date as string).format(YEAR_MONTH_DAY_FORMAT);

  // Set up fake timers
  beforeAll(() => {
    setSystemTime(new Date("2024-03-15")); // A Friday
  });

  afterAll(() => {
    setSystemTime();
  });
  describe("Week duration", () => {
    it("should set previous week dates", () => {
      const result = computeRelativeEventDateRange(
        { direction: "prev", duration: "week" },
        baseEvent,
      );

      expect(formatDate(result.startDate)).toBe("2024-03-10");
      expect(formatDate(result.endDate)).toBe("2024-03-16");
    });

    it("should set next week dates", () => {
      const result = computeRelativeEventDateRange(
        { direction: "next", duration: "week" },
        baseEvent,
      );

      expect(formatDate(result.startDate)).toBe("2024-03-24");
      expect(formatDate(result.endDate)).toBe("2024-03-30");
    });
  });

  describe("Month duration", () => {
    it("should set previous month dates", () => {
      const result = computeRelativeEventDateRange(
        { direction: "prev", duration: "month" },
        baseEvent,
      );

      expect(formatDate(result.startDate)).toBe("2024-02-01");
      expect(formatDate(result.endDate)).toBe("2024-02-29");
    });

    it("should set next month dates", () => {
      const result = computeRelativeEventDateRange(
        { direction: "next", duration: "month" },
        baseEvent,
      );

      expect(formatDate(result.startDate)).toBe("2024-04-01");
      expect(formatDate(result.endDate)).toBe("2024-04-30");
    });
  });

  describe("Edge cases", () => {
    it("should handle month transitions correctly", () => {
      const eventAtMonthEnd = {
        ...baseEvent,
        startDate: "2024-03-31", // Last day of March
        endDate: "2024-03-31",
      };

      const result = computeRelativeEventDateRange(
        { direction: "next", duration: "month" },
        eventAtMonthEnd,
      );

      expect(formatDate(result.startDate)).toBe("2024-04-01");
      expect(formatDate(result.endDate)).toBe("2024-04-30");
    });

    it("should handle week transitions across months", () => {
      const eventAtMonthTransition = {
        ...baseEvent,
        startDate: "2024-03-31", // Sunday, last day of March
        endDate: "2024-03-31",
      };

      const result = computeRelativeEventDateRange(
        { direction: "next", duration: "week" },
        eventAtMonthTransition,
      );

      expect(formatDate(result.startDate)).toBe("2024-04-07");
      expect(formatDate(result.endDate)).toBe("2024-04-13");
    });
  });
});

describe("computeCurrentEventDateRange", () => {
  const baseEvent: CompassEvent = {
    _id: "test-id",
    startDate: "2024-03-19", // A Tuesday
    endDate: "2024-03-20",
  };

  // Helper function to format dates to YYYY-MM-DD
  const formatDate = (date: string | undefined) =>
    dayjs(date as string).format(YEAR_MONTH_DAY_FORMAT);

  // Set up fake timers
  beforeAll(() => {
    setSystemTime(new Date("2024-03-15")); // A Friday
  });

  afterAll(() => {
    setSystemTime();
  });

  describe("Week duration", () => {
    it("should use exact week range provided", () => {
      const weekViewRange = {
        startDate: "2024-06-30",
        endDate: "2024-07-06",
      };

      const result = computeCurrentEventDateRange(
        { duration: "week" },
        baseEvent,
        weekViewRange,
      );

      expect(formatDate(result.startDate)).toBe("2024-06-30");
      expect(formatDate(result.endDate)).toBe("2024-07-06");
    });
  });

  describe("Month duration", () => {
    it("should set current month dates", () => {
      const weekViewRange = {
        startDate: "2024-06-30",
        endDate: "2024-07-06",
      };

      const result = computeCurrentEventDateRange(
        { duration: "month" },
        baseEvent,
        weekViewRange,
      );

      expect(formatDate(result.startDate)).toBe("2024-06-01");
      expect(formatDate(result.endDate)).toBe("2024-06-30");
    });
  });

  describe("Edge cases", () => {
    it("should preserve other event properties", () => {
      const eventWithProps = {
        ...baseEvent,
        title: "Test Event",
        description: "Test Description",
        isAllDay: true,
      };

      const weekViewRange = {
        startDate: "2024-06-30",
        endDate: "2024-07-06",
      };

      const result = computeCurrentEventDateRange(
        { duration: "week" },
        eventWithProps,
        weekViewRange,
      );

      expect(formatDate(result.startDate)).toBe("2024-06-30");
      expect(formatDate(result.endDate)).toBe("2024-07-06");
      expect(result.title).toBe(eventWithProps.title);
      expect(result.description).toBe(eventWithProps.description);
      expect(result.isAllDay).toBe(eventWithProps.isAllDay);
    });
  });
  describe("getWeekRangeLabel", () => {
    it("should return 'M.D - D' format when week is within single month", () => {
      const weekInViewStart = dayjs("2025-01-05");
      const weekInViewEnd = dayjs("2025-01-11");
      const label = getWeekRangeLabel(weekInViewStart, weekInViewEnd);
      const expectedLabel = "1.5 - 11";
      expect(label).toBe(expectedLabel);
    });

    it("should return 'M.D - M.D' format when week covers two months", () => {
      const weekInViewStart = dayjs("2024-12-29");
      const weekInViewEnd = dayjs("2025-01-4");
      const label = getWeekRangeLabel(weekInViewStart, weekInViewEnd);
      const expectedLabel = "12.29 - 1.4";
      expect(label).toBe(expectedLabel);
    });
  });

  describe("getCalendarHeadingLabel", () => {
    it("should return month and year", () => {
      const today = dayjs("2024-12-30");
      const weekInViewStart = dayjs("2025-01-05");
      const weekInViewEnd = dayjs("2025-01-11");
      const label = getCalendarHeadingLabel(
        weekInViewStart,
        weekInViewEnd,
        today,
      );
      const expectedlabel = "January 2025";
      expect(label).toBe(expectedlabel);
    });

    it("should return 'MMM yy - MMM yy' format when week covers two months", () => {
      const today = dayjs("2024-12-30");
      const weekInViewStart = dayjs("2024-12-29");
      const weekInViewEnd = dayjs("2025-01-04");
      const label = getCalendarHeadingLabel(
        weekInViewStart,
        weekInViewEnd,
        today,
      );
      const expectedlabel = "Dec 24 - Jan 25";
      expect(label).toBe(expectedlabel);
    });
  });
});

const getColorTotals = (colors: string[]) => {
  const uniqueColors = Array.from(new Set(colors));

  const color1 = colors.filter((c) => c === uniqueColors[0]);
  const color2 = colors.filter((c) => c === uniqueColors[1]);
  const colorTotals = [color1.length, color2.length];
  return colorTotals;
};

describe("getTimesLabel", () => {
  it("collapses the shared meridiem without leaving a double space", () => {
    const label = getTimesLabel("2025-01-05 09:00", "2025-01-05 10:00");
    expect(label).toBe("9 - 10 AM");
  });

  it("keeps both meridiems when the range crosses noon", () => {
    const label = getTimesLabel("2025-01-05 11:00", "2025-01-05 13:00");
    expect(label).toBe("11 AM - 1 PM");
  });
});

describe("getHourLabels", () => {
  it("has 23 intervals by default (excludes midnight)", () => {
    const dayTimes = getHourLabels();
    expect(dayTimes).toHaveLength(23);
    expect(dayTimes[0]).toBe("1 AM");
    expect(dayTimes[dayTimes.length - 1]).toBe("11 PM");

    const expected = [
      "1 AM",
      "2 AM",
      "3 AM",
      "4 AM",
      "5 AM",
      "6 AM",
      "7 AM",
      "8 AM",
      "9 AM",
      "10 AM",
      "11 AM",
      "12 PM",
      "1 PM",
      "2 PM",
      "3 PM",
      "4 PM",
      "5 PM",
      "6 PM",
      "7 PM",
      "8 PM",
      "9 PM",
      "10 PM",
      "11 PM",
    ];
    expect(dayTimes).toEqual(expected);
  });

  it("has 24 intervals when includeMidnight is true", () => {
    const dayTimes = getHourLabels(true);
    expect(dayTimes).toHaveLength(24);
    expect(dayTimes[0]).toBe("1 AM");
    expect(dayTimes[dayTimes.length - 1]).toBe("12 AM");

    const expected = [
      "1 AM",
      "2 AM",
      "3 AM",
      "4 AM",
      "5 AM",
      "6 AM",
      "7 AM",
      "8 AM",
      "9 AM",
      "10 AM",
      "11 AM",
      "12 PM",
      "1 PM",
      "2 PM",
      "3 PM",
      "4 PM",
      "5 PM",
      "6 PM",
      "7 PM",
      "8 PM",
      "9 PM",
      "10 PM",
      "11 PM",
      "12 AM",
    ];
    expect(dayTimes).toEqual(expected);
  });
});

describe("getColorsByHour", () => {
  it("has 24 intervals", () => {
    const colors = getColorsByHour(dayjs().hour());
    expect(colors).toHaveLength(24);
  });

  it("uses two colors", () => {
    const colors = getColorsByHour(20);
    expect(new Set(colors).size).toBe(2);
  });

  it("only highlights one hour (noon)", () => {
    const colors = getColorsByHour(12);
    const colorTotals = getColorTotals(colors);
    expect(colorTotals).toContain(23);
    expect(colorTotals).toContain(1);
  });

  it("doesn't highlight any when midnight hour", () => {
    const colors = getColorsByHour(0);
    const colorTotals = getColorTotals(colors);
    expect(colorTotals).toEqual([24, 0]);
  });

  it("returns same order for minute 0 to 59", () => {
    const day1 = dayjs("2022-04-04T00:00:00.000Z");
    const day2 = dayjs("2022-04-04T00:59:00.000Z");
    const day1Colors = getColorsByHour(day1.hour());
    const day2Colors = getColorsByHour(day2.hour());

    expect(day1Colors).toEqual(day2Colors);
  });

  it("changes at the top of the hour", () => {
    const day1 = dayjs("2022-04-04T23:59:59.000Z").hour();
    const day2 = dayjs("2022-04-05T00:00:00.000Z").hour();
    const day1Colors = getColorsByHour(day1);
    const day2Colors = getColorsByHour(day2);

    expect(day1Colors).not.toEqual(day2Colors);
  });
});

describe("toUTCOffset", () => {
  const validateResult = (result: string) => {
    const offsetChar = result.slice(-6, -5);
    const hasOffsetChar = offsetChar === "+" || offsetChar === "-";
    expect(hasOffsetChar).toBe(true);

    // Z is used for pure UTC timestamps (which don't use an offset)
    expect(result.slice(-1)).not.toEqual("Z");
  };
  it("includes a TZ offset - when passing str with times", () => {
    const result = toUTCOffset("2022-01-01 10:00");
    validateResult(result);
  });
  it("includes a TZ offset - when passing string YYYY-MM (no times) ", () => {
    const result = toUTCOffset("2022-05-21");
    validateResult(result);
  });

  it("includes a TZ offset - when passing Date object", () => {
    const result = toUTCOffset(new Date());
    validateResult(result);
  });

  it("includes a TZ offset - when passing a dayjs object", () => {
    const d = dayjs();
    const resultFromDayJsObj = toUTCOffset(d);
    validateResult(resultFromDayJsObj);
  });
});

describe("parseUserTime", () => {
  it("parses 'HH:MM' format to correct time", () => {
    const result = parseUserTime("10:33");
    expect(result?.value).toBe("10:33 AM");
    expect(result?.label).toBe("10:33 AM");
  });

  it("parses 'HH:MM am/pm' format with explicit meridiem", () => {
    const result = parseUserTime("10:33 pm");
    expect(result?.value).toBe("10:33 PM");
    expect(result?.label).toBe("10:33 PM");
  });

  it("parses glued meridiem format (e.g., '10:33pm')", () => {
    const result = parseUserTime("10:33pm");
    expect(result?.value).toBe("10:33 PM");
    expect(result?.label).toBe("10:33 PM");
  });

  it("parses a bare hour with a single-letter meridiem", () => {
    expect(parseUserTime("8p")?.value).toBe("8:00 PM");
    expect(parseUserTime("8a")?.value).toBe("8:00 AM");
    expect(parseUserTime("8pm")?.label).toBe("8 PM");
  });

  it("parses 24-hour format", () => {
    const result = parseUserTime("22:33");
    expect(result?.value).toBe("10:33 PM");
    expect(result?.label).toBe("10:33 PM");
  });

  it("parses bare hour as AM:00", () => {
    const result = parseUserTime("7");
    expect(result?.value).toBe("7:00 AM");
    expect(result?.label).toBe("7 AM");
  });

  it("parses digits-only input (HHMM format)", () => {
    const result = parseUserTime("1033");
    expect(result?.value).toBe("10:33 AM");
    expect(result?.label).toBe("10:33 AM");
  });

  it("parses 12 o'clock times correctly", () => {
    const result = parseUserTime("12:33");
    expect(result?.value).toBe("12:33 PM");
    expect(result?.label).toBe("12:33 PM");
  });

  it("inherits meridiem from currentValue when ambiguous", () => {
    const result = parseUserTime("2:33", "2:15 PM");
    expect(result?.value).toBe("2:33 PM");
  });

  it("inherits AM meridiem from currentValue", () => {
    const result = parseUserTime("7:30", "7:00 AM");
    expect(result?.value).toBe("7:30 AM");
  });

  it("explicit meridiem overrides currentValue meridiem", () => {
    const result = parseUserTime("2:33 am", "2:15 PM");
    expect(result?.value).toBe("2:33 AM");
  });

  it("24-hour format ignores currentValue meridiem", () => {
    const result = parseUserTime("14:33", "2:15 AM");
    expect(result?.value).toBe("2:33 PM");
  });

  it("rejects empty input", () => {
    const result = parseUserTime("");
    expect(result).toBeNull();
  });

  it("rejects invalid time strings", () => {
    expect(parseUserTime("abc")).toBeNull();
  });

  it("rejects invalid hour (25:00)", () => {
    expect(parseUserTime("25:00")).toBeNull();
  });

  it("rejects invalid minute (10:71)", () => {
    expect(parseUserTime("10:71")).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(parseUserTime(":33")).toBeNull();
    expect(parseUserTime("10:")).toBeNull();
  });

  it("handles case-insensitivity", () => {
    const result = parseUserTime("10:33 PM");
    expect(result?.value).toBe("10:33 PM");
  });

  it("handles extra whitespace", () => {
    const result = parseUserTime("  10:33   pm  ");
    expect(result?.value).toBe("10:33 PM");
  });

  it("correctly normalizes 10:00 to label '10 AM' (strips :00)", () => {
    const result = parseUserTime("10:00");
    expect(result?.label).toBe("10 AM");
  });
});

describe("filterTimeOption", () => {
  const twoAm = { label: "2 AM", value: "2:00 AM" };
  const twelveAm = { label: "12 AM", value: "12:00 AM" };
  const eightPm = { label: "8 PM", value: "8:00 PM" };
  const twelveFortyFiveAm = { label: "12:45 AM", value: "12:45 AM" };
  const twelveFortyFivePm = { label: "12:45 PM", value: "12:45 PM" };

  it("keeps only the parsed time when input parses", () => {
    expect(filterTimeOption(twoAm, "2", "9:45 AM")).toBe(true);
    expect(filterTimeOption(twelveAm, "2", "9:45 AM")).toBe(false);
  });

  it("matches glued meridiem like 8p to 8 PM", () => {
    expect(filterTimeOption(eightPm, "8p", "1:00 PM")).toBe(true);
    expect(filterTimeOption(twoAm, "8p", "1:00 PM")).toBe(false);
  });

  it("falls back to substring when input does not parse", () => {
    expect(filterTimeOption(twelveFortyFiveAm, "12:4")).toBe(true);
    expect(filterTimeOption(twelveFortyFivePm, "12:4")).toBe(true);
    expect(filterTimeOption(twoAm, "12:4")).toBe(false);
  });

  it("shows every option when the filter is empty", () => {
    expect(filterTimeOption(twoAm, "")).toBe(true);
    expect(filterTimeOption(twelveAm, "")).toBe(true);
  });
});

describe("mapToBackend timed overnight", () => {
  it("keeps an overnight end on the next calendar day", () => {
    const start = dayjs("2026-08-11T23:30:00");
    const end = start.add(1, "hour");
    const form = getFormDates(start.format(), end.format());

    const schedule = mapToBackend({
      startDate: form.startDate,
      endDate: form.endDate,
      startTime: form.startTime,
      endTime: form.endTime,
      isAllDay: false,
    });

    expect(schedule.kind).toBe("timed");
    if (schedule.kind !== "timed") return;

    expect(dayjs(schedule.end).isAfter(dayjs(schedule.start))).toBe(true);
    expect(dayjs(schedule.start).format("YYYY-MM-DD HH:mm")).toBe(
      "2026-08-11 23:30",
    );
    expect(dayjs(schedule.end).format("YYYY-MM-DD HH:mm")).toBe(
      "2026-08-12 00:30",
    );
  });

  it("still stamps same-day timed ends onto the start calendar day", () => {
    const start = dayjs("2026-08-11T14:00:00");
    const end = start.add(1, "hour");
    const form = getFormDates(start.format(), end.format());

    const schedule = mapToBackend({
      startDate: form.startDate,
      endDate: form.endDate,
      startTime: form.startTime,
      endTime: form.endTime,
      isAllDay: false,
    });

    expect(schedule.kind).toBe("timed");
    if (schedule.kind !== "timed") return;

    expect(dayjs(schedule.start).format("YYYY-MM-DD HH:mm")).toBe(
      "2026-08-11 14:00",
    );
    expect(dayjs(schedule.end).format("YYYY-MM-DD HH:mm")).toBe(
      "2026-08-11 15:00",
    );
  });

  it("accepts explicit same-day start/end dates with same-day clock times", () => {
    const day = dayjs("2026-08-11T00:00:00");
    const schedule = mapToBackend({
      startDate: day.toDate(),
      endDate: day.toDate(),
      startTime: getTimeOptionByValue(day.hour(9).minute(0)),
      endTime: getTimeOptionByValue(day.hour(10).minute(0)),
      isAllDay: false,
    });

    expect(schedule.kind).toBe("timed");
    if (schedule.kind !== "timed") return;
    expect(dayjs(schedule.end).isAfter(dayjs(schedule.start))).toBe(true);
  });

  it("does not throw when timed end is before start; tryMapToBackend reports failure", () => {
    const day = dayjs("2026-08-11T00:00:00");
    const selected = {
      startDate: day.toDate(),
      endDate: day.toDate(),
      startTime: getTimeOptionByValue(day.hour(15).minute(0)),
      endTime: getTimeOptionByValue(day.hour(14).minute(0)),
      isAllDay: false,
    };

    expect(() => mapToBackend(selected)).toThrow();
    expect(tryMapToBackend(selected).ok).toBe(false);
  });

  it("stamps the pinned timezone on new timed events", () => {
    setPinnedTimeZone("America/Chicago");

    const day = dayjs("2026-08-11T00:00:00");
    const schedule = mapToBackend({
      startDate: day.toDate(),
      endDate: day.toDate(),
      startTime: getTimeOptionByValue(day.hour(9).minute(0)),
      endTime: getTimeOptionByValue(day.hour(10).minute(0)),
      isAllDay: false,
    });

    expect(schedule.kind).toBe("timed");
    if (schedule.kind !== "timed") return;
    expect(schedule.timeZone).toBe(TimeZoneSchema.parse("America/Chicago"));
  });
});

describe("parseUserDate", () => {
  const now = dayjs("2026-09-15T12:00:00.000Z");
  const ymd = (value: Dayjs | null) => value?.format(YEAR_MONTH_DAY_FORMAT);

  it.each([
    ["2026-10-03", "2026-10-03"],
    ["10/3", "2026-10-03"],
    ["10/3/2026", "2026-10-03"],
    ["10/3/26", "2026-10-03"],
    ["oct 3", "2026-10-03"],
    ["3 oct", "2026-10-03"],
    ["october 3 2026", "2026-10-03"],
  ] as const)("parses %s", (input, expected) => {
    expect(ymd(parseUserDate(input, now))).toBe(expected);
  });

  it.each(["13/1", "oct", "hello"] as const)("rejects %s", (input) => {
    expect(parseUserDate(input, now)).toBeNull();
  });

  it("uses next year when an omitted year is more than six months in the past", () => {
    expect(ymd(parseUserDate("jan 3", now))).toBe("2027-01-03");
    expect(ymd(parseUserDate("mar 14", now))).toBe("2027-03-14");
    expect(ymd(parseUserDate("mar 15", now))).toBe("2026-03-15");
  });
});
