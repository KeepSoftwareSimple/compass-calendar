import {
  type Calendar,
  getCalendarCapabilities,
} from "@core/types/calendar.contracts";
import { DateTimeSchema } from "@core/types/domain-primitives";
import { BusyPeriodSchema } from "@core/types/event.contracts";
import dayjs from "@core/util/date/dayjs";
import {
  buildCalendarLookup,
  resolveCalendarFocusColor,
} from "@web/calendars/useCalendarLookup";
import { assignEventsToRow } from "@web/common/utils/grid/assign.row";
import { ensureDesktopExportEnv } from "@web/desktop/export-fixtures/ensure-export-env";
import {
  EVENT_ALLDAY_GAP,
  EVENT_ALLDAY_ROW_HEIGHT,
  GRID_MARGIN_LEFT,
  TIMED_VISIBLE_HOURS,
} from "@web/grid/grid.constants";
import { splitBusyPeriodsByDay } from "@web/grid/layout/busy-period.layout";
import {
  getAllDayEventPosition,
  getBusyPeriodPosition,
  getTimedEventPosition,
} from "@web/grid/layout/event.position";
import {
  applyTimedEventDisplayPosition,
  createTimedEventLayout,
} from "@web/grid/layout/timed-deck.layout";
import { type GridVisibleDate } from "@web/grid/types/grid.types";
import { setPinnedTimeZone } from "@web/timezone/effective-timezone.store";
import { setTimeTravelZone } from "@web/timezone/time-travel.store";
import { getDayViewCalendars } from "@web/views/Day/components/Calendar/dayCalendarColumns.util";

const referenceNow = dayjs("2026-05-20T15:00:00.000Z");

const makeCalendar = (overrides: Partial<Calendar>): Calendar => ({
  access: "owner",
  backgroundColor: "#3b82f6",
  capabilities: getCalendarCapabilities("owner"),
  description: "",
  foregroundColor: "#ffffff",
  id: "507f1f77bcf86cd799439011" as Calendar["id"],
  isActive: true,
  isPrimary: true,
  isVisible: true,
  name: "Work",
  provider: "local",
  timeZone: null,
  ...overrides,
});

const calendarWork = makeCalendar({
  backgroundColor: "#3b82f6",
  name: "Work",
});

const calendarPersonal = makeCalendar({
  backgroundColor: "#22c55e",
  id: "507f1f77bcf86cd799439012" as Calendar["id"],
  isPrimary: false,
  name: "Personal",
});

const calendars = [calendarWork, calendarPersonal];

const columnIdentifier = (key: string) => `compass-grid-column-${key}`;
const eventIdentifier = (eventId: string) => `compass-grid-event-${eventId}`;

const allDayRowHeightPx = (rowsCount: number) => {
  const rows = Math.max(1, rowsCount);
  return 2 * EVENT_ALLDAY_GAP + rows * EVENT_ALLDAY_ROW_HEIGHT;
};

const buildVisibleDates = (keys: string[]): GridVisibleDate[] =>
  keys.map((key) => ({
    date: dayjs(`${key}T00:00:00.000`),
    key,
  }));

