import { Origin } from "@core/constants/core.constants";
import {
  CalendarIdSchema,
  DateTimeSchema,
} from "@core/types/domain-primitives";
import { BusyPeriodSchema } from "@core/types/event.contracts";
import dayjs from "@core/util/date/dayjs";
import { type GridEvent } from "@web/common/types/web.event.types";
import { gridEventDefaultPosition } from "@web/common/utils/event/event.util";
import { ensureDesktopExportEnv } from "@web/desktop/export-fixtures/ensure-export-env";
import { splitBusyPeriodsByDay } from "@web/grid/layout/busy-period.layout";
import {
  getAllDayEventPosition,
  getBusyPeriodPosition,
  getTimedEventPosition,
} from "@web/grid/layout/event.position";
import {
  applyTimedDeckPosition,
  applyTimedEventDisplayPosition,
  createTimedEventLayout,
} from "@web/grid/layout/timed-deck.layout";
import { setPinnedTimeZone } from "@web/timezone/effective-timezone.store";
import { setTimeTravelZone } from "@web/timezone/time-travel.store";

const measurements = {
  allDayRow: null,
  colWidths: [320],
  hourHeight: 60,
  mainGrid: {
    bottom: 780,
    height: 780,
    left: 0,
    right: 320,
    top: 0,
    width: 320,
    x: 0,
    y: 0,
  },
};

const weekMeasurements = {
  ...measurements,
  colWidths: [100, 110, 120, 130, 140, 150, 160],
};

const visibleDates = [
  { date: dayjs("2026-05-20T00:00:00.000"), key: "2026-05-20" },
];

const weekVisibleDates = Array.from({ length: 7 }, (_, index) => {
  const date = dayjs("2026-05-17T00:00:00.000").add(index, "day");
  return {
    date,
    key: date.format("YYYY-MM-DD"),
  };
});

const createTimedEvent = (
  overrides: Partial<GridEvent> & {
    _id: string;
    startDate: string;
    endDate: string;
  },
): GridEvent => ({
  isAllDay: false,
  origin: Origin.COMPASS,
  recurrence: undefined,
  title: overrides._id,
  user: "user",
  ...overrides,
  position: { ...gridEventDefaultPosition, ...overrides.position },
});

export const buildTimedDeckFixtures = () => {
  ensureDesktopExportEnv();
  setPinnedTimeZone("UTC");
  setTimeTravelZone(null);

  const overlapEvents = [
    createTimedEvent({
      _id: "first",
      startDate: "2026-05-20T09:00:00",
      endDate: "2026-05-20T10:00:00",
    }),
    createTimedEvent({
      _id: "second",
      startDate: "2026-05-20T09:30:00",
      endDate: "2026-05-20T10:30:00",
    }),
  ];

  const deckLayout = createTimedEventLayout(overlapEvents);
  const basePosition = { height: 60, left: 20, top: 30, width: 180 };
  const deckPosition = applyTimedDeckPosition(basePosition, {
    order: 1,
    groupSize: 2,
  });

  const timedPosition = getTimedEventPosition(
    {
      endDate: "2026-05-20T10:00:00.000",
      isAllDay: false,
      position: { widthMultiplier: 1 },
      startDate: "2026-05-20T09:00:00.000",
    } as GridEvent,
    { measurements, visibleDates, isDraft: false },
  );

  const allDayPosition = getAllDayEventPosition(
    {
      endDate: "2026-05-22",
      isAllDay: true,
      row: 1,
      startDate: "2026-05-19",
    } as GridEvent,
    { measurements, visibleDates, isDraft: false },
  );

  const busySegments = splitBusyPeriodsByDay(
    [
      BusyPeriodSchema.parse({
        calendarId: CalendarIdSchema.parse("507f1f77bcf86cd799439011"),
        start: DateTimeSchema.parse("2026-05-20T09:00:00.000Z"),
        end: DateTimeSchema.parse("2026-05-20T10:30:00.000Z"),
      }),
    ],
    weekVisibleDates,
  );
  const busyPosition = getBusyPeriodPosition(
    busySegments[0] ?? { start: "", end: "" },
    {
      measurements: weekMeasurements,
      visibleDates: weekVisibleDates,
    },
  );

  const displayPosition = applyTimedEventDisplayPosition(
    timedPosition,
    { order: 0, groupSize: 2 },
    false,
  );

  return {
    cases: [
      {
        id: "createTimedEventLayout-overlap",
        input: {
          events: overlapEvents.map(({ _id, startDate, endDate }) => ({
            _id,
            startDate,
            endDate,
          })),
          hiddenEventIds: [],
        },
        output: deckLayout.map((item) => ({
          eventId: item.event._id,
          deckLayout: item.deckLayout,
          isHidden: item.isHidden,
        })),
      },
      {
        id: "applyTimedDeckPosition",
        input: {
          position: basePosition,
          deckLayout: { order: 1, groupSize: 2 },
        },
        output: deckPosition,
      },
      {
        id: "getTimedEventPosition",
        input: {
          startDate: "2026-05-20T09:00:00.000",
          endDate: "2026-05-20T10:00:00.000",
          measurements,
          visibleDates: visibleDates.map(({ key }) => key),
        },
        output: timedPosition,
      },
      {
        id: "getAllDayEventPosition",
        input: {
          startDate: "2026-05-19",
          endDate: "2026-05-22",
          row: 1,
          measurements,
          visibleDates: visibleDates.map(({ key }) => key),
        },
        output: allDayPosition,
      },
      {
        id: "getBusyPeriodPosition",
        input: {
          segment: busySegments[0],
          measurements: weekMeasurements,
          visibleDates: weekVisibleDates.map(({ key }) => key),
        },
        output: busyPosition,
      },
      {
        id: "applyTimedEventDisplayPosition",
        input: {
          position: timedPosition,
          deckLayout: { order: 0, groupSize: 2 },
          isHidden: false,
        },
        output: displayPosition,
      },
    ],
  };
};

export const emitTimedDeckFixturesJson = (): string =>
  `${JSON.stringify(buildTimedDeckFixtures(), null, 2)}\n`;
