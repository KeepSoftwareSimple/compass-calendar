import { Origin } from "@core/constants/core.constants";
import {
  type Calendar,
  getCalendarCapabilities,
} from "@core/types/calendar.contracts";
import dayjs from "@core/util/date/dayjs";
import { type GridEvent } from "@web/common/types/web.event.types";
import { gridEventDefaultPosition } from "@web/common/utils/event/event.util";
import {
  resetEffectiveTimeZoneStoreForTests,
  setBrowserTimeZoneForTests,
} from "@web/timezone/effective-timezone.store";
import {
  calendarIdsWithVisibleEventsOnDay,
  getDayViewCalendars,
} from "./dayCalendarColumns.util";
import { afterEach, describe, expect, it } from "bun:test";

function makeCalendar(overrides: Partial<Calendar>): Calendar {
  return {
    id: "507f1f77bcf86cd799439011" as Calendar["id"],
    name: "Cal",
    description: "",
    timeZone: null,
    foregroundColor: "#000000",
    backgroundColor: "#ffffff",
    provider: "local",
    access: "owner",
    capabilities: {
      ...getCalendarCapabilities("owner"),
      canManage: false,
      canWatchEvents: false,
      canInviteAttendees: false,
    },
    isPrimary: false,
    isVisible: true,
    isActive: true,
    ...overrides,
  };
}

const dateInView = dayjs("2026-05-20T00:00:00.000");

const gridEvent = (
  overrides: Partial<GridEvent> & Pick<GridEvent, "_id">,
): GridEvent => ({
  description: "",
  endDate: "2026-05-20T10:00:00.000Z",
  isAllDay: false,
  origin: Origin.COMPASS,
  position: gridEventDefaultPosition,
  startDate: "2026-05-20T09:00:00.000Z",
  title: "Event",
  user: "",
  ...overrides,
});

describe("getDayViewCalendars", () => {
  const local = makeCalendar({ provider: "local", name: "Compass" });
  const google = makeCalendar({
    provider: "google",
    id: "507f1f77bcf86cd799439012" as Calendar["id"],
    name: "primary",
  });
  const extra = makeCalendar({
    id: "507f1f77bcf86cd799439013" as Calendar["id"],
    name: "empty",
  });

  it("returns only calendars with visible events on the day", () => {
    const timed = [
      gridEvent({
        _id: "a",
        calendarId: local.id,
      }),
    ];

    expect(
      getDayViewCalendars({
        allDayEvents: [],
        calendars: [local, google, extra],
        dateInView,
        hiddenEventIds: new Set(),
        timedEvents: timed,
      }),
    ).toEqual([local]);
  });

  it("counts all-day events on the displayed day", () => {
    const allDay = [
      gridEvent({
        _id: "ad",
        calendarId: google.id,
        isAllDay: true,
        startDate: "2026-05-20",
        endDate: "2026-05-21",
      }),
    ];

    expect(
      getDayViewCalendars({
        allDayEvents: allDay,
        calendars: [local, google],
        dateInView,
        hiddenEventIds: new Set(),
        timedEvents: [],
      }),
    ).toEqual([google]);
  });

  it("ignores individually hidden events", () => {
    const timed = [
      gridEvent({
        _id: "hidden-event",
        calendarId: google.id,
      }),
    ];

    expect(
      getDayViewCalendars({
        allDayEvents: [],
        calendars: [local, google],
        dateInView,
        hiddenEventIds: new Set(["hidden-event"]),
        timedEvents: timed,
      }),
    ).toEqual([local]);
  });

  it("keeps pinned calendars without visible events", () => {
    expect(
      getDayViewCalendars({
        allDayEvents: [],
        calendars: [local, google, extra],
        dateInView,
        hiddenEventIds: new Set(),
        pinnedCalendarIds: new Set([extra.id]),
        timedEvents: [],
      }),
    ).toEqual([extra]);
  });

  it("falls back to the default target calendar when the day has no visible events", () => {
    const primaryGoogle = makeCalendar({
      provider: "google",
      id: "507f1f77bcf86cd799439012" as Calendar["id"],
      name: "primary",
      isPrimary: true,
    });

    expect(
      getDayViewCalendars({
        allDayEvents: [],
        calendars: [local, primaryGoogle],
        dateInView,
        defaultTargetCalendar: primaryGoogle,
        hiddenEventIds: new Set(),
        timedEvents: [],
      }),
    ).toEqual([primaryGoogle]);
  });

  it("falls back to the primary calendar when none are visible", () => {
    const hiddenLocal = makeCalendar({
      provider: "local",
      name: "Compass",
      isVisible: false,
    });
    const primaryGoogle = makeCalendar({
      provider: "google",
      id: "507f1f77bcf86cd799439012" as Calendar["id"],
      name: "primary",
      isPrimary: true,
      isVisible: false,
    });

    expect(
      getDayViewCalendars({
        allDayEvents: [],
        calendars: [hiddenLocal, primaryGoogle],
        dateInView,
        hiddenEventIds: new Set(),
        timedEvents: [],
      }),
    ).toEqual([primaryGoogle]);
  });

  it("preserves calendar order from the eligible list", () => {
    const first = makeCalendar({
      id: "507f1f77bcf86cd799439014" as Calendar["id"],
      name: "A",
    });
    const second = makeCalendar({
      id: "507f1f77bcf86cd799439015" as Calendar["id"],
      name: "B",
    });
    const timed = [
      gridEvent({ _id: "1", calendarId: second.id }),
      gridEvent({ _id: "2", calendarId: first.id }),
    ];

    expect(
      getDayViewCalendars({
        allDayEvents: [],
        calendars: [first, second],
        dateInView,
        hiddenEventIds: new Set(),
        timedEvents: timed,
      }),
    ).toEqual([first, second]);
  });
});

