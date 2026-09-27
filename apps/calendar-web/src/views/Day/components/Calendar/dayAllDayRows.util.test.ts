import dayjs from "@core/util/date/dayjs";
import { type GridEvent } from "@web/common/types/web.event.types";
import {
  assignDayAllDayEventRows,
  isAllDayEventOnDay,
} from "./dayAllDayRows.util";
import { describe, expect, it } from "bun:test";

const allDay = (
  id: string,
  calendarId: string,
  overrides: Partial<GridEvent> = {},
): GridEvent =>
  ({
    _id: id,
    calendarId,
    endDate: "2026-05-21",
    isAllDay: true,
    startDate: "2026-05-20",
    title: id,
    ...overrides,
  }) as GridEvent;

describe("isAllDayEventOnDay", () => {
  const mondayAllDay = allDay("aw", "cal", {
    startDate: "2026-08-10",
    endDate: "2026-08-11",
  });
  const multiDay = allDay("span", "cal", {
    startDate: "2026-08-09",
    endDate: "2026-08-11",
  });

  it("shows a Monday all-day event on Monday and not Sunday", () => {
    expect(
      isAllDayEventOnDay(mondayAllDay, dayjs("2026-08-10T12:00:00-06:00")),
    ).toBe(true);
    expect(
      isAllDayEventOnDay(mondayAllDay, dayjs("2026-08-09T12:00:00-06:00")),
    ).toBe(false);
  });

  it("keeps a multi-day all-day event on every day it spans", () => {
    expect(isAllDayEventOnDay(multiDay, dayjs("2026-08-09"))).toBe(true);
    expect(isAllDayEventOnDay(multiDay, dayjs("2026-08-10"))).toBe(true);
    expect(isAllDayEventOnDay(multiDay, dayjs("2026-08-11"))).toBe(false);
  });

  it("uses date prefixes when start/end are UTC midnight instants", () => {
    const utcShaped = allDay("utc", "cal", {
      startDate: "2026-08-10T00:00:00.000Z",
      endDate: "2026-08-11T00:00:00.000Z",
    });
    expect(isAllDayEventOnDay(utcShaped, dayjs("2026-08-10"))).toBe(true);
    expect(isAllDayEventOnDay(utcShaped, dayjs("2026-08-09"))).toBe(false);
  });
});

describe("assignDayAllDayEventRows", () => {
  it("returns one row when there are no all-day events", () => {
    expect(assignDayAllDayEventRows([], () => 0)).toEqual({
      allDayEvents: [],
      rowsCount: 1,
    });
  });

  it("lets all-day events on different calendars share row 1", () => {
    const events = [
      allDay("a", "cal-a"),
      allDay("b", "cal-b"),
      allDay("c", "cal-c"),
    ];
    const columnById = new Map([
      ["cal-a", 0],
      ["cal-b", 1],
      ["cal-c", 2],
    ]);

    const { allDayEvents, rowsCount } = assignDayAllDayEventRows(
      events,
      (event) => columnById.get(event.calendarId!) ?? 0,
    );

    expect(rowsCount).toBe(1);
    expect(allDayEvents.map((event) => event.row)).toEqual([1, 1, 1]);
  });

  it("stacks multiple all-day events in the same calendar column", () => {
    const events = [
      allDay("a1", "cal-a"),
      allDay("a2", "cal-a"),
      allDay("b1", "cal-b"),
    ];
    const columnById = new Map([
      ["cal-a", 0],
      ["cal-b", 1],
    ]);

    const { allDayEvents, rowsCount } = assignDayAllDayEventRows(
      events,
      (event) => columnById.get(event.calendarId!) ?? 0,
    );

    expect(rowsCount).toBe(2);
    expect(allDayEvents.find((event) => event._id === "a1")?.row).toBe(1);
    expect(allDayEvents.find((event) => event._id === "a2")?.row).toBe(2);
    expect(allDayEvents.find((event) => event._id === "b1")?.row).toBe(1);
  });
});
