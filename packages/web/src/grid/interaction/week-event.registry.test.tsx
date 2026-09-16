import { render, screen } from "@testing-library/react";
import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import dayjs from "@core/util/date/dayjs";
import { type GridEvent as GridEventEntity } from "@web/common/types/web.event.types";
import { GridAllDayEventMemo } from "@web/grid/components/GridAllDayEvent";
import { GridTimedEvent } from "@web/grid/components/GridTimedEvent";
import {
  GRID_EVENT_TIME_LABEL_FONT_SIZE,
  GRID_EVENT_TIME_LABEL_OPACITY,
  GRID_EVENT_TITLE_LINE_HEIGHT,
} from "@web/grid/grid.constants";
import {
  createWeekEventRegistry,
  getWeekInteractionTargetAttributes,
  useWeekEventRegistrationRef,
  WEEK_INTERACTION_EVENT_ID_ATTRIBUTE,
  WEEK_INTERACTION_EVENT_TYPE_ATTRIBUTE,
  type WeekInteractionEventType,
  weekEventRegistry,
} from "@web/grid/interaction/view-event-registry";
import { type Measurements_Grid } from "@web/views/Week/hooks/grid/useGridLayout";
import { type WeekProps } from "@web/views/Week/hooks/useWeek";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  setSystemTime,
} from "bun:test";

const TEST_NOW = new Date("2026-05-01T00:00:00.000Z");
const testNow = dayjs(TEST_NOW);
const futureWeekStart = testNow.add(1, "week").startOf("week").startOf("day");
const pastWeekStart = testNow
  .subtract(1, "week")
  .startOf("week")
  .startOf("day");
const startOfView = futureWeekStart;
const endOfView = startOfView.add(7, "day");
const futureTimedStart = futureWeekStart.add(1, "day").hour(9);
const futureTimedEnd = futureTimedStart.add(1, "hour");
const _futureShortTimedEnd = futureTimedStart.add(30, "minute");
const futureFridayTimedStart = futureWeekStart.add(5, "day").hour(9);
const futureFridayTimedEnd = futureFridayTimedStart.add(1, "hour");
const pastTimedStart = pastWeekStart.add(1, "day").hour(9);
const _pastTimedEnd = pastTimedStart.add(1, "hour");
const measurements = {
  allDayRow: null,
  colWidths: Array(7).fill(100),
  hourHeight: 70,
  mainGrid: {
    bottom: 770,
    height: 770,
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
    endOfView,
    startOfView,
    weekDays: [...Array(7)].map((_, index) => startOfView.add(index, "day")),
  },
} as WeekProps;
const visibleDates = weekProps.component.weekDays.map((date) => ({
  date,
  key: date.format(YEAR_MONTH_DAY_FORMAT),
}));
const _pastWeekProps = {
  component: {
    endOfView: pastWeekStart.add(7, "day"),
    startOfView: pastWeekStart,
    weekDays: [...Array(7)].map((_, index) => pastWeekStart.add(index, "day")),
  },
} as WeekProps;

const position = {
  dragOffset: { x: 0, y: 0 },
  horizontalOrder: 1,
  initialX: null,
  initialY: null,
  isOverlapping: false,
  totalEventsInGroup: 1,
  widthMultiplier: 1,
};

const createTimedEvent = (
  overrides: Partial<GridEventEntity> = {},
): GridEventEntity =>
  ({
    _id: "timed-event",
    endDate: futureTimedEnd.format(),
    isAllDay: false,
    position,
    recurrence: undefined,
    startDate: futureTimedStart.format(),
    title: "Timed event",
    ...overrides,
  }) as GridEventEntity;

const createAllDayEvent = (
  overrides: Partial<GridEventEntity> = {},
): GridEventEntity =>
  ({
    _id: "all-day-event",
    endDate: futureWeekStart.add(2, "day").format(),
    isAllDay: true,
    position,
    recurrence: undefined,
    row: 1,
    startDate: futureWeekStart.add(1, "day").format(),
    title: "All-day event",
    ...overrides,
  }) as GridEventEntity;

const renderWithStore = (children: React.ReactNode) => render(children);

beforeEach(() => {
  setSystemTime(TEST_NOW);
});

const RegistrationHarness = ({
  eventId = "event-1",
  eventType = "timed",
  isEnabled = true,
}: {
  eventId?: string;
  eventType?: WeekInteractionEventType;
  isEnabled?: boolean;
}) => {
  const ref = useWeekEventRegistrationRef({
    eventId,
    eventType,
    isEnabled,
  });

  return (
    <div
      {...getWeekInteractionTargetAttributes({ eventId, eventType })}
      ref={ref}
    >
      event
    </div>
  );
};

const RegisteredTimedEventHarness = ({
  displayMode = "saved",
  event,
}: {
  displayMode?: "draft" | "placeholder" | "saved";
  event: GridEventEntity;
}) => {
  const isEnabled = Boolean(event._id) && displayMode === "saved";
  const ref = useWeekEventRegistrationRef({
    eventId: event._id,
    eventType: "timed",
    isEnabled,
  });

  return (
    <GridTimedEvent
      displayMode={displayMode}
      event={event}
      interactionAttributes={
        isEnabled
          ? getWeekInteractionTargetAttributes({
              eventId: event._id,
              eventType: "timed",
            })
          : undefined
      }
      measurements={measurements}
      ref={ref}
      visibleDates={visibleDates}
    />
  );
};