describe("calendarIdsWithVisibleEventsOnDay", () => {
  afterEach(() => {
    resetEffectiveTimeZoneStoreForTests();
  });

  it("shows every stress calendar column when viewed day matches denver event day", () => {
    setBrowserTimeZoneForTests("UTC");
    const stressCalendars = Array.from({ length: 12 }, (_, index) =>
      makeCalendar({
        id: `f${String(index).padStart(23, "0")}` as Calendar["id"],
        name: `stress-${index}`,
        isPrimary: index === 0,
      }),
    );
    const dateInViewDenver = dayjs.tz("2026-11-11T17:23:00", "America/Denver");
    const timed = stressCalendars.map((calendar, index) =>
      gridEvent({
        _id: String(50 + index),
        calendarId: calendar.id,
        startDate: "2026-11-11 09:00:00.000",
        endDate: "2026-11-11 10:00:00.000",
        timeZone: "America/Denver",
      }),
    );

    expect(
      getDayViewCalendars({
        allDayEvents: [],
        calendars: stressCalendars,
        dateInView: dateInViewDenver,
        hiddenEventIds: new Set(),
        timedEvents: timed,
      }),
    ).toHaveLength(12);
  });

  it("falls back to primary when viewed utc day mismatches denver stress events", () => {
    setBrowserTimeZoneForTests("UTC");
    const stressCalendars = Array.from({ length: 12 }, (_, index) =>
      makeCalendar({
        id: `f${String(index).padStart(23, "0")}` as Calendar["id"],
        name: `stress-${index}`,
        isPrimary: index === 0,
      }),
    );
    const dateInViewUtc = dayjs.tz("2026-11-12T00:23:00", "UTC");
    const timed = stressCalendars.map((calendar, index) =>
      gridEvent({
        _id: String(50 + index),
        calendarId: calendar.id,
        startDate: "2026-11-11 09:00:00.000",
        endDate: "2026-11-11 10:00:00.000",
        timeZone: "America/Denver",
      }),
    );

    expect(
      getDayViewCalendars({
        allDayEvents: [],
        calendars: stressCalendars,
        dateInView: dateInViewUtc,
        hiddenEventIds: new Set(),
        timedEvents: timed,
      }),
    ).toHaveLength(1);
  });

  it("keeps both day columns at the merge-queue UTC boundary (browser UTC, no calendar hint)", () => {
    setBrowserTimeZoneForTests("UTC");
    const primary = makeCalendar({
      id: "507f1f77bcf86cd799439011" as Calendar["id"],
      name: "Acme",
      isPrimary: true,
    });
    const secondary = makeCalendar({
      id: "507f1f77bcf86cd799439012" as Calendar["id"],
      name: "Design",
    });
    const dateInViewBoundary = dayjs.tz(
      "2026-11-11T17:23:00",
      "America/Denver",
    );
    const timed = [
      gridEvent({
        _id: "a",
        calendarId: primary.id,
        startDate: "2026-11-11 09:00:00.000",
        endDate: "2026-11-11 10:30:00.000",
        timeZone: "America/Denver",
      }),
      gridEvent({
        _id: "b",
        calendarId: secondary.id,
        startDate: "2026-11-11 13:00:00.000",
        endDate: "2026-11-11 14:30:00.000",
        timeZone: "America/Denver",
      }),
    ];

    expect(
      getDayViewCalendars({
        allDayEvents: [],
        calendars: [primary, secondary],
        dateInView: dateInViewBoundary,
        hiddenEventIds: new Set(),
        timedEvents: timed,
      }).map((calendar) => calendar.name),
    ).toEqual(["Acme", "Design"]);
  });

  it("returns an empty set when every event is hidden", () => {
    const timed = [
      gridEvent({
        _id: "x",
        calendarId: "507f1f77bcf86cd799439011" as Calendar["id"],
      }),
    ];
    expect(
      calendarIdsWithVisibleEventsOnDay({
        allDayEvents: [],
        dateInView,
        hiddenEventIds: new Set(["x"]),
        timedEvents: timed,
      }).size,
    ).toBe(0);
  });
});
