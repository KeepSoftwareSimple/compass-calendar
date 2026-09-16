import { QueryClientProvider } from "@tanstack/react-query";
import { type PropsWithChildren, useState } from "react";
import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import {
  type Calendar,
  getCalendarCapabilities,
} from "@core/types/calendar.contracts";
import {
  type CalendarId,
  CalendarIdSchema,
} from "@core/types/domain-primitives";
import { type BusyPeriod, BusyPeriodSchema } from "@core/types/event.contracts";
import { type AvailabilityResponse } from "@core/types/event-command.contracts";
import dayjs from "@core/util/date/dayjs";
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@web/__tests__/__mocks__/mock.render";
import { createCompassQueryClient } from "@web/api/query-client";
import { applyClientVisibility } from "@web/calendars/apply-client-visibility";
import {
  availabilityQueryOptions,
  deriveAvailabilityCalendarIds,
} from "@web/calendars/availability.query";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import { readHiddenCalendarIds } from "@web/calendars/calendar-visibility.storage";
import { setCalendarVisibility } from "@web/calendars/calendar-visibility.store";
import { toUTCOffset } from "@web/common/utils/datetime/web.date.util";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { useDraftStore } from "@web/events/stores/draft.store";
import { GridBusyPeriods } from "@web/grid/components/GridBusyPeriods";
import { WEEK_INTERACTION_EVENT_ID_ATTRIBUTE } from "@web/grid/interaction/view-event-registry";
import {
  type GridMeasurements,
  type GridVisibleDate,
} from "@web/grid/types/grid.types";
import { dayEventQueryRange } from "@web/views/Day/hooks/events/useDayEvents";
import { afterEach, describe, expect, it } from "bun:test";

let seededCalendars: Calendar[] = [];
let seededBusyPeriods: BusyPeriod[] = [];
let seededRange = { start: "", end: "" };

const dateInView = dayjs("2026-05-20T00:00:00.000");
const dayRange = dayEventQueryRange(dateInView);
const dayVisibleDates = [
  { date: dateInView, key: dateInView.format(YEAR_MONTH_DAY_FORMAT) },
];
const dayMeasurements = {
  allDayRow: null,
  colWidths: [180],
  hourHeight: 60,
  mainGrid: {
    bottom: 780,
    height: 780,
    left: 0,
    right: 180,
    top: 0,
    width: 180,
    x: 0,
    y: 0,
  },
} satisfies GridMeasurements;

const startOfView = dayjs("2024-01-14T00:00:00.000");
const weekDays = Array.from({ length: 7 }, (_, index) =>
  startOfView.add(index, "day"),
);
const weekRange = {
  start: toUTCOffset(startOfView),
  end: toUTCOffset(startOfView.endOf("week")),
};
const weekVisibleDates = weekDays.map((date) => ({
  date,
  key: date.format(YEAR_MONTH_DAY_FORMAT),
}));
const weekMeasurements = {
  allDayRow: null,
  colWidths: [100, 100, 100, 100, 100, 100, 100],
  hourHeight: 60,
  mainGrid: {
    bottom: 780,
    height: 780,
    left: 0,
    right: 700,
    top: 0,
    width: 700,
    x: 0,
    y: 0,
  },
} satisfies GridMeasurements;

function Provider({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => {
    const client = createCompassQueryClient();
    client.setQueryData(calendarQueryKeys.all, seededCalendars);

    const visibleCalendars = applyClientVisibility(
      seededCalendars,
      readHiddenCalendarIds(),
    );
    const calendarIds = deriveAvailabilityCalendarIds(visibleCalendars);
    const response: AvailabilityResponse = { busyPeriods: seededBusyPeriods };
    client.setQueryData(
      availabilityQueryOptions({
        calendarIds,
        start: seededRange.start,
        end: seededRange.end,
      }).queryKey,
      response,
    );

    return client;
  });

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  seededCalendars = [];
  seededBusyPeriods = [];
  seededRange = { start: "", end: "" };
});

const makeFreeBusyCalendar = (overrides: Partial<Calendar> = {}): Calendar => ({
  id: CalendarIdSchema.parse(createObjectIdString()),
  name: "Team Offsite",
  description: "",
  timeZone: null,
  foregroundColor: "#000000",
  backgroundColor: "#3b82f6",
  provider: "google",
  access: "freeBusyReader",
  capabilities: getCalendarCapabilities("freeBusyReader"),
  isPrimary: false,
  isVisible: true,
  isActive: true,
  ...overrides,
});

