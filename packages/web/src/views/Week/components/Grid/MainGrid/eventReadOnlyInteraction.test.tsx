import { QueryClientProvider } from "@tanstack/react-query";
import { act, type PropsWithChildren, useState } from "react";
import {
  type Calendar,
  getCalendarCapabilities,
} from "@core/types/calendar.contracts";
import {
  type CalendarId,
  CalendarIdSchema,
} from "@core/types/domain-primitives";
import { type Event, EventScheduleSchema } from "@core/types/event.contracts";
import dayjs from "@core/util/date/dayjs";
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@web/__tests__/__mocks__/mock.render";
import { seedEventQueries } from "@web/__tests__/utils/event-query-test-data";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { createCompassQueryClient } from "@web/api/query-client";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { draftActions, useDraftStore } from "@web/events/stores/draft.store";
import { GRID_EVENT_READ_ONLY_ATTRIBUTE } from "@web/grid/interaction/view-event-registry";
import { type Measurements_Grid } from "@web/views/Week/hooks/grid/useGridLayout";
import {
  WEEK_INTERACTION_EVENT_ID_ATTRIBUTE,
  weekEventRegistry,
  weekEventTargeting,
} from "@web/grid/interaction/view-event-registry";
import { AllDayEvents } from "../AllDayRow/AllDayEvents";
import { MainGridEvents } from "./MainGridEvents";
import { afterEach, describe, expect, it, mock } from "bun:test";

// packet 08 step 8: an event on a read-only (unwritable) calendar, or with
// busy content, must never enter the drag/resize registry - that's the
// concrete mechanism that stops the engine from treating it as a target,
// blocked before any optimistic state change. Id-bearing view-registry
// attributes still stamp so context menus / focus restore can resolve the
// card; registration (`weekEventRegistry.resolve`) is the gate.

let seededEvents: Event[] = [];
let seededCalendars: Calendar[] = [];

function Provider({ children }: PropsWithChildren) {
  // useState initializer: exactly one client per mounted tree. Creating and
  // seeding in the render body rebuilds an EMPTY client on every re-render,
  // which drops the seeded calendars/events and races a network refetch.
  const [queryClient] = useState(() => {
    const client = createCompassQueryClient();
    seedEventQueries(client, seededEvents);
    client.setQueryData(calendarQueryKeys.all, seededCalendars);
    return client;
  });

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  weekEventRegistry.clear();
  seededEvents = [];
  seededCalendars = [];
});

