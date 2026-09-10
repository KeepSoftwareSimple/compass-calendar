import { QueryClientProvider } from "@tanstack/react-query";
import { type PropsWithChildren, useState } from "react";
import { type CompassEvent } from "@core/types/compass-event.contracts";
import { EventIdSchema } from "@core/types/domain-primitives";
import { type Event, EventScheduleSchema } from "@core/types/event.contracts";
import dayjs from "@core/util/date/dayjs";
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@web/__tests__/__mocks__/mock.render";
import {
  seedEventQueries,
  seedPendingEventMutations,
} from "@web/__tests__/utils/event-query-test-data";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { seedHiddenEventIds } from "@web/__tests__/utils/hidden-events-test-data";
import { createCompassQueryClient } from "@web/api/query-client";
import { ZIndex } from "@web/common/constants/web.constants";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import {
  allDayGridSchedule,
  createGridEventDraft,
  timedGridSchedule,
} from "@web/events/grid-event-draft.adapter";
import {
  initialDraftState,
  useDraftStore,
} from "@web/events/stores/draft.store";
import {
  DECK_INDENT,
  HIDDEN_EVENT_STRIP_WIDTH,
} from "@web/grid/grid.constants";
import { type Measurements_Grid } from "@web/views/Week/hooks/grid/useGridLayout";
import {
  WEEK_INTERACTION_EVENT_ID_ATTRIBUTE,
  WEEK_INTERACTION_EVENT_TYPE_ATTRIBUTE,
  weekEventRegistry,
} from "@web/views/Week/interaction/registry/week-event.registry";
import { afterEach, describe, expect, it, mock } from "bun:test";
import "@testing-library/jest-dom";
import { Categories_Event } from "@web/common/types/web.event.types";

let pendingEventIds: string[] = [];
let seededWeekEvents: CompassEvent[] = [];
let seededHiddenEventIds: readonly string[] = [];

// DateTimeSchema requires an explicit offset; several fixtures below already
// carry one ("Z"), but normalize defensively.
const withOffset = (dateTime: string) =>
  /[Zz]|[+-]\d\d:\d\d$/.test(dateTime) ? dateTime : `${dateTime}Z`;

// The query cache (unlike draft.store.ts, still legacy CompassEvent-shaped
// per its own TODO) requires strict-contract `Event`s.
const toStrictEvent = (event: CompassEvent): Event =>
  createMockEvent({
    id: EventIdSchema.parse(event._id!),
    content: {
      kind: "details",
      title: event.title ?? "",
      description: event.description ?? "",
    },
    schedule: event.isAllDay
      ? EventScheduleSchema.parse({
          kind: "allDay",
          start: event.startDate!.slice(0, 10),
          end: event.endDate!.slice(0, 10),
        })
      : EventScheduleSchema.parse({
          kind: "timed",
          start: withOffset(event.startDate!),
          end: withOffset(event.endDate!),
          timeZone: "UTC",
        }),
  });

