import { Origin } from "@core/constants/core.constants";
import {
  type Calendar,
  getCalendarCapabilities,
} from "@core/types/calendar.contracts";
import dayjs from "@core/util/date/dayjs";
import { type GridEvent } from "@web/common/types/web.event.types";
import { gridEventDefaultPosition } from "@web/common/utils/event/event.util";
import { isEventVisibleOnGrid } from "@web/events/visibility/filter-events-visible-on-grid";
import {
  getEffectiveTimeZone,
  resetEffectiveTimeZoneStoreForTests,
  setBrowserTimeZoneForTests,
} from "@web/timezone/effective-timezone.store";
import { inEffectiveTimeZone } from "@web/timezone/in-time-zone";
import { isAllDayEventOnDay } from "./dayAllDayRows.util";
import {
  calendarIdsWithVisibleEventsOnDay,
  getDayViewCalendars,
} from "./dayCalendarColumns.util";
import { afterEach, describe, expect, it } from "bun:test";

const CIVIL_DAY_FORMAT = "YYYY-MM-DD";

/** Pre-#5229 civil-day matching (main) kept in tests to prove the UTC-boundary miss. */
function legacyCalendarIdsWithVisibleEventsOnDay({
  allDayEvents,
  dateInView,
  hiddenEventIds,
  timedEvents,
}: {
  allDayEvents: GridEvent[];
  dateInView: dayjs.Dayjs;
  hiddenEventIds: ReadonlySet<string>;
  timedEvents: GridEvent[];
}): Set<Calendar["id"]> {
  const ids = new Set<Calendar["id"]>();
  const viewZone = getEffectiveTimeZone();
  const viewDay = inEffectiveTimeZone(dateInView, viewZone).format(
    CIVIL_DAY_FORMAT,
  );

  for (const event of timedEvents) {
    if (
      !event.calendarId ||
      !isEventVisibleOnGrid(event, hiddenEventIds) ||
      event.isAllDay
    ) {
      continue;
    }
    const eventDay = inEffectiveTimeZone(
      event.startDate,
      event.timeZone ?? viewZone,
    ).format(CIVIL_DAY_FORMAT);
    if (eventDay !== viewDay) continue;
    ids.add(event.calendarId);
  }

  for (const event of allDayEvents) {
    if (
      !event.calendarId ||
      !isEventVisibleOnGrid(event, hiddenEventIds) ||
      !isAllDayEventOnDay(event, dateInView)
    ) {
      continue;
    }
    ids.add(event.calendarId);
  }

  return ids;
}

function legacyGetDayViewCalendars(input: {
  allDayEvents: GridEvent[];
  calendars: Calendar[];
  dateInView: dayjs.Dayjs;
  defaultTargetCalendar?: Calendar;
  hiddenEventIds: ReadonlySet<string>;
  pinnedCalendarIds?: ReadonlySet<Calendar["id"]>;
  timedEvents: GridEvent[];
}): Calendar[] {
  const ordered = input.calendars.filter((c) => c.isActive && c.isVisible);
  const eventCalendarIds = legacyCalendarIdsWithVisibleEventsOnDay(input);
  const withEventsOrPinned = ordered.filter(
    (calendar) =>
      eventCalendarIds.has(calendar.id) ||
      input.pinnedCalendarIds?.has(calendar.id),
  );
  if (withEventsOrPinned.length > 0) return withEventsOrPinned;
  const fallback =
    input.defaultTargetCalendar ??
    ordered.find((c) => c.isPrimary) ??
    ordered[0] ??
    input.calendars[0];
  return fallback ? [fallback] : [];
}

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

  const mergeQueueBoundaryFixtures = () => {
    const primary = makeCalendar({
      id: "507f1f77bcf86cd799439011" as Calendar["id"],
      name: "Acme",
      isPrimary: true,
    });
    const secondary = makeCalendar({
      id: "507f1f77bcf86cd799439012" as Calendar["id"],
      name: "Design",
    });
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
    /** Nov 11 in Denver at 17:23 (00:23 UTC Nov 12); no calendar TZ hint, browser UTC. */
    const dateInView = dayjs.tz("2026-11-11T17:23:00", "America/Denver");
    const input = {
      allDayEvents: [] as GridEvent[],
      calendars: [primary, secondary],
      dateInView,
      hiddenEventIds: new Set<string>(),
      timedEvents: timed,
    };
    return { primary, secondary, input };
  };

  it("reproduces merge-queue UTC boundary: legacy civil-day match collapses to primary only", () => {
    setBrowserTimeZoneForTests("UTC");
    const { primary, secondary, input } = mergeQueueBoundaryFixtures();

    expect(
      legacyGetDayViewCalendars(input).map((calendar) => calendar.name),
    ).toEqual(["Acme"]);
    expect(getDayViewCalendars(input).map((calendar) => calendar.name)).toEqual(
      ["Acme", "Design"],
    );
    expect([primary, secondary].map((c) => c.name)).toEqual(["Acme", "Design"]);
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