const buildSnapshot = ({
  colWidths,
  layoutMode,
  visibleDateKeys,
}: {
  colWidths: number[];
  layoutMode: "week" | "day";
  visibleDateKeys: string[];
}) => {
  const visibleDates = buildVisibleDates(visibleDateKeys);
  const hourHeight = 60;
  const timedGridHeight = TIMED_VISIBLE_HOURS * hourHeight;
  const lookup = buildCalendarLookup(calendars);

  const measurements = {
    allDayRow: null,
    colWidths,
    hourHeight,
    mainGrid: {
      bottom: timedGridHeight,
      height: timedGridHeight,
      left: 0,
      right:
        colWidths.reduce((sum, width) => sum + width, 0) + GRID_MARGIN_LEFT,
      top: 0,
      width:
        colWidths.reduce((sum, width) => sum + width, 0) + GRID_MARGIN_LEFT,
      x: 0,
      y: 0,
    },
  };

  const timedEvents = [
    {
      calendarId: calendarWork.id,
      endDate: "2026-05-20T10:00:00.000",
      eventId: "overlap-a",
      startDate: "2026-05-20T09:00:00.000",
      title: "Overlap A",
    },
    {
      calendarId: calendarWork.id,
      endDate: "2026-05-20T10:30:00.000",
      eventId: "overlap-b",
      startDate: "2026-05-20T09:30:00.000",
      title: "Overlap B",
    },
    {
      calendarId: calendarPersonal.id,
      endDate: "2026-05-20T12:00:00.000",
      eventId: "hidden-strip",
      startDate: "2026-05-20T11:00:00.000",
      title: "Hidden",
    },
  ];

  const allDayEvents = [
    {
      calendarId: calendarWork.id,
      endDate: "2026-05-22",
      eventId: "all-day-span",
      row: 1,
      startDate: "2026-05-19",
      title: "All-day span",
    },
  ];

  const hiddenEventIds = new Set(["hidden-strip"]);

  const dayCalendars = getDayViewCalendars(calendars);
  const columnIndexForCalendar = (calendarId: string) =>
    dayCalendars.findIndex((calendar) => calendar.id === calendarId);

  const columns =
    layoutMode === "day"
      ? dayCalendars.map((calendar, index) => ({
          accessibilityIdentifier: columnIdentifier(calendar.id),
          key: calendar.id,
          left:
            GRID_MARGIN_LEFT +
            colWidths.slice(0, index).reduce((sum, width) => sum + width, 0),
          width: colWidths[index] ?? 0,
        }))
      : visibleDates.map((visible, index) => ({
          accessibilityIdentifier: columnIdentifier(visible.key),
          key: visible.key,
          left:
            GRID_MARGIN_LEFT +
            colWidths.slice(0, index).reduce((sum, width) => sum + width, 0),
          width: colWidths[index] ?? 0,
        }));

  const allDayAssignment = assignEventsToRow(
    allDayEvents.map((event) => ({
      _id: event.eventId,
      endDate: event.endDate,
      isAllDay: true,
      row: event.row,
      startDate: event.startDate,
      title: event.title,
    })),
  );

  const cards: Array<{
    accessibilityIdentifier: string;
    eventId: string;
    fillColorHex: string | null;
    frame: ReturnType<typeof getTimedEventPosition>;
    isHiddenStrip: boolean;
    kind: "timed" | "allDay" | "busy";
    label: string;
    zIndex: number;
  }> = [];

  for (const event of allDayAssignment.allDayEvents) {
    const input = allDayEvents.find((row) => row.eventId === event._id);
    const columnIndex =
      layoutMode === "day" && input?.calendarId
        ? columnIndexForCalendar(input.calendarId)
        : undefined;
    const frame = getAllDayEventPosition(
      {
        endDate: event.endDate,
        isAllDay: true,
        row: event.row,
        startDate: event.startDate,
      } as never,
      {
        columnIndex,
        isDraft: false,
        measurements,
        visibleDates,
      },
    );
    const eventId = event._id ?? "unknown";
    cards.push({
      accessibilityIdentifier: eventIdentifier(eventId),
      eventId,
      fillColorHex:
        resolveCalendarFocusColor(lookup, { calendarId: input?.calendarId }) ??
        null,
      frame,
      isHiddenStrip: false,
      kind: "allDay",
      label: event.title ?? "Untitled",
      zIndex: 1,
    });
  }

  const deckLayout = createTimedEventLayout(
    timedEvents.map((event) => ({
      _id: event.eventId,
      endDate: event.endDate,
      isAllDay: false,
      startDate: event.startDate,
      title: event.title,
    })) as never,
    hiddenEventIds,
  );

  for (const item of deckLayout) {
    const timed = timedEvents.find((row) => row.eventId === item.event._id);
    if (!timed) continue;
    const columnIndex =
      layoutMode === "day" && timed.calendarId
        ? columnIndexForCalendar(timed.calendarId)
        : visibleDates.findIndex((visible) =>
            visible.date.isSame(dayjs(timed.startDate), "day"),
          );
    const base = getTimedEventPosition(
      {
        endDate: timed.endDate,
        isAllDay: false,
        startDate: timed.startDate,
      } as never,
      {
        columnIndex: layoutMode === "day" ? columnIndex : undefined,
        isDraft: false,
        measurements,
        visibleDates,
      },
    );
    const frame = applyTimedEventDisplayPosition(
      base,
      item.deckLayout,
      item.isHidden,
    );
    cards.push({
      accessibilityIdentifier: eventIdentifier(timed.eventId),
      eventId: timed.eventId,
      fillColorHex:
        resolveCalendarFocusColor(lookup, { calendarId: timed.calendarId }) ??
        null,
      frame,
      isHiddenStrip: item.isHidden,
      kind: "timed",
      label: timed.title,
      zIndex: frame.zIndex ?? 1,
    });
  }

  const busySegments = splitBusyPeriodsByDay(
    [
      BusyPeriodSchema.parse({
        calendarId: calendarWork.id,
        end: DateTimeSchema.parse("2026-05-20T11:30:00.000Z"),
        start: DateTimeSchema.parse("2026-05-20T10:30:00.000Z"),
      }),
    ],
    visibleDates,
  );

  for (const segment of busySegments) {
    const columnIndex =
      layoutMode === "day"
        ? columnIndexForCalendar(segment.calendarId)
        : visibleDates.findIndex((visible) => visible.key === "2026-05-20");
    const frame = getBusyPeriodPosition(segment, {
      columnIndex: layoutMode === "day" ? columnIndex : undefined,
      measurements,
      visibleDates,
    });
    cards.push({
      accessibilityIdentifier: eventIdentifier(segment.key),
      eventId: segment.key,
      fillColorHex:
        resolveCalendarFocusColor(lookup, { calendarId: segment.calendarId }) ??
        null,
      frame,
      isHiddenStrip: false,
      kind: "busy",
      label: "Busy",
      zIndex: 0,
    });
  }

  cards.sort((left, right) => {
    if (left.zIndex !== right.zIndex) return left.zIndex - right.zIndex;
    return left.eventId.localeCompare(right.eventId);
  });

  const nowDayKey = referenceNow.format("YYYY-MM-DD");
  const nowColumnIndex = visibleDates.findIndex(
    (visible) => visible.key === nowDayKey,
  );
  const nowLine =
    nowColumnIndex >= 0
      ? {
          columnIndex: nowColumnIndex,
          top:
            (referenceNow.diff(referenceNow.startOf("day"), "minute") / 60) *
            hourHeight,
        }
      : null;

  return {
    cards,
    columns,
    layoutMode,
    metrics: {
      allDayRowHeight: allDayRowHeightPx(allDayAssignment.rowsCount),
      colWidths,
      hourHeight,
      marginLeft: GRID_MARGIN_LEFT,
      timedGridHeight,
    },
    nowLine,
    visibleDayCount: visibleDates.length,
  };
};