const startOfView = dayjs("2024-01-14T00:00:00.000");
const weekDaysInView = Array.from({ length: 7 }, (_, index) =>
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

const createWeekProps = () => ({
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
  state: { goToDate: mock() },
  util: {
    decrementWeek: mock(),
    getLastNavigationSource: mock(() => "manual" as const),
    goToToday: mock(),
    incrementWeek: mock(),
    shiftViewByDay: mock(),
  },
});

const makeCalendar = (overrides: Partial<Calendar> = {}): Calendar => ({
  id: CalendarIdSchema.parse(createObjectIdString()),
  name: "Shared calendar",
  description: "",
  timeZone: null,
  foregroundColor: "#000000",
  backgroundColor: "#3b82f6",
  provider: "google",
  access: "reader",
  capabilities: getCalendarCapabilities("reader"),
  isPrimary: false,
  isVisible: true,
  isActive: true,
  ...overrides,
});

const createTimedEvent = (
  calendarId: CalendarId,
  overrides: Partial<Event> = {},
) =>
  createMockEvent({
    calendarId,
    content: { kind: "details", title: "Shared meeting", description: "" },
    schedule: EventScheduleSchema.parse({
      kind: "timed",
      start: "2024-01-15T09:00:00.000Z",
      end: "2024-01-15T10:00:00.000Z",
      timeZone: "UTC",
    }),
    ...overrides,
  });

const createAllDayEvent = (
  calendarId: CalendarId,
  overrides: Partial<Event> = {},
) =>
  createMockEvent({
    calendarId,
    content: { kind: "details", title: "Team holiday", description: "" },
    schedule: EventScheduleSchema.parse({
      kind: "allDay",
      start: "2024-01-15",
      end: "2024-01-16",
    }),
    ...overrides,
  });

const renderMainGridEvents = () =>
  render(
    <Provider>
      <MainGridEvents
        measurements={measurements}
        weekProps={createWeekProps()}
      />
    </Provider>,
  );

const renderAllDayEvents = () =>
  render(
    <Provider>
      <AllDayEvents
        measurements={measurements}
        queryEndOfView={startOfView.add(6, "day").endOf("day")}
        queryStartOfView={startOfView}
        weekDays={weekDaysInView}
      />
    </Provider>,
  );

describe("Week grid read-only interaction gate", () => {
  it("stamps id attrs on a read-only timed event without registering it for drag/resize", () => {
    const readOnlyCalendar = makeCalendar();
    seededCalendars = [readOnlyCalendar];
    const event = createTimedEvent(readOnlyCalendar.id);
    seededEvents = [event];

    renderMainGridEvents();

    const card = screen.getByRole("button", { name: /shared meeting/i });
    expect(card).toHaveAttribute(WEEK_INTERACTION_EVENT_ID_ATTRIBUTE, event.id);
    expect(weekEventRegistry.resolve(event.id, "timed")).toBeNull();
  });

  it("marks a read-only timed event so keyboard navigation still reaches it", () => {
    const readOnlyCalendar = makeCalendar();
    seededCalendars = [readOnlyCalendar];
    const event = createTimedEvent(readOnlyCalendar.id);
    seededEvents = [event];

    renderMainGridEvents();

    const card = screen.getByRole("button", { name: /shared meeting/i });
    expect(card).toHaveAttribute(GRID_EVENT_READ_ONLY_ATTRIBUTE, "true");
    // jsdom lays nothing out, so stand in for the visibility check.
    Object.defineProperty(card, "offsetParent", {
      configurable: true,
      get: () => document.body,
    });

    expect(
      weekEventTargeting.listNavigableGridEventTargets().map((t) => t.eventId),
    ).toEqual([event.id]);
  });

  it("keeps registering a writable-calendar timed event as an interaction target", () => {
    const writableCalendar = makeCalendar({
      access: "owner",
      capabilities: getCalendarCapabilities("owner"),
    });
    seededCalendars = [writableCalendar];
    const event = createTimedEvent(writableCalendar.id, {
      content: { kind: "details", title: "My focus block", description: "" },
    });
    seededEvents = [event];

    renderMainGridEvents();

    const card = screen.getByRole("button", { name: /my focus block/i });
    expect(card).toHaveAttribute(WEEK_INTERACTION_EVENT_ID_ATTRIBUTE, event.id);
    expect(weekEventRegistry.resolve(event.id, "timed")).toBe(card);
  });

  it("stamps id attrs on a read-only all-day event without registering it for drag/resize", () => {
    const readOnlyCalendar = makeCalendar();
    seededCalendars = [readOnlyCalendar];
    const event = createAllDayEvent(readOnlyCalendar.id);
    seededEvents = [event];

    renderAllDayEvents();

    const card = screen.getByRole("button", {
      name: /all-day event: team holiday/i,
    });
    expect(card).toHaveAttribute(WEEK_INTERACTION_EVENT_ID_ATTRIBUTE, event.id);
    expect(weekEventRegistry.resolve(event.id, "all-day")).toBeNull();
  });

  it("still opens a read-only all-day event for inspection via Enter", () => {
    const readOnlyCalendar = makeCalendar();
    seededCalendars = [readOnlyCalendar];
    const event = createAllDayEvent(readOnlyCalendar.id);
    seededEvents = [event];

    renderAllDayEvents();

    const card = screen.getByRole("button", {
      name: /all-day event: team holiday/i,
    });
    act(() => {
      fireEvent.keyDown(card, { key: "Enter" });
    });

    // Assert the draft the form renders from - opening the form without a
    // `gridDraft` is what used to blank the sidebar.
    expect(useDraftStore.getState().status?.activity).toBe("gridClick");
    expect(useDraftStore.getState().gridDraft?.source?.id).toBe(event.id);

    act(() => draftActions.discard());
  });

  it("still opens a read-only timed event for inspection via Enter", () => {
    const readOnlyCalendar = makeCalendar();
    seededCalendars = [readOnlyCalendar];
    const event = createTimedEvent(readOnlyCalendar.id, {
      content: { kind: "details", title: "Inspect me", description: "" },
    });
    seededEvents = [event];

    renderMainGridEvents();

    const card = screen.getByRole("button", { name: /inspect me/i });
    act(() => {
      fireEvent.keyDown(card, { key: "Enter" });
    });

    // Assert the draft the form actually renders from, not just that some
    // draft activity started: opening the form without a `gridDraft` is what
    // used to blank the sidebar.
    expect(useDraftStore.getState().status?.activity).toBe("gridClick");
    expect(useDraftStore.getState().gridDraft?.source?.id).toBe(event.id);

    act(() => draftActions.discard());
  });

  // The keyboard path had the same blank-sidebar defect the read-only cases
  // above were routed around: it opened the form via `start`, which leaves
  // gridDraft null. That also stranded arrow-key repositioning, which reads
  // the draft's own schedule.
  it("opens a writable timed event with its details when focused and Entered", () => {
    const writableCalendar = makeCalendar({
      access: "owner",
      capabilities: getCalendarCapabilities("owner"),
    });
    seededCalendars = [writableCalendar];
    const event = createTimedEvent(writableCalendar.id, {
      content: {
        kind: "details",
        title: "Keyboard focus block",
        description: "",
      },
    });
    seededEvents = [event];

    renderMainGridEvents();

    const card = screen.getByRole("button", { name: /keyboard focus block/i });
    act(() => {
      fireEvent.keyDown(card, { key: "Enter" });
    });

    expect(useDraftStore.getState().status?.activity).toBe("keyboardEdit");
    expect(useDraftStore.getState().gridDraft?.source?.id).toBe(event.id);

    act(() => draftActions.discard());
  });

  it("opens a writable all-day event with its details when focused and Entered", () => {
    const writableCalendar = makeCalendar({
      access: "owner",
      capabilities: getCalendarCapabilities("owner"),
    });
    seededCalendars = [writableCalendar];
    const event = createAllDayEvent(writableCalendar.id, {
      content: { kind: "details", title: "Keyboard holiday", description: "" },
    });
    seededEvents = [event];

    renderAllDayEvents();

    const card = screen.getByRole("button", {
      name: /all-day event: keyboard holiday/i,
    });
    act(() => {
      fireEvent.keyDown(card, { key: "Enter" });
    });

    expect(useDraftStore.getState().status?.activity).toBe("keyboardEdit");
    expect(useDraftStore.getState().gridDraft?.source?.id).toBe(event.id);

    act(() => draftActions.discard());
  });

  it("treats a busy timed event as read-only, and renders 'Busy' as its title, even on a writable calendar", () => {
    const writableCalendar = makeCalendar({
      access: "owner",
      capabilities: getCalendarCapabilities("owner"),
    });
    seededCalendars = [writableCalendar];
    const event = createTimedEvent(writableCalendar.id, {
      content: { kind: "busy" },
    });
    seededEvents = [event];

    renderMainGridEvents();

    const card = screen.getByRole("button", { name: /timed event: busy/i });
    expect(card).toHaveAttribute(WEEK_INTERACTION_EVENT_ID_ATTRIBUTE, event.id);
    expect(weekEventRegistry.resolve(event.id, "timed")).toBeNull();
  });

  it("marks a provider-managed timed event read-only for drag/resize while keeping it navigable", () => {
    const writableCalendar = makeCalendar({
      access: "owner",
      capabilities: getCalendarCapabilities("owner"),
    });
    seededCalendars = [writableCalendar];
    const event = createTimedEvent(writableCalendar.id, {
      providerManaged: true,
      content: {
        kind: "details",
        title: "From email",
        description: "",
      },
    });
    seededEvents = [event];

    renderMainGridEvents();

    const card = screen.getByRole("button", { name: /from email/i });
    expect(card).toHaveAttribute(GRID_EVENT_READ_ONLY_ATTRIBUTE, "true");
    expect(weekEventRegistry.resolve(event.id, "timed")).toBeNull();
  });
});
