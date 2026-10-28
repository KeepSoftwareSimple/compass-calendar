import { QueryClientProvider } from "@tanstack/react-query";
import { type PropsWithChildren, useState } from "react";
import { EventIdSchema } from "@core/types/domain-primitives";
import { type Event, EventScheduleSchema } from "@core/types/event.contracts";
import dayjs from "@core/util/date/dayjs";
import { cleanup, render, screen } from "@web/__tests__/__mocks__/mock.render";
import { seedEventQueries } from "@web/__tests__/utils/event-query-test-data";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { createCompassQueryClient } from "@web/api/query-client";
import { DECK_INDENT } from "@web/grid/grid.constants";
import {
  resetEffectiveTimeZoneStoreForTests,
  setPinnedTimeZone,
} from "@web/timezone/effective-timezone.store";
import { type Measurements_Grid } from "@web/views/Week/hooks/grid/useGridLayout";
import { afterEach, describe, expect, it } from "bun:test";
import "@testing-library/jest-dom";
import { MainGridEvents } from "./MainGridEvents";

const denver = "America/Denver";

let seededEvents: Event[] = [];

function Provider({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => {
    const client = createCompassQueryClient();
    seedEventQueries(client, seededEvents);
    return client;
  });

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  seededEvents = [];
  resetEffectiveTimeZoneStoreForTests();
});

const startOfView = dayjs.tz("2026-10-31", denver).startOf("week");
const measurements = {
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
} satisfies Measurements_Grid;

const weekProps = {
  component: {
    category: "current" as const,
    endOfView: startOfView.endOf("week"),
    isCurrentWeek: true,
    startOfView,
    week: startOfView.week(),
    weekDays: Array.from({ length: 7 }, (_, index) =>
      startOfView.add(index, "day"),
    ),
  },
  query: {
    endOfView: startOfView.add(6, "day").endOf("day"),
    startOfView,
  },
  state: { goToDate: () => undefined },
  util: {
    decrementWeek: () => undefined,
    getLastNavigationSource: () => "manual" as const,
    goToToday: () => undefined,
    incrementWeek: () => undefined,
    shiftViewByDay: () => undefined,
  },
};

describe("timed overlap deck with mixed instant encoding", () => {
  it("fans out same-start overlaps from different calendars on Sat Oct 31 2026", () => {
    setPinnedTimeZone(denver);

    const importedCalendarId = createMockEvent().calendarId;
    const outlookCalendarId = createMockEvent().calendarId;

    const ritual = createMockEvent({
      calendarId: importedCalendarId,
      content: { kind: "details", title: "Monthly Ritual", description: "" },
      schedule: EventScheduleSchema.parse({
        end: "2026-11-01T02:30:00.000Z",
        kind: "timed",
        start: "2026-11-01T01:00:00.000Z",
        timeZone: denver,
      }),
    });
    const unwind = createMockEvent({
      calendarId: outlookCalendarId,
      content: { kind: "details", title: "Unwind", description: "" },
      recurrence: {
        kind: "occurrence",
        seriesId: EventIdSchema.parse("507f1f77bcf86cd799439099"),
      },
      schedule: EventScheduleSchema.parse({
        end: "2026-11-01T02:00:00.000Z",
        kind: "timed",
        start: "2026-11-01T01:00:00.000Z",
        timeZone: denver,
      }),
    });
    const update = createMockEvent({
      content: { kind: "details", title: "Update 4e2d", description: "" },
      schedule: EventScheduleSchema.parse({
        end: "2026-11-01T01:00:00.000Z",
        kind: "timed",
        start: "2026-11-01T00:00:00.000Z",
        timeZone: denver,
      }),
    });

    seededEvents = [ritual, unwind, update];

    render(
      <Provider>
        <MainGridEvents measurements={measurements} weekProps={weekProps} />
      </Provider>,
    );

    const ritualCard = screen.getByRole("button", { name: /monthly ritual/i });
    const unwindCard = screen.getByRole("button", { name: /unwind/i });
    const updateCard = screen.getByRole("button", { name: /update 4e2d/i });

    expect(parseFloat(ritualCard.style.width)).toBe(
      parseFloat(unwindCard.style.width),
    );
    expect(
      parseFloat(unwindCard.style.left) - parseFloat(ritualCard.style.left),
    ).toBeGreaterThan(DECK_INDENT);
    expect(parseFloat(updateCard.style.width)).toBeGreaterThan(
      parseFloat(ritualCard.style.width),
    );
  });
});
