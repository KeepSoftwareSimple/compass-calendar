import {
  notifyManager,
  type QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, type PropsWithChildren, useState } from "react";
import { type CompassEvent } from "@core/types/compass-event.contracts";
import { EventIdSchema } from "@core/types/domain-primitives";
import { type Event, EventScheduleSchema } from "@core/types/event.contracts";
import dayjs from "@core/util/date/dayjs";
import { cleanup, render, screen } from "@web/__tests__/__mocks__/mock.render";
import {
  seedEventQueries,
  toNormalizedEventQueryData,
} from "@web/__tests__/utils/event-query-test-data";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { seedHiddenEventIds } from "@web/__tests__/utils/hidden-events-test-data";
import { createCompassQueryClient } from "@web/api/query-client";
import { toUTCOffset } from "@web/common/utils/datetime/web.date.util";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { editGridEventDraft } from "@web/events/grid-event-draft.adapter";
import { hiddenEventsQueryKeys } from "@web/events/hidden/hidden-events.query";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import {
  draftActions,
  initialDraftState,
  useDraftStore,
} from "@web/events/stores/draft.store";
import { HIDDEN_EVENT_STRIP_WIDTH } from "@web/grid/grid.constants";
import { type Measurements_Grid } from "@web/views/Week/hooks/grid/useGridLayout";
import { afterEach, describe, expect, it } from "bun:test";
import "@testing-library/jest-dom";
import { Categories_Event } from "@web/common/types/web.event.types";
import { Draft } from "@web/views/Week/components/Draft/Draft";
import { MainGridEvents } from "./MainGridEvents";

let seededWeekEvents: CompassEvent[] = [];
let seededHiddenEventIds: readonly string[] = [];
let providerQueryClient: QueryClient | null = null;

const withOffset = (dateTime: string) =>
  /[Zz]|[+-]\d\d:\d\d$/.test(dateTime) ? dateTime : `${dateTime}Z`;

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
  const [queryClient] = useState(() => {
    const client = createCompassQueryClient();
    seedEventQueries(client, seededWeekEvents.map(toStrictEvent));
    seedHiddenEventIds(client, seededHiddenEventIds);
    providerQueryClient = client;
    return client;
  });

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  seededWeekEvents = [];
  seededHiddenEventIds = [];
  providerQueryClient = null;
  useDraftStore.setState(initialDraftState);
});

const startOfView = dayjs("2024-01-14T00:00:00.000");
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

const weekEventsQueryKey = () =>
  eventQueryKeys.week({
    source: "local",
    start: toUTCOffset(weekProps.query.startOfView),
    end: toUTCOffset(weekProps.query.endOfView),
  });

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

const createOverlapPair = () => {
  const remaining = createSavedEvent({
    endDate: "2024-01-15T19:30:00.000Z",
    startDate: "2024-01-15T18:30:00.000Z",
    title: "Remaining overlap",
  });
  const partner = createSavedEvent({
    endDate: "2024-01-15T19:45:00.000Z",
    startDate: "2024-01-15T19:00:00.000Z",
    title: "Partner overlap",
  });
  return { remaining, partner };
};

const seedEditDraft = (event: CompassEvent) => {
  const draft = editGridEventDraft(toStrictEvent(event));
  if (!draft) {
    throw new Error("expected an edit draft");
  }
  useDraftStore.setState({
    gridDraft: draft,
    status: {
      activity: "keyboardEdit",
      eventType: Categories_Event.TIMED,
      isDrafting: true,
      isFormOpen: true,
    },
  });
};

const seedGridDraftSidebarOpen = (event: CompassEvent) => {
  const draft = editGridEventDraft(toStrictEvent(event));
  if (!draft) {
    throw new Error("expected an edit draft");
  }
  draftActions.startGridDraft({ activity: "gridClick", draft });
};

const renderMainGrid = ({ withDraftLayer = false } = {}) =>
  render(
    <Provider>
      <MainGridEvents measurements={measurements} weekProps={weekProps} />
      {withDraftLayer ? (
        <Draft measurements={measurements} weekProps={weekProps} />
      ) : null}
    </Provider>,
  );

const writeWeekEvents = (events: CompassEvent[]) => {
  if (!providerQueryClient) {
    throw new Error("expected Provider query client");
  }
  seededWeekEvents = events;
  providerQueryClient.setQueryData(
    weekEventsQueryKey(),
    toNormalizedEventQueryData(events.map(toStrictEvent)),
  );
};

const runQueryUpdatesSynchronously = (update: () => void) => {
  notifyManager.setScheduler((callback) => callback());
  try {
    act(update);
  } finally {
    notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  }
};

const cardWidths = (name: RegExp) =>
  screen
    .getAllByRole("button", { name })
    .map((element) => parseFloat(element.style.width));

const deckedWidthFor = (remainingName: RegExp) => {
  const widths = cardWidths(remainingName);
  expect(widths.length).toBeGreaterThan(0);
  return Math.min(...widths);
};

const expectSoloColumnWidth = (remainingName: RegExp, deckedWidth: number) => {
  const widths = cardWidths(remainingName);
  expect(widths.length).toBeGreaterThan(0);
  for (const width of widths) {
    expect(width).toBeGreaterThan(deckedWidth * 0.95);
  }
};

