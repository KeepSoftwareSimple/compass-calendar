import { type Event, EventScheduleSchema } from "@core/types/event.contracts";
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@web/__tests__/__mocks__/mock.render";
import { toNormalizedEventQueryData } from "@web/__tests__/utils/event-query-test-data";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { createCompassQueryClient } from "@web/api/query-client";
import { Z_INDEX_FLOATING_MENU } from "@web/common/constants/web.constants";
import { type GridEvent } from "@web/common/types/web.event.types";
import { gridEventDefaultPosition } from "@web/common/utils/event/event.util";
import { ContextMenuWrapper } from "@web/components/ContextMenu/GridContextMenuWrapper";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import { draftActions } from "@web/events/stores/draft.store";
import {
  DAY_INTERACTION_EVENT_ID_ATTRIBUTE,
  WEEK_INTERACTION_EVENT_ID_ATTRIBUTE,
} from "@web/grid/interaction/view-event-registry";
import { useDayCalendarContextMenu } from "@web/views/Day/components/Calendar/DayCalendarContextMenu";
import { afterEach, describe, expect, it } from "bun:test";
import "@testing-library/jest-dom";

// The menu used to render inline with a hardcoded z-2, so any event card
// stacked above 2 painted over it. Cards carry inline z-indexes inside the
// grid's stacking context, so the menu has to leave that context and carry
// the shared floating-menu z-index. Nothing else asserts this: a menu that
// renders behind a card still passes every other test in the suite.

const WRAPPER_ID = "test-context-wrapper";

const event: Event = createMockEvent({
  content: { kind: "details", title: "Stacked event", description: "" },
  schedule: EventScheduleSchema.parse({
    kind: "timed",
    start: "2024-01-15T09:00:00.000Z",
    end: "2024-01-15T10:00:00.000Z",
    timeZone: "UTC",
  }),
});

// The day view hands its menu a GridEvent directly rather than looking one up.
const gridEvent = {
  ...event,
  _id: event.id,
  position: gridEventDefaultPosition,
} as unknown as GridEvent;

// The wrapper looks the right-clicked id up in the query cache, and
// seedEventQueries only sets query *defaults* - those never materialize into
// a cache entry unless something mounts the query. Write the entry directly.
// findEventInCache scans every cached entry regardless of source, so the
// unauthenticated default is enough.
const seedCacheEntry = () => {
  const queryClient = createCompassQueryClient();
  queryClient.setQueryData(
    eventQueryKeys.week({
      source: "local",
      start: "2024-01-14T00:00:00.000Z",
      end: "2024-01-21T00:00:00.000Z",
    }),
    toNormalizedEventQueryData([event]),
  );
  return queryClient;
};

afterEach(() => {
  draftActions.discard();
  cleanup();
});

const expectMenuFloatsAboveTheGrid = () => {
  const menu = document.querySelector<HTMLElement>(".c-context-menu");
  expect(menu).not.toBeNull();
  expect(menu?.style.zIndex).toBe(String(Z_INDEX_FLOATING_MENU));
  expect(menu?.closest(`#${WRAPPER_ID}`)).toBeNull();
};

describe("context menu layering", () => {
  it("floats the week grid's menu above the event cards", () => {
    render(
      <ContextMenuWrapper id={WRAPPER_ID}>
        {/* Stands in for an event card: the wrapper reads the id off the
            right-clicked element. */}
        <div {...{ [WEEK_INTERACTION_EVENT_ID_ATTRIBUTE]: event.id }}>
          Stacked event
        </div>
      </ContextMenuWrapper>,
      { queryClient: seedCacheEntry() },
    );

    fireEvent.contextMenu(screen.getByText("Stacked event"));

    expectMenuFloatsAboveTheGrid();
  });

  // Right-clicking a card whose id isn't in the cache (unsaved drafts,
  // week-transition placeholderData, optimistically removed events) used to
  // throw an uncaught "Selected event not found" and take down the grid.
  // Now the miss is a no-op: no throw, no menu.
  it("ignores a right-click on an event that isn't in the cache", () => {
    render(
      <ContextMenuWrapper id={WRAPPER_ID}>
        <div {...{ [WEEK_INTERACTION_EVENT_ID_ATTRIBUTE]: "not-in-cache" }}>
          Orphan event
        </div>
      </ContextMenuWrapper>,
      { queryClient: createCompassQueryClient() },
    );

    expect(() =>
      fireEvent.contextMenu(screen.getByText("Orphan event")),
    ).not.toThrow();

    expect(document.querySelector(".c-context-menu")).toBeNull();
  });

  // The day view builds its own menu around the same component. It used to
  // lean on a z-index baked into the shared stylesheet, so removing that
  // silently dropped it behind every card.
  it("floats the day grid's menu above the event cards", () => {
    const DayHarness = () => {
      const { contextMenu, handleContextMenu } = useDayCalendarContextMenu({
        getDayEventById: () => gridEvent,
        onOpenEvent: () => {},
      });

      return (
        // biome-ignore lint/a11y/noStaticElementInteractions: stands in for the day grid, which forwards right-clicks from its cards.
        <div id={WRAPPER_ID} onContextMenu={handleContextMenu}>
          <div {...{ [DAY_INTERACTION_EVENT_ID_ATTRIBUTE]: event.id }}>
            Stacked event
          </div>
          {contextMenu}
        </div>
      );
    };

    render(<DayHarness />, {
      queryClient: seedCacheEntry(),
    });

    fireEvent.contextMenu(screen.getByText("Stacked event"));

    expectMenuFloatsAboveTheGrid();
  });
});