function Provider({ children }: PropsWithChildren) {
  // useState initializer: one client per mounted tree. Rebuilding an empty
  // client on re-render drops seeded event/pending-mutation cache.
  const [queryClient] = useState(() => {
    const client = createCompassQueryClient();
    seedPendingEventMutations(client, pendingEventIds);
    seedEventQueries(client, seededWeekEvents.map(toStrictEvent));
    seedHiddenEventIds(client, seededHiddenEventIds);
    return client;
  });

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const { AllDayEvents } = await import("../AllDayRow/AllDayEvents");
const { AllDayRow } = await import("../AllDayRow/AllDayRow");
const { Grid } = await import("../Grid");
const { MainGrid } = await import("./MainGrid");
const { MainGridEvents } = await import("./MainGridEvents");

afterEach(() => {
  cleanup();
  weekEventRegistry.clear();
  pendingEventIds = [];
  seededWeekEvents = [];
  seededHiddenEventIds = [];
  useDraftStore.setState(initialDraftState);
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

// Seed the event query cache (read when the local Provider mounts its
// QueryClient) and the draft Zustand store.
const seedGrid = (
  events: CompassEvent[] = [],
  draftEvent: CompassEvent | null = null,
) => {
  seededWeekEvents = events;

  if (!draftEvent) {
    useDraftStore.setState(initialDraftState);
    return;
  }

  const schedule = draftEvent.isAllDay
    ? allDayGridSchedule(draftEvent.startDate!, draftEvent.endDate!)
    : timedGridSchedule(
        new Date(draftEvent.startDate!),
        new Date(draftEvent.endDate!),
      );
  const gridDraft = createGridEventDraft(
    schedule,
    EventIdSchema.parse(draftEvent._id!),
  );

  useDraftStore.setState({
    gridDraft,
    status: {
      activity: "keyboardEdit",
      eventType: draftEvent.isAllDay
        ? Categories_Event.ALLDAY
        : Categories_Event.TIMED,
      isDrafting: true,
      isFormOpen: false,
    },
  });
};

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

// `_id` in `overrides` is a readable test label, not the real id — the query
// cache (toStrictEvent above) requires a real ObjectId, so every fixture
// gets a generated one; tests that need to assert on "which event" read
// `event._id` back off the returned fixture, never a literal.
const createSavedEvent = (
  overrides: Partial<CompassEvent> = {},
): CompassEvent =>
  ({
    endDate: "2024-01-15T10:00:00.000Z",
    isAllDay: false,
    recurrence: undefined,
    startDate: "2024-01-15T09:00:00.000Z",
    title: "Saved event",
    ...overrides,
    _id: createObjectIdString(),
  }) as CompassEvent;

const renderGridRegions = () => {
  seedGrid();

  const view = render(
    <Provider>
      <AllDayRow
        allDayRef={mock()}
        allDayRowRef={mock()}
        measurements={measurements}
        weekProps={createWeekProps()}
      />
      <MainGrid
        mainGridElementRef={mock()}
        measurements={measurements}
        timedColumnsElementRef={mock()}
        today={startOfView}
        weekProps={createWeekProps()}
      />
    </Provider>,
  );

  return view;
};

const renderWeekGrid = (events: CompassEvent[] = []) => {
  seedGrid(events);

  return render(
    <Provider>
      <Grid
        gridRefs={{
          allDayColumnsRef: { current: null },
          allDayRef: mock(),
          allDayRowRef: mock(),
          mainGridElementRef: mock(),
          mainGridRef: { current: null },
          timedColumnsElementRef: mock(),
          timedColumnsRef: { current: null },
        }}
        measurements={measurements}
        today={startOfView}
        weekProps={createWeekProps()}
      />
    </Provider>,
  );
};

describe("Week calendar accessibility", () => {
  it("labels timed and all-day calendar regions", () => {
    renderGridRegions();

    expect(
      screen.getByRole("region", { name: "Timed events grid" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "All-day events" }),
    ).toBeInTheDocument();
  });

  it("gives saved timed events a title and time accessible name", () => {
    seedGrid([
      createSavedEvent({
        _id: "labeled-event",
        endDate: "2024-01-15T10:00:00.000Z",
        startDate: "2024-01-15T09:00:00.000Z",
        title: "Planning block",
      }),
    ]);

    render(
      <Provider>
        <MainGridEvents
          measurements={measurements}
          weekProps={createWeekProps()}
        />
      </Provider>,
    );

    expect(
      screen.getByRole("button", {
        name: /timed event: planning block, .*9.*10.*am/i,
      }),
    ).toBeInTheDocument();
  });

  it("removes a converted all-day draft from the timed grid", () => {
    const savedEvent = createSavedEvent({ title: "Converted event" });
    seedGrid([savedEvent], {
      ...savedEvent,
      endDate: "2024-01-16",
      isAllDay: true,
      startDate: "2024-01-15",
    });

    render(
      <Provider>
        <MainGridEvents
          measurements={measurements}
          weekProps={createWeekProps()}
        />
      </Provider>,
    );

    expect(
      screen.queryByRole("button", { name: /timed event: converted event/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps pending saved events fully interactive", () => {
    const event = createSavedEvent({
      title: "Pending save",
    });
    seedGrid([event]);
    pendingEventIds = [event._id!];

    render(
      <Provider>
        <MainGridEvents
          measurements={measurements}
          weekProps={createWeekProps()}
        />
      </Provider>,
    );

    const card = screen.getByRole("button", { name: /pending save/i });
    expect(card).not.toHaveAttribute("aria-disabled");
    expect(card).toHaveAttribute(
      WEEK_INTERACTION_EVENT_ID_ATTRIBUTE,
      event._id,
    );
  });

  it("gives all-day events an all-day accessible name and target type", () => {
    const event = createSavedEvent({
      endDate: "2024-01-16T00:00:00.000Z",
      isAllDay: true,
      startDate: "2024-01-15T00:00:00.000Z",
      title: "All-day planning",
    });
    seedGrid([event]);

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

    const eventButton = screen.getByRole("button", {
      name: /all-day event: all-day planning/i,
    });

    expect(eventButton.getAttribute(WEEK_INTERACTION_EVENT_ID_ATTRIBUTE)).toBe(
      event._id ?? null,
    );
    expect(
      eventButton.getAttribute(WEEK_INTERACTION_EVENT_TYPE_ATTRIBUTE),
    ).toBe("all-day");
  });

  it("keeps full-week all-day events spanning seven columns", () => {
    seedGrid([
      createSavedEvent({
        _id: "full-week-all-day",
        endDate: "2024-01-21T00:00:00.000Z",
        isAllDay: true,
        startDate: "2024-01-14T00:00:00.000Z",
        title: "Full week",
      }),
    ]);

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

    const eventButton = screen.getByRole("button", {
      name: /all-day event: full week/i,
    });

    expect(parseFloat(eventButton.style.width)).toBe(690);
  });

  it("keeps stacked all-day rows wired through the shared Week grid", () => {
    renderWeekGrid([
      createSavedEvent({
        _id: "stacked-all-day-one",
        endDate: "2024-01-16T00:00:00.000Z",
        isAllDay: true,
        startDate: "2024-01-15T00:00:00.000Z",
        title: "Stacked one",
      }),
      createSavedEvent({
        _id: "stacked-all-day-two",
        endDate: "2024-01-16T00:00:00.000Z",
        isAllDay: true,
        startDate: "2024-01-15T00:00:00.000Z",
        title: "Stacked two",
      }),
    ]);

    expect(
      getComputedStyle(screen.getByRole("region", { name: "All-day events" }))
        .height,
    ).toContain("0.09090909090909091");
  });
});

describe("saved Week event ownership", () => {
  it("lays overlapping saved timed events out as a left-anchored deck", () => {
    seedGrid([
      createSavedEvent({
        _id: "early-overlap",
        endDate: "2024-01-15T19:30:00.000Z",
        startDate: "2024-01-15T18:30:00.000Z",
        title: "Early overlap",
      }),
      createSavedEvent({
        _id: "late-overlap",
        endDate: "2024-01-15T19:45:00.000Z",
        startDate: "2024-01-15T19:00:00.000Z",
        title: "Late overlap",
      }),
      createSavedEvent({
        _id: "solo",
        endDate: "2024-01-15T23:00:00.000Z",
        startDate: "2024-01-15T22:00:00.000Z",
        title: "Solo",
      }),
    ]);

    render(
      <Provider>
        <MainGridEvents
          measurements={measurements}
          weekProps={createWeekProps()}
        />
      </Provider>,
    );

    const early = screen.getByRole("button", { name: /early overlap/i });
    const late = screen.getByRole("button", { name: /late overlap/i });
    const solo = screen.getByRole("button", { name: /timed event: solo/i });

    expect(parseFloat(early.style.width)).toBe(parseFloat(late.style.width));
    const overlapOffset =
      parseFloat(late.style.left) - parseFloat(early.style.left);
    expect(overlapOffset).toBeGreaterThan(DECK_INDENT);

    expect(Number(early.style.zIndex)).toBeLessThan(Number(late.style.zIndex));

    expect(parseFloat(solo.style.width)).toBeGreaterThan(
      parseFloat(early.style.width),
    );
    expect(Number(solo.style.zIndex)).toBe(ZIndex.LAYER_1);
  });

  it("keeps a focused deck card in its fan-out stack", () => {
    seedGrid([
      createSavedEvent({
        _id: "back",
        endDate: "2024-01-15T19:30:00.000Z",
        startDate: "2024-01-15T18:30:00.000Z",
        title: "Back overlap",
      }),
      createSavedEvent({
        _id: "front",
        endDate: "2024-01-15T19:45:00.000Z",
        startDate: "2024-01-15T19:00:00.000Z",
        title: "Front overlap",
      }),
    ]);

    render(
      <Provider>
        <MainGridEvents
          measurements={measurements}
          weekProps={createWeekProps()}
        />
      </Provider>,
    );

    const back = screen.getByRole("button", { name: /back overlap/i });
    const initialBackZIndex = Number(back.style.zIndex);
    expect(initialBackZIndex).toBeLessThan(ZIndex.MAX);

    fireEvent.focus(back);
    expect(Number(back.style.zIndex)).toBe(initialBackZIndex);

    fireEvent.blur(back);
    expect(Number(back.style.zIndex)).toBe(initialBackZIndex);
  });

  it("renders a hidden overlap as a strip so the neighbour keeps solo width", () => {
    const hidden = createSavedEvent({
      endDate: "2024-01-15T19:30:00.000Z",
      startDate: "2024-01-15T18:30:00.000Z",
      title: "Hidden overlap",
    });
    const visible = createSavedEvent({
      endDate: "2024-01-15T19:45:00.000Z",
      startDate: "2024-01-15T19:00:00.000Z",
      title: "Visible overlap",
    });
    seededHiddenEventIds = [hidden._id!];
    seedGrid([hidden, visible]);

    render(
      <Provider>
        <MainGridEvents
          measurements={measurements}
          weekProps={createWeekProps()}
        />
      </Provider>,
    );

    const visibleCard = screen.getByRole("button", {
      name: /timed event: visible overlap/i,
    });
    const hiddenCard = screen.getByRole("button", {
      name: /^Hidden Timed event: Hidden overlap/,
    });

    expect(Number(visibleCard.style.zIndex)).toBe(ZIndex.LAYER_1);
    expect(parseFloat(hiddenCard.style.width)).toBe(HIDDEN_EVENT_STRIP_WIDTH);
    expect(parseFloat(visibleCard.style.width)).toBeGreaterThan(
      HIDDEN_EVENT_STRIP_WIDTH,
    );
    expect(weekEventRegistry.resolve(hidden._id!, "timed")).toBeNull();
    expect(weekEventRegistry.resolve(visible._id!, "timed")).toBe(visibleCard);
  });
});