const snapshotScenario = (
  id: string,
  input: {
    colWidths: number[];
    layoutMode: "week" | "day";
    visibleDateKeys: string[];
  },
) => ({
  id,
  input,
  output: buildSnapshot(input),
});

export const buildGridLayoutSnapshotFixtures = () => {
  ensureDesktopExportEnv();
  setPinnedTimeZone("UTC");
  setTimeTravelZone(null);

  return {
    scenarios: [
      snapshotScenario("grid-layout-1day", {
        colWidths: [320],
        layoutMode: "week",
        visibleDateKeys: ["2026-05-20"],
      }),
      snapshotScenario("grid-layout-3day", {
        colWidths: [320, 320, 320],
        layoutMode: "week",
        visibleDateKeys: ["2026-05-19", "2026-05-20", "2026-05-21"],
      }),
      snapshotScenario("grid-layout-7day", {
        colWidths: [100, 110, 120, 130, 140, 150, 160],
        layoutMode: "week",
        visibleDateKeys: [
          "2026-05-17",
          "2026-05-18",
          "2026-05-19",
          "2026-05-20",
          "2026-05-21",
          "2026-05-22",
          "2026-05-23",
        ],
      }),
      snapshotScenario("grid-layout-day-mode", {
        colWidths: [320, 320],
        layoutMode: "day",
        visibleDateKeys: ["2026-05-20"],
      }),
    ],
  };
};

export const emitGridLayoutSnapshotFixturesJson = (): string =>
  `${JSON.stringify(buildGridLayoutSnapshotFixtures(), null, 2)}\n`;
