import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Origin } from "@core/constants/core.constants";
import { type Event } from "@core/types/event.contracts";
import dayjs from "@core/util/date/dayjs";
import { type GridEvent } from "@web/common/types/web.event.types";
import { gridEventDefaultPosition } from "@web/common/utils/event/event.util";
import { type GridEventDraft } from "@web/events/event-draft.types";
import {
  createGridEventDraft,
  editGridEventDraft,
} from "@web/events/grid-event-draft.adapter";
import { draftActions, useDraftStore } from "@web/events/stores/draft.store";
import { GRID_EVENT_SIDEBAR_EDITING_BOX_SHADOW } from "@web/grid/components/calendar-accent.util";
import { DECK_MIN_WIDTH } from "@web/grid/grid.constants";
import { type WeekProps } from "@web/views/Week/hooks/useWeek";
import { GridDraft } from "./GridDraft";
import { afterEach, describe, expect, it } from "bun:test";

const createDraft = (
  overrides: {
    endDate?: string;
    isAllDay?: boolean;
    startDate?: string;
    title?: string;
  } = {},
): GridEventDraft => {
  const {
    endDate = "2026-05-26T15:00:00.000Z",
    isAllDay = false,
    startDate = "2026-05-26T14:00:00.000Z",
    title = "Planning",
  } = overrides;

  const draft = createGridEventDraft(
    isAllDay
      ? { kind: "allDay", start: new Date(startDate), end: new Date(endDate) }
      : {
          kind: "timed",
          start: new Date(startDate),
          end: new Date(endDate),
          timeZone: "UTC",
        },
  );
  if (draft.kind !== "create") throw new Error("Expected a create draft");

  return { ...draft, values: { ...draft.values, title } };
};

const createSchemaGridEvent = (
  overrides: Partial<GridEvent> = {},
): GridEvent => ({
  description: "",
  endDate: "2026-05-26T15:00:00.000Z",
  isAllDay: false,
  origin: Origin.COMPASS,
  position: gridEventDefaultPosition,
  startDate: "2026-05-26T14:00:00.000Z",
  title: "Planning",
  user: "user-1",
  ...overrides,
});

const createWeekProps = (): WeekProps =>
  ({
    component: {
      endOfView: dayjs("2026-05-30T23:59:59.999"),
      startOfView: dayjs("2026-05-24T00:00:00.000"),
      weekDays: [...Array(7)].map((_, index) =>
        dayjs("2026-05-24T00:00:00.000").add(index, "day"),
      ),
    },
    query: {
      endOfView: dayjs("2026-05-30T23:59:59.999"),
      startOfView: dayjs("2026-05-24T00:00:00.000"),
    },
  }) as WeekProps;

const renderGridDraft = ({
  activeAllDayDraftEvent = null,
  deckLayout = null,
  draft = createDraft(),
  recurringPreviews = [],
}: {
  activeAllDayDraftEvent?: GridEvent | null;
  deckLayout?: { groupSize: number; order: number } | null;
  draft?: GridEventDraft;
  recurringPreviews?: GridEvent[];
} = {}) =>
  render(
    <GridDraft
      activeAllDayDraftEvent={activeAllDayDraftEvent}
      deckLayout={deckLayout}
      draft={draft}
      measurements={{
        allDayRow: null,
        colWidths: [100, 100, 100, 100, 100, 100, 100],
        hourHeight: 48,
        mainGrid: null,
      }}
      recurringPreviews={recurringPreviews}
      weekProps={createWeekProps()}
    />,
  );

afterEach(() => {
  document.body.innerHTML = "";
  draftActions.discard();
});

describe("GridDraft", () => {
  it("positions all-day drafts in the all-day row", () => {
    renderGridDraft({
      draft: createDraft({
        endDate: "2026-05-27T00:00:00.000Z",
        isAllDay: true,
        startDate: "2026-05-26T00:00:00.000Z",
      }),
    });

    expect(
      screen.getByRole("button", { name: /All-day event: Planning/ }),
    ).toHaveStyle({
      height: "20px",
      left: "200px",
      top: "3px",
      width: "90px",
    });
  });

  it("uses the positioned all-day draft row when one is provided", () => {
    const draft = createDraft({
      endDate: "2026-05-27T00:00:00.000Z",
      isAllDay: true,
      startDate: "2026-05-26T00:00:00.000Z",
    });

    renderGridDraft({
      activeAllDayDraftEvent: {
        ...createSchemaGridEvent({
          endDate: "2026-05-27T00:00:00.000Z",
          isAllDay: true,
          startDate: "2026-05-26T00:00:00.000Z",
        }),
        row: 3,
      },
      draft,
    });

    expect(
      screen.getByRole("button", { name: /All-day event: Planning/ }),
    ).toHaveStyle({
      top: "49px",
    });
  });

  it("keeps an active overlapping saved draft at its stacked width and stack order", () => {
    const deckLayout = { groupSize: 2, order: 0 };

    renderGridDraft({
      deckLayout,
    });

    const draftBlock = screen.getByRole("button", {
      name: /Timed event: Planning/,
    });

    expect(draftBlock.style.width).toBe(`${DECK_MIN_WIDTH}px`);
    expect(Number(draftBlock.style.zIndex)).toBe(deckLayout.order + 1);
  });

  it("renders a read-only card for each recurring preview occurrence", () => {
    renderGridDraft({
      recurringPreviews: [
        createSchemaGridEvent({
          _id: undefined,
          endDate: "2026-05-27T15:00:00.000Z",
          startDate: "2026-05-27T14:00:00.000Z",
        }),
        createSchemaGridEvent({
          _id: undefined,
          endDate: "2026-05-28T15:00:00.000Z",
          startDate: "2026-05-28T14:00:00.000Z",
        }),
      ],
    });

    expect(
      screen.getAllByRole("button", { name: /Timed event: Planning/ }),
    ).toHaveLength(3);
  });

  it("shows the sidebar-editing ring on an open timed edit draft", () => {
    const source = {
      id: "0123456789abcdef01234567",
      calendarId: "0123456789abcdef76543210",
      content: {
        kind: "details" as const,
        title: "Planning",
        description: "",
        colorHex: "#c4b5fd",
      },
      schedule: {
        kind: "timed" as const,
        start: "2026-05-26T14:00:00.000Z",
        end: "2026-05-26T15:00:00.000Z",
        timeZone: "UTC",
      },
      recurrence: { kind: "single" as const },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: null,
    } as unknown as Event;
    const draft = editGridEventDraft(source);
    if (!draft) throw new Error("expected edit draft");
    draftActions.startGridDraft({ activity: "gridClick", draft });

    renderGridDraft({ draft });

    const card = screen.getByRole("button", { name: /Timed event: Planning/ });
    expect(card.style.getPropertyValue("--event-bg")).toBe("#c4b5fd");
    expect(card.style.boxShadow).toContain(
      GRID_EVENT_SIDEBAR_EDITING_BOX_SHADOW,
    );
  });

  it("opens the form when Enter is pressed on a form-closed draft", async () => {
    const draft = createDraft();
    draftActions.startGridDraft({ activity: "keyboardPlace", draft });
    expect(useDraftStore.getState().status?.isFormOpen).toBe(false);

    renderGridDraft({ draft });
    const user = userEvent.setup();
    const card = screen.getByRole("button", { name: /Timed event: Planning/ });
    card.focus();
    await user.keyboard("{Enter}");

    expect(useDraftStore.getState().status?.isFormOpen).toBe(true);
  });
});