describe("timed overlap deck after partner removal", () => {
  it("returns the remaining event to solo width after deleting its partner with no card open", () => {
    const { remaining, partner } = createOverlapPair();
    seededWeekEvents = [remaining, partner];
    renderMainGrid();

    const deckedWidth = deckedWidthFor(/remaining overlap/i);

    runQueryUpdatesSynchronously(() => {
      writeWeekEvents([remaining]);
    });

    expectSoloColumnWidth(/remaining overlap/i, deckedWidth);

    runQueryUpdatesSynchronously(() => {
      writeWeekEvents([remaining]);
    });

    expectSoloColumnWidth(/remaining overlap/i, deckedWidth);
  });

  it("returns the remaining event to solo width after deleting its partner while the remaining sidebar is open", () => {
    const { remaining, partner } = createOverlapPair();
    seededWeekEvents = [remaining, partner];
    seedEditDraft(remaining);
    renderMainGrid();

    const deckedWidth = deckedWidthFor(/remaining overlap/i);

    runQueryUpdatesSynchronously(() => {
      writeWeekEvents([remaining]);
    });

    expectSoloColumnWidth(/remaining overlap/i, deckedWidth);

    runQueryUpdatesSynchronously(() => {
      writeWeekEvents([remaining]);
    });

    expectSoloColumnWidth(/remaining overlap/i, deckedWidth);
  });

  it("returns the remaining event to solo width after deleting its partner while the partner sidebar is open", () => {
    const { remaining, partner } = createOverlapPair();
    seededWeekEvents = [remaining, partner];
    seedEditDraft(partner);
    renderMainGrid();

    const deckedWidth = deckedWidthFor(/remaining overlap/i);

    runQueryUpdatesSynchronously(() => {
      writeWeekEvents([remaining]);
    });

    expectSoloColumnWidth(/remaining overlap/i, deckedWidth);

    runQueryUpdatesSynchronously(() => {
      writeWeekEvents([remaining]);
    });

    expectSoloColumnWidth(/remaining overlap/i, deckedWidth);
  });

  it("returns the remaining event to solo width after deleting its partner right after the partner sidebar closed", () => {
    const { remaining, partner } = createOverlapPair();
    seededWeekEvents = [remaining, partner];
    seedGridDraftSidebarOpen(partner);
    draftActions.discard();
    renderMainGrid();

    const deckedWidth = deckedWidthFor(/remaining overlap/i);

    runQueryUpdatesSynchronously(() => {
      writeWeekEvents([remaining]);
    });

    expectSoloColumnWidth(/remaining overlap/i, deckedWidth);

    runQueryUpdatesSynchronously(() => {
      writeWeekEvents([remaining]);
    });

    expectSoloColumnWidth(/remaining overlap/i, deckedWidth);
  });

  it("returns the remaining event to solo width after deleting its partner right after the remaining sidebar closed", () => {
    const { remaining, partner } = createOverlapPair();
    seededWeekEvents = [remaining, partner];
    seedGridDraftSidebarOpen(remaining);
    draftActions.discard();
    renderMainGrid();

    const deckedWidth = deckedWidthFor(/remaining overlap/i);

    runQueryUpdatesSynchronously(() => {
      writeWeekEvents([remaining]);
    });

    expectSoloColumnWidth(/remaining overlap/i, deckedWidth);

    runQueryUpdatesSynchronously(() => {
      writeWeekEvents([remaining]);
    });

    expectSoloColumnWidth(/remaining overlap/i, deckedWidth);
  });

  it("returns the remaining event to solo width with the draft layer mounted while its sidebar is open", () => {
    const { remaining, partner } = createOverlapPair();
    seededWeekEvents = [remaining, partner];
    seedEditDraft(remaining);
    renderMainGrid({ withDraftLayer: true });

    const deckedWidth = deckedWidthFor(/remaining overlap/i);

    runQueryUpdatesSynchronously(() => {
      writeWeekEvents([remaining]);
    });

    expectSoloColumnWidth(/remaining overlap/i, deckedWidth);

    runQueryUpdatesSynchronously(() => {
      writeWeekEvents([remaining]);
    });

    expectSoloColumnWidth(/remaining overlap/i, deckedWidth);
  });

  it("returns the visible overlap neighbour to solo width when the partner is hidden live", () => {
    const { remaining, partner } = createOverlapPair();
    seededWeekEvents = [remaining, partner];
    renderMainGrid();

    const deckedWidth = deckedWidthFor(/remaining overlap/i);

    runQueryUpdatesSynchronously(() => {
      if (!providerQueryClient) {
        throw new Error("expected Provider query client");
      }
      providerQueryClient.setQueryData(hiddenEventsQueryKeys.source("local"), [
        partner._id!,
      ]);
    });

    expectSoloColumnWidth(/remaining overlap/i, deckedWidth);
    expect(
      parseFloat(
        screen.getByRole("button", {
          name: /^Hidden Timed event: Partner overlap/,
        }).style.width,
      ),
    ).toBe(HIDDEN_EVENT_STRIP_WIDTH);

    runQueryUpdatesSynchronously(() => {
      if (!providerQueryClient) {
        throw new Error("expected Provider query client");
      }
      providerQueryClient.setQueryData(hiddenEventsQueryKeys.source("local"), [
        partner._id!,
      ]);
    });

    expectSoloColumnWidth(/remaining overlap/i, deckedWidth);
  });
});