const makeBusyPeriod = (
  calendarId: CalendarId,
  overrides: Partial<{ start: string; end: string }> = {},
): BusyPeriod =>
  BusyPeriodSchema.parse({
    calendarId,
    start: "2024-01-15T09:00:00.000Z",
    end: "2024-01-15T10:00:00.000Z",
    ...overrides,
  });

const renderBusyPeriods = ({
  measurements,
  range,
  visibleDates,
  calendarColumnIndexById,
}: {
  measurements: GridMeasurements;
  range: { start: string; end: string };
  visibleDates: GridVisibleDate[];
  calendarColumnIndexById?: ReadonlyMap<string, number>;
}) => {
  seededRange = range;
  return render(
    <Provider>
      <GridBusyPeriods
        calendarColumnIndexById={calendarColumnIndexById}
        measurements={measurements}
        range={range}
        visibleDates={visibleDates}
      />
    </Provider>,
  );
};

describe("GridBusyPeriods", () => {
  it("renders a busy block with the calendar name and time range in its aria-label", () => {
    const calendar = makeFreeBusyCalendar();
    seededCalendars = [calendar];
    seededBusyPeriods = [
      BusyPeriodSchema.parse({
        calendarId: calendar.id,
        start: "2026-05-20T09:00:00.000Z",
        end: "2026-05-20T10:00:00.000Z",
      }),
    ];

    renderBusyPeriods({
      measurements: dayMeasurements,
      range: { start: dayRange.startDate, end: dayRange.endDate },
      visibleDates: dayVisibleDates,
    });

    expect(
      screen.getByRole("img", {
        name: /busy, team offsite calendar, .*9.*10.*am/i,
      }),
    ).toBeInTheDocument();
  });

  it("renders no busy blocks when the only seeded calendar is a hidden freeBusyReader calendar", () => {
    const hiddenCalendar = makeFreeBusyCalendar();
    setCalendarVisibility(hiddenCalendar.id, false);
    seededCalendars = [hiddenCalendar];
    seededBusyPeriods = [];

    renderBusyPeriods({
      measurements: dayMeasurements,
      range: { start: dayRange.startDate, end: dayRange.endDate },
      visibleDates: dayVisibleDates,
    });

    expect(
      screen.queryByRole("img", { name: /busy/i }),
    ).not.toBeInTheDocument();
  });

  it("renders no interactive affordances and does nothing to the draft store on click", () => {
    const calendar = makeFreeBusyCalendar();
    seededCalendars = [calendar];
    seededBusyPeriods = [makeBusyPeriod(calendar.id)];

    renderBusyPeriods({
      measurements: weekMeasurements,
      range: weekRange,
      visibleDates: weekVisibleDates,
    });

    const block = screen.getByRole("img", { name: /busy/i });
    expect(block).not.toHaveAttribute(WEEK_INTERACTION_EVENT_ID_ATTRIBUTE);
    expect(
      screen.queryByRole("button", { name: /busy/i }),
    ).not.toBeInTheDocument();

    const draftBefore = useDraftStore.getState();
    fireEvent.mouseDown(block, { button: 0, buttons: 1 });
    fireEvent.click(block);
    const draftAfter = useDraftStore.getState();

    expect(draftAfter.status?.activity ?? null).toBe(
      draftBefore.status?.activity ?? null,
    );
    expect(draftAfter.gridDraft).toBe(draftBefore.gridDraft);
  });

  it("splits a multi-day busy period into one block per day column", () => {
    const calendar = makeFreeBusyCalendar();
    seededCalendars = [calendar];
    seededBusyPeriods = [
      makeBusyPeriod(calendar.id, {
        start: "2024-01-15T20:00:00.000Z",
        end: "2024-01-16T04:00:00.000Z",
      }),
    ];

    renderBusyPeriods({
      measurements: weekMeasurements,
      range: weekRange,
      visibleDates: weekVisibleDates,
    });

    expect(screen.getAllByRole("img", { name: /busy/i })).toHaveLength(2);
  });

  it("renders no busy blocks when there are no qualifying freeBusyReader calendars", () => {
    seededCalendars = [];
    seededBusyPeriods = [];

    renderBusyPeriods({
      measurements: weekMeasurements,
      range: weekRange,
      visibleDates: weekVisibleDates,
    });

    expect(
      screen.queryByRole("img", { name: /busy/i }),
    ).not.toBeInTheDocument();
  });
});
