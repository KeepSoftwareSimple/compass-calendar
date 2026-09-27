import { type BusyPeriod, BusyPeriodSchema } from "@core/types/event.contracts";
import dayjs from "@core/util/date/dayjs";
import { splitBusyPeriodsByDay } from "./busy-period.layout";
import { describe, expect, it } from "bun:test";

const weekVisibleDates = Array.from({ length: 7 }, (_, index) => {
  const date = dayjs("2026-05-17T00:00:00.000").add(index, "day");

  return { date, key: date.format("YYYY-MM-DD") };
});

// Overrides take plain strings (not branded CalendarId/DateTime) - parsing
// through BusyPeriodSchema brands them, so callers below don't need an `as`
// cast per fixture.
const makeBusyPeriod = (
  overrides: Partial<{ calendarId: string; start: string; end: string }> = {},
): BusyPeriod =>
  BusyPeriodSchema.parse({
    calendarId: "507f1f77bcf86cd799439011",
    start: "2026-05-19T09:00:00.000Z",
    end: "2026-05-19T10:00:00.000Z",
    ...overrides,
  });

describe("splitBusyPeriodsByDay", () => {
  it("produces one segment for a period contained within a single day", () => {
    const period = makeBusyPeriod();

    const segments = splitBusyPeriodsByDay([period], weekVisibleDates);

    expect(segments).toHaveLength(1);
    expect(segments[0]?.calendarId).toBe(period.calendarId);
    // dayjs' .format() round-trips "Z" to "+00:00" - both are valid
    // DateTimeSchema values, so compare instants rather than raw strings.
    expect(dayjs(segments[0]?.start).isSame(dayjs(period.start))).toBe(true);
    expect(dayjs(segments[0]?.end).isSame(dayjs(period.end))).toBe(true);
  });

  it("splits a two-day period into two segments, each clamped to its day's boundary", () => {
    const period = makeBusyPeriod({
      start: "2026-05-19T20:00:00.000Z",
      end: "2026-05-20T04:00:00.000Z",
    });

    const segments = splitBusyPeriodsByDay([period], weekVisibleDates);

    expect(segments).toHaveLength(2);

    // Segments serialize via dayjs' bare .format() (matches toUTCOffset
    // elsewhere in the app), which omits milliseconds - so a boundary at
    // endOf("day") (…23:59:59.999) round-trips as …23:59:59.000. Irrelevant
    // to rendering (position math diffs in whole minutes), so these compare
    // at "second" granularity rather than exact instants.
    const [first, second] = segments;
    expect(dayjs(first?.start).isSame(dayjs(period.start), "second")).toBe(
      true,
    );
    expect(
      dayjs(first?.end).isSame(dayjs("2026-05-19T23:59:59.999Z"), "second"),
    ).toBe(true);
    expect(
      dayjs(second?.start).isSame(dayjs("2026-05-20T00:00:00.000Z"), "second"),
    ).toBe(true);
    expect(dayjs(second?.end).isSame(dayjs(period.end), "second")).toBe(true);
  });

  it("splits a period spanning several full days into one segment per day", () => {
    const period = makeBusyPeriod({
      start: "2026-05-18T00:00:00.000Z",
      end: "2026-05-21T00:00:00.000Z",
    });

    const segments = splitBusyPeriodsByDay([period], weekVisibleDates);

    // 05-18, 05-19, 05-20 each get a full-day segment; the period ends
    // exactly at 05-21's midnight, so it doesn't overlap that day.
    expect(segments).toHaveLength(3);
    expect(segments.map((segment) => segment.key)).toEqual([
      expect.stringContaining("2026-05-18"),
      expect.stringContaining("2026-05-19"),
      expect.stringContaining("2026-05-20"),
    ]);
  });

  it("produces no segments for a period entirely outside the visible days", () => {
    const period = makeBusyPeriod({
      start: "2026-06-01T09:00:00.000Z",
      end: "2026-06-01T10:00:00.000Z",
    });

    expect(splitBusyPeriodsByDay([period], weekVisibleDates)).toEqual([]);
  });

  it("keeps segments from different calendars independent", () => {
    const calendarA = makeBusyPeriod({
      calendarId: "507f1f77bcf86cd799439011",
    });
    const calendarB = makeBusyPeriod({
      calendarId: "507f1f77bcf86cd799439012",
      start: "2026-05-19T11:00:00.000Z",
      end: "2026-05-19T12:00:00.000Z",
    });

    const segments = splitBusyPeriodsByDay(
      [calendarA, calendarB],
      weekVisibleDates,
    );

    expect(segments).toHaveLength(2);
    expect(new Set(segments.map((segment) => segment.calendarId))).toEqual(
      new Set([calendarA.calendarId, calendarB.calendarId]),
    );
  });
});
