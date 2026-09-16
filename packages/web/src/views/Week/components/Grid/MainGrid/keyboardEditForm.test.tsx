import { HotkeyManager } from "@tanstack/react-hotkeys";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, type PropsWithChildren, useRef, useState } from "react";
import {
  type Calendar,
  getCalendarCapabilities,
} from "@core/types/calendar.contracts";
import { CalendarIdSchema } from "@core/types/domain-primitives";
import { type Event, EventScheduleSchema } from "@core/types/event.contracts";
import dayjs from "@core/util/date/dayjs";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@web/__tests__/__mocks__/mock.render";
import { seedEventQueries } from "@web/__tests__/utils/event-query-test-data";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { createCompassQueryClient } from "@web/api/query-client";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { SidebarEventDetails } from "@web/components/Sidebar/EventDetails/SidebarEventDetails";
import { draftActions } from "@web/events/stores/draft.store";
import { weekEventRegistry } from "@web/grid/interaction/view-event-registry";
import { type Measurements_Grid } from "@web/views/Week/hooks/grid/useGridLayout";
import { MainGridEvents } from "./MainGridEvents";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import "@testing-library/jest-dom";

// The store-level assertions in eventReadOnlyInteraction.test.tsx can't see
// the symptom this bug actually produced: the sidebar panel opened while the
// form inside it rendered nothing. That needs the real sidebar form mounted
// alongside the grid, which is what this file adds.

const startOfView = dayjs("2024-01-14T00:00:00.000");
const weekDays = Array.from({ length: 7 }, (_, index) =>
  startOfView.add(index, "day"),
);
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
    weekDays,
  },
  query: {
    endOfView: startOfView.add(6, "day").endOf("day"),
    startOfView,
  },
  state: { goToDate: mock() },
  util: {
    decrementWeek: mock(),
    getLastNavigationSource: mock(() => "manual" as const),
    goToToday: mock(),
    incrementWeek: mock(),
    shiftViewByDay: mock(),
  },
};

const writableCalendar: Calendar = {
  id: CalendarIdSchema.parse(createObjectIdString()),
  name: "Compass",
  description: "",
  timeZone: null,
  foregroundColor: "#000000",
  backgroundColor: "#3b82f6",
  provider: "google",
  access: "owner",
  capabilities: getCalendarCapabilities("owner"),
  isPrimary: true,
  isVisible: true,
  isActive: true,
};

let seededEvents: Event[] = [];

function Harness({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => {
    const client = createCompassQueryClient();
    seedEventQueries(client, seededEvents);
    client.setQueryData(calendarQueryKeys.all, [writableCalendar]);
    return client;
  });

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function GridWithSidebar() {
  const mainGridRef = useRef<HTMLDivElement | null>(null);

  return (
    <>
      <div ref={mainGridRef}>
        <MainGridEvents
          measurements={measurements}
          weekProps={weekProps as never}
        />
      </div>
      <SidebarEventDetails />
    </>
  );
}

beforeEach(() => {
  HotkeyManager.resetInstance();
});

afterEach(() => {
  act(() => draftActions.discard());
  cleanup();
  weekEventRegistry.clear();
  seededEvents = [];
});

describe("Enter on a focused grid event", () => {
  it("opens the sidebar form populated with the event's details", async () => {
    seededEvents = [
      createMockEvent({
        calendarId: writableCalendar.id,
        content: {
          kind: "details",
          title: "Quarterly review",
          description: "",
        },
        schedule: EventScheduleSchema.parse({
          kind: "timed",
          start: "2024-01-15T09:00:00.000Z",
          end: "2024-01-15T10:00:00.000Z",
          timeZone: "UTC",
        }),
      }),
    ];

    render(
      <Harness>
        <GridWithSidebar />
      </Harness>,
    );

    const card = screen.getByRole("button", { name: /quarterly review/i });
    await act(async () => {
      fireEvent.keyDown(card, { key: "Enter" });
    });

    expect(await screen.findByDisplayValue("Quarterly review")).toBeVisible();
  });

  it("returns focus to the grid event after the form closes", async () => {
    seededEvents = [
      createMockEvent({
        calendarId: writableCalendar.id,
        content: {
          kind: "details",
          title: "Quarterly review",
          description: "",
        },
        schedule: EventScheduleSchema.parse({
          kind: "timed",
          start: "2024-01-15T09:00:00.000Z",
          end: "2024-01-15T10:00:00.000Z",
          timeZone: "UTC",
        }),
      }),
    ];

    render(
      <Harness>
        <GridWithSidebar />
      </Harness>,
    );

    const card = screen.getByRole("button", { name: /quarterly review/i });
    await act(async () => {
      card.focus();
      fireEvent.keyDown(card, { key: "Enter" });
    });

    const titleField = await screen.findByDisplayValue("Quarterly review");
    expect(titleField).toHaveFocus();

    await act(async () => {
      fireEvent.keyDown(titleField, { key: "Escape" });
    });

    expect(screen.queryByDisplayValue("Quarterly review")).toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(card);
    });
  });
});