const RegisteredAllDayEventHarness = ({
  event,
  isPlaceholder = false,
}: {
  event: GridEventEntity;
  isPlaceholder?: boolean;
}) => {
  const isEnabled = Boolean(event._id) && !isPlaceholder;
  const ref = useWeekEventRegistrationRef({
    eventId: event._id,
    eventType: "all-day",
    isEnabled,
  });

  return (
    <GridAllDayEventMemo
      event={event}
      interactionAttributes={
        isEnabled
          ? getWeekInteractionTargetAttributes({
              eventId: event._id,
              eventType: "all-day",
            })
          : undefined
      }
      isPlaceholder={isPlaceholder}
      measurements={measurements}
      ref={ref}
      visibleDates={visibleDates}
    />
  );
};

afterEach(() => {
  setSystemTime();
  weekEventRegistry.clear();
  document.body.innerHTML = "";
});

describe("weekEventRegistry", () => {
  it("keeps Week event attributes after registry extraction", () => {
    const attributes = getWeekInteractionTargetAttributes({
      eventId: "event-1",
      eventType: "timed",
    });

    expect(attributes).toEqual({
      "data-week-interaction-event-id": "event-1",
      "data-week-interaction-event-type": "timed",
    });
  });

  it("registers and unregisters saved timed event elements", () => {
    const event = createTimedEvent();
    const { unmount } = renderWithStore(
      <RegisteredTimedEventHarness event={event} />,
    );

    const element = screen.getByRole("button", { name: /timed event/i });

    expect(weekEventRegistry.resolve("timed-event", "timed")).toBe(element);
    expect(element).toHaveAttribute(
      WEEK_INTERACTION_EVENT_ID_ATTRIBUTE,
      "timed-event",
    );
    expect(element).toHaveAttribute(
      WEEK_INTERACTION_EVENT_TYPE_ATTRIBUTE,
      "timed",
    );

    unmount();

    expect(weekEventRegistry.resolve("timed-event", "timed")).toBeNull();
  });

  it("registers and unregisters saved all-day event elements", () => {
    const event = createAllDayEvent();
    const { unmount } = renderWithStore(
      <RegisteredAllDayEventHarness event={event} />,
    );

    const element = screen.getByRole("button", { name: /all-day event/i });

    expect(weekEventRegistry.resolve("all-day-event", "all-day")).toBe(element);
    expect(element).toHaveAttribute(
      WEEK_INTERACTION_EVENT_TYPE_ATTRIBUTE,
      "all-day",
    );

    unmount();

    expect(weekEventRegistry.resolve("all-day-event", "all-day")).toBeNull();
  });

  it("unregisters the old element when a render swaps event ids", () => {
    const { rerender } = render(<RegistrationHarness eventId="event-1" />);

    expect(weekEventRegistry.resolve("event-1", "timed")).toBeTruthy();

    rerender(<RegistrationHarness eventId="event-2" />);

    expect(weekEventRegistry.resolve("event-1", "timed")).toBeNull();
    expect(weekEventRegistry.resolve("event-2", "timed")).toBeTruthy();
  });

  it("rejects stale or mismatched registrations", () => {
    const registry = createWeekEventRegistry();
    const staleElement = document.createElement("div");

    document.body.append(staleElement);
    registry.register({
      element: staleElement,
      eventId: "event-1",
      eventType: "timed",
    });
    staleElement.remove();

    expect(registry.resolve("event-1", "timed")).toBeNull();

    const mismatchedElement = document.createElement("div");

    document.body.append(mismatchedElement);
    registry.register({
      element: mismatchedElement,
      eventId: "event-2",
      eventType: "timed",
    });
    mismatchedElement.setAttribute(
      WEEK_INTERACTION_EVENT_ID_ATTRIBUTE,
      "other-event",
    );

    expect(registry.resolve("event-2", "timed")).toBeNull();
  });

  it("resolves a registered event from child pointer targets", () => {
    const registry = createWeekEventRegistry();
    const element = document.createElement("div");
    const child = document.createElement("span");

    element.append(child);
    document.body.append(element);
    registry.register({
      element,
      eventId: "event-1",
      eventType: "timed",
    });

    expect(registry.resolveFromTarget(child)).toEqual({
      element,
      eventId: "event-1",
      eventType: "timed",
    });
  });

  it("does not register draft timed events as saved targets", () => {
    const draftEvent = createTimedEvent({ _id: "draft-event" });

    renderWithStore(
      <RegisteredTimedEventHarness displayMode="draft" event={draftEvent} />,
    );

    expect(weekEventRegistry.resolve("draft-event", "timed")).toBeNull();
  });

  it("renders a saved timed event with the preview text style", () => {
    const event = createTimedEvent({
      endDate: futureFridayTimedEnd.format(),
      startDate: futureFridayTimedStart.format(),
    });

    renderWithStore(<RegisteredTimedEventHarness event={event} />);

    const title = screen.getByText("Timed event");
    const timeLabel = screen.getByText(/9\s+-\s+10 AM/);

    expect(title.style.lineHeight).toBe(GRID_EVENT_TITLE_LINE_HEIGHT);
    expect(timeLabel.style.fontSize).toBe(GRID_EVENT_TIME_LABEL_FONT_SIZE);
    expect(timeLabel.style.opacity).toBe(GRID_EVENT_TIME_LABEL_OPACITY);
    expect(timeLabel.previousElementSibling).toBe(title);
  });
});
