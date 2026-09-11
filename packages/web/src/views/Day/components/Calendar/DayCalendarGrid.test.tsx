import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { act } from "react";
import {
  type Calendar,
  getCalendarCapabilities,
} from "@core/types/calendar.contracts";
import { type CompassEvent } from "@core/types/compass-event.contracts";
import { CalendarIdSchema, EventIdSchema } from "@core/types/domain-primitives";
import { type Event, EventScheduleSchema } from "@core/types/event.contracts";
import dayjs from "@core/util/date/dayjs";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@web/__tests__/__mocks__/mock.render";
import { server } from "@web/__tests__/__mocks__/server/mock.server";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { seedHiddenEventIds } from "@web/__tests__/utils/hidden-events-test-data";
import { pressKey } from "@web/__tests__/utils/keyboard.test.util";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import { createCompassQueryClient } from "@web/api/query-client";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import { setCalendarVisibility } from "@web/calendars/calendar-visibility.store";
import { getLocalCalendarSentinelId } from "@web/calendars/local-calendar.sentinel";
import { ENV_WEB } from "@web/common/constants/env.constants";
import { ZIndex } from "@web/common/constants/web.constants";
import { emitViewCommand } from "@web/common/utils/dom/view-command-bus";
import { createTimedDraft } from "@web/common/utils/draft/draft.util";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import {
  createGridEventDraft,
  getGridDraftId,
  timedGridSchedule,
} from "@web/events/grid-event-draft.adapter";
import {
  draftActions,
  selectIsEventFormOpen,
  useDraftStore,
} from "@web/events/stores/draft.store";
import {
  HIDDEN_EVENT_STRIP_WIDTH,
  TIMED_EVENT_FAN_INDENT,
} from "@web/grid/grid.constants";
import * as realUsegridmeasurements from "@web/grid/hooks/useGridMeasurements";
import { type GridMeasurements } from "@web/grid/types/grid.types";
import * as realUsedateinview from "@web/views/Day/hooks/navigation/useDateInView";
import { dayEventRegistry } from "@web/views/Day/interaction/registry/day-event.registry";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  setSystemTime,
} from "bun:test";
import "@testing-library/jest-dom";

let seededEvents: Event[] = [];
const originalScroll = HTMLElement.prototype.scroll;

const measurements = {
  allDayRow: {
    bottom: 40,
    height: 40,
    left: 0,
    right: 180,
    top: 0,
    width: 180,
    x: 0,
    y: 0,
  },
  colWidths: [180, 180],
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

mockModuleForFile(
  "@web/views/Day/hooks/navigation/useDateInView",
  realUsedateinview,
  {
    useDateInView: () => dayjs("2026-05-20T00:00:00.000"),
  },
);

mockModuleForFile(
  "@web/grid/hooks/useGridMeasurements",
  realUsegridmeasurements,
  {
    useGridMeasurements: () => {
      const allDayColumnsRef = { current: null as HTMLDivElement | null };
      const mainGridRef = { current: null as HTMLDivElement | null };
      const timedColumnsRef = { current: null as HTMLDivElement | null };

      return {
        gridRefs: {
          allDayColumnsRef,
          allDayRef: (node: HTMLDivElement | null) => {
            allDayColumnsRef.current = node;
          },
          allDayRowRef: mock(),
          mainGridElementRef: (node: HTMLDivElement | null) => {
            mainGridRef.current = node;
          },
          mainGridRef,
          timedColumnsElementRef: (node: HTMLDivElement | null) => {
            timedColumnsRef.current = node;
          },
          timedColumnsRef,
        },
        measurements,
      };
    },
  },
);

// Stand-in for the sidebar-docked event details panel: DayCalendarGrid no
// longer renders any form itself — it only toggles the draft store — so the
// harness mounts this store-driven probe where Sidebar would mount
// SidebarEventDetails.
const EventFormProbe = () => {
  const isFormOpen = useDraftStore(selectIsEventFormOpen);

  return isFormOpen ? (
    <dialog aria-label="Event form" open>
      <input aria-label="Event Title" autoFocus />
    </dialog>
  ) : null;
};

const { DayCalendarGrid } =
  require("./DayCalendarGrid") as typeof import("./DayCalendarGrid");

const renderDayCalendarGrid = (
  calendars?: Calendar[],
  hiddenEventIds: readonly string[] = [],
) => {
  const queryClient = createCompassQueryClient();
  seedHiddenEventIds(queryClient, hiddenEventIds);
  if (calendars) {
    queryClient.setQueryData(calendarQueryKeys.all, calendars);
    // Seeded fixtures must survive the calendars query mount-fetch. Without
    // an MSW handler the failed GET clears the cache and
    // filterEventsByVisibleCalendars drops events mid-assertion (common in
    // CI). Keep the handler local — a global default breaks suites that
    // expect the legacy undefined calendarIds read.
    server.use(
      http.get(`${ENV_WEB.API_BASEURL}/calendars`, () => HttpResponse.json(calendars)),
    );
  }

  return {
    user: userEvent.setup(),
    ...render(
      <>
        <DayCalendarGrid />
        <EventFormProbe />
        <button type="button">Outside calendar</button>
      </>,
      { events: seededEvents, queryClient },
    ),
  };
};

const makeCalendar = (
  name: string,
  overrides: Partial<Calendar> = {},
): Calendar => ({
  id: CalendarIdSchema.parse(createObjectIdString()),
  name,
  description: "",
  timeZone: null,
  foregroundColor: "#ffffff",
  backgroundColor: "#2563eb",
  provider: "google",
  access: "owner",
  capabilities: getCalendarCapabilities("owner"),
  isPrimary: false,
  isVisible: true,
  isActive: true,
  ...overrides,
});

// `_id` in the overrides below is a readable test label, not the real id —
// draft.store.ts's mutation call sites gate on `EventIdSchema.safeParse`
// succeeding (see useUpdateEvent.ts), so every fixture gets a real generated
// ObjectId as its actual `_id`; tests that need to assert on "which event"
// read `event._id` back off the returned fixture, never a literal.
const createTimedEvent = (
  overrides: Partial<CompassEvent> & {
    _id: string;
    startDate: string;
    endDate: string;
  },
): CompassEvent =>
  ({
    isAllDay: false,
    recurrence: undefined,
    title: overrides._id,
    user: "user",
    ...overrides,
    _id: createObjectIdString(),
  }) as CompassEvent;

// DateTimeSchema requires an explicit offset; fixture timestamps above are
// written offset-free (browser-local style), so normalize to UTC here.
const withOffset = (dateTime: string) =>
  /[Zz]|[+-]\d\d:\d\d$/.test(dateTime) ? dateTime : `${dateTime}Z`;

// The query cache (unlike draft.store.ts, still legacy CompassEvent-shaped
// per its own TODO) requires strict-contract `Event`s.
//
// calendarId must match the anonymous local calendar the calendars query
// synthesizes. Otherwise filterEventsByVisibleCalendars drops every fixture
// once that query resolves mid-userEvent click (delay:0 yields to macrotasks
// between hover and pointerdown), and the card unmounts before the
// interaction engine can open it.
const toStrictEvent = (event: CompassEvent): Event =>
  createMockEvent({
    id: EventIdSchema.parse(event._id!),
    calendarId: getLocalCalendarSentinelId(),
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

const setDayEvents = (events: CompassEvent[]) => {
  seededEvents = events.map(toStrictEvent);
};

const getDraft = () => useDraftStore.getState().gridDraft;
const getGridDraft = () => useDraftStore.getState().gridDraft;
const getIsFormOpen = () => selectIsEventFormOpen(useDraftStore.getState());

const resetDraft = () => {
  draftActions.discard();
};

const getTimedGrid = () =>
  screen.getByRole("region", {
    name: "Timed events grid",
  });

const getAllDayRegion = () =>
  screen.getByRole("region", { name: "All-day events" });

const setDraftEvent = (event: CompassEvent) => {
  if (!event.startDate || !event.endDate) {
    return;
  }

  const draft = createGridEventDraft(
    event.isAllDay
      ? {
          kind: "allDay",
          start: new Date(event.startDate),
          end: new Date(event.endDate),
        }
      : timedGridSchedule(new Date(event.startDate), new Date(event.endDate)),
    event._id ? EventIdSchema.parse(event._id) : undefined,
  );
  draft.values.title = event.title ?? "";

  draftActions.startGridDraft({
    activity: "gridClick",
    draft,
  });
};

beforeEach(() => {
  seededEvents = [];
  // Pin midday so keyboardPlace drafts seeded from the current hour stay
  // inside a single calendar day (overnight drafts hit save/map edge cases).
  setSystemTime(new Date("2026-05-20T12:00:00.000Z"));
});

afterEach(() => {
  // bun's fake clock is process-global; restore it so a pinned test can't
  // leak its time into later tests or later files.
  setSystemTime();
  cleanup();
  if (originalScroll) {
    HTMLElement.prototype.scroll = originalScroll;
  } else {
    delete (HTMLElement.prototype as { scroll?: unknown }).scroll;
  }
  resetDraft();
  dayEventRegistry.clear();
  // Storage clearing + the hidden-ids store resync are both handled by the
  // global test-lifecycle afterEach (resetBrowserState + resetAllStores).
});

describe("DayCalendarGrid", () => {
  it("renders one timed column", () => {
    renderDayCalendarGrid();

    const timedGrid = getTimedGrid();
    expect(within(timedGrid).getAllByRole("columnheader")).toHaveLength(1);
  });

  it("renders enabled calendars as separate event columns", () => {
    const primary = makeCalendar("Primary", { isPrimary: true });
    const projects = makeCalendar("Projects");
    const hidden = makeCalendar("Hidden");
    // isVisible is client-derived from the hidden-ids store now, not a field
    // to seed directly on the fixture - see calendar-visibility.store.ts.
    setCalendarVisibility(hidden.id, false);
    seededEvents = [
      createMockEvent({
        calendarId: primary.id,
        content: { kind: "details", title: "Primary event", description: "" },
        schedule: EventScheduleSchema.parse({
          kind: "timed",
          start: "2026-05-20T09:00:00.000Z",
          end: "2026-05-20T10:00:00.000Z",
          timeZone: "UTC",
        }),
      }),
      createMockEvent({
        calendarId: projects.id,
        content: { kind: "details", title: "Project event", description: "" },
        schedule: EventScheduleSchema.parse({
          kind: "timed",
          start: "2026-05-20T09:00:00.000Z",
          end: "2026-05-20T10:00:00.000Z",
          timeZone: "UTC",
        }),
      }),
      createMockEvent({
        calendarId: hidden.id,
        content: { kind: "details", title: "Hidden event", description: "" },
        schedule: EventScheduleSchema.parse({
          kind: "timed",
          start: "2026-05-20T09:00:00.000Z",
          end: "2026-05-20T10:00:00.000Z",
          timeZone: "UTC",
        }),
      }),
    ];

    renderDayCalendarGrid([primary, projects, hidden]);

    const headers = screen.getByRole("region", { name: "Calendars" });
    expect(within(headers).getByText("Primary")).toBeInTheDocument();
    expect(within(headers).getByText("Projects")).toBeInTheDocument();
    expect(within(headers).queryByText("Hidden")).not.toBeInTheDocument();

    const primaryEvent = screen.getByRole("button", {
      name: /primary event/i,
    });
    const projectEvent = screen.getByRole("button", {
      name: /project event/i,
    });
    expect(screen.queryByRole("button", { name: /hidden event/i })).toBeNull();
    expect(within(getTimedGrid()).getAllByRole("columnheader")).toHaveLength(2);
    expect(parseFloat(projectEvent.style.left)).toBeGreaterThan(
      parseFloat(primaryEvent.style.left),
    );
  });

  it("falls back to the primary calendar when every calendar is disabled", () => {
    const primary = makeCalendar("Primary", { isPrimary: true });
    const disabled = makeCalendar("Disabled");
    setCalendarVisibility(primary.id, false);
    setCalendarVisibility(disabled.id, false);

    renderDayCalendarGrid([disabled, primary]);

    const headers = screen.getByRole("region", { name: "Calendars" });
    expect(within(headers).getByText("Primary")).toBeInTheDocument();
    expect(within(headers).queryByText("Disabled")).not.toBeInTheDocument();
    expect(within(getTimedGrid()).getAllByRole("columnheader")).toHaveLength(1);
  });

  it("renders all-day and timed regions without rendering tasks", () => {
    renderDayCalendarGrid();

    expect(getAllDayRegion()).toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "Task list" }),
    ).not.toBeInTheDocument();
  });

  it("lays overlapping timed events out as a left-anchored deck", () => {
    setDayEvents([
      createTimedEvent({
        _id: "early-overlap",
        endDate: "2026-05-20T10:30:00.000",
        startDate: "2026-05-20T09:00:00.000",
        title: "Early overlap",
      }),
      createTimedEvent({
        _id: "late-overlap",
        endDate: "2026-05-20T10:45:00.000",
        startDate: "2026-05-20T09:30:00.000",
        title: "Late overlap",
      }),
      createTimedEvent({
        _id: "solo",
        endDate: "2026-05-20T15:00:00.000",
        startDate: "2026-05-20T14:00:00.000",
        title: "Solo",
      }),
    ]);

    renderDayCalendarGrid();

    const early = screen.getByRole("button", { name: /early overlap/i });
    const late = screen.getByRole("button", { name: /late overlap/i });
    const solo = screen.getByRole("button", { name: /timed event: solo/i });

    expect(parseFloat(early.style.width)).toBe(parseFloat(late.style.width));
    expect(parseFloat(late.style.left) - parseFloat(early.style.left)).toBe(
      TIMED_EVENT_FAN_INDENT,
    );
    expect(early.style.boxShadow).toContain("0 0 0 0.75px");
    expect(late.style.boxShadow).toContain("0 0 0 0.75px");
    expect(Number(early.style.zIndex)).toBeLessThan(Number(late.style.zIndex));
    expect(parseFloat(solo.style.width)).toBeGreaterThan(
      parseFloat(early.style.width),
    );
  });

  it("renders hidden timed and all-day events as strips outside the drag registry", () => {
    const hiddenTimed = createTimedEvent({
      _id: "hidden-timed",
      endDate: "2026-05-20T10:30:00.000",
      startDate: "2026-05-20T09:00:00.000",
      title: "Hidden timed",
    });
    const visibleTimed = createTimedEvent({
      _id: "visible-timed",
      endDate: "2026-05-20T10:45:00.000",
      startDate: "2026-05-20T09:30:00.000",
      title: "Visible timed",
    });
    const hiddenAllDay = createTimedEvent({
      _id: "hidden-all-day",
      endDate: "2026-05-21T00:00:00.000",
      isAllDay: true,
      startDate: "2026-05-20T00:00:00.000",
      title: "Hidden all day",
    });
    setDayEvents([hiddenTimed, visibleTimed, hiddenAllDay]);

    renderDayCalendarGrid(undefined, [hiddenTimed._id!, hiddenAllDay._id!]);

    const visibleCard = screen.getByRole("button", {
      name: /timed event: visible timed/i,
    });
    const hiddenTimedCard = screen.getByRole("button", {
      name: /^Hidden Timed event: Hidden timed/,
    });
    const hiddenAllDayCard = screen.getByRole("button", {
      name: /^Hidden All-day event: Hidden all day/,
    });

    expect(Number(visibleCard.style.zIndex)).toBe(ZIndex.LAYER_1);
    expect(parseFloat(hiddenTimedCard.style.width)).toBe(
      HIDDEN_EVENT_STRIP_WIDTH,
    );
    expect(parseFloat(hiddenAllDayCard.style.width)).toBe(
      HIDDEN_EVENT_STRIP_WIDTH,
    );
    expect(parseFloat(visibleCard.style.width)).toBeGreaterThan(
      HIDDEN_EVENT_STRIP_WIDTH,
    );
    expect(dayEventRegistry.resolve(hiddenTimed._id!, "timed")).toBeNull();
    expect(dayEventRegistry.resolve(hiddenAllDay._id!, "all-day")).toBeNull();
    expect(dayEventRegistry.resolve(visibleTimed._id!, "timed")).toBe(
      visibleCard,
    );
  });

  it("keeps a focused Day deck card in its fan-out stack", () => {
    setDayEvents([
      createTimedEvent({
        _id: "back",
        endDate: "2026-05-20T10:30:00.000",
        startDate: "2026-05-20T09:00:00.000",
        title: "Back overlap",
      }),
      createTimedEvent({
        _id: "front",
        endDate: "2026-05-20T10:45:00.000",
        startDate: "2026-05-20T09:30:00.000",
        title: "Front overlap",
      }),
    ]);

    renderDayCalendarGrid();

    const back = screen.getByRole("button", { name: /back overlap/i });
    const initialBackZIndex = Number(back.style.zIndex);

    expect(initialBackZIndex).toBeLessThan(ZIndex.MAX);

    act(() => back.focus());
    expect(Number(back.style.zIndex)).toBe(initialBackZIndex);

    act(() => back.blur());
    expect(Number(back.style.zIndex)).toBe(initialBackZIndex);
  });

  it("keeps an existing draft event registered for Day calendar interactions", () => {
    const event = createTimedEvent({
      _id: "existing-draft",
      endDate: "2026-05-20T10:00:00.000",
      startDate: "2026-05-20T09:00:00.000",
      title: "Existing draft",
    });

    setDayEvents([event]);
    setDraftEvent(event);

    renderDayCalendarGrid();

    expect(
      screen
        .getByRole("button", { name: /timed event: existing draft/i })
        .getAttribute("data-day-interaction-event-id"),
    ).toBe(event._id ?? null);
  });

  it("opens the event form from a Day card keyboard interaction", async () => {
    const event = createTimedEvent({
      _id: "keyboard-open",
      endDate: "2026-05-20T10:00:00.000",
      startDate: "2026-05-20T09:00:00.000",
      title: "Keyboard open",
    });

    setDayEvents([event]);
    const { user } = renderDayCalendarGrid();

    const card = screen.getByRole("button", { name: /keyboard open/i });
    card.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(getGridDraftId(getDraft()!)).toBe(event._id ?? undefined);
    });
    expect(getIsFormOpen()).toBe(true);
  });

  it("opens the form when Enter is pressed on a form-closed keyboardPlace draft", async () => {
    createTimedDraft(dayjs("2026-05-20T00:00:00.000"), "keyboardPlace");
    const draft = getGridDraft();
    expect(draft).not.toBeNull();
    if (!draft) return;
    draft.values.title = "Placed draft";
    draftActions.setGridDraft(draft);
    expect(getIsFormOpen()).toBe(false);

    const { user } = renderDayCalendarGrid();
    const card = screen.getByRole("button", {
      name: /timed event: placed draft/i,
    });
    const draftId = getGridDraftId(getGridDraft()!);
    expect(draftId).toBeDefined();
    expect(card.getAttribute("data-day-interaction-event-id")).toBe(
      draftId ?? null,
    );

    card.focus();
    expect(document.activeElement).toBe(card);
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(getIsFormOpen()).toBe(true);
    });
    expect(useDraftStore.getState().status?.activity).toBe("keyboardPlace");
  });

  it("opens the shared event action menu from a Day timed event right-click", async () => {
    setDayEvents([
      createTimedEvent({
        _id: "right-click-event",
        endDate: "2026-05-20T10:00:00.000",
        startDate: "2026-05-20T09:00:00.000",
        title: "Right click event",
      }),
    ]);
    const { user } = renderDayCalendarGrid();
    await user.pointer([
      {
        keys: "[MouseRight>]",
        target: screen.getByRole("button", { name: /right click event/i }),
      },
      { keys: "[/MouseRight]" },
    ]);

    await waitFor(() => {
      expect(screen.getByText("Edit")).toBeInTheDocument();
    });
    expect(screen.getByText("Duplicate")).toBeInTheDocument();
    expect(screen.getByText("Hide event")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
    expect(screen.queryByText("Delete Event")).not.toBeInTheDocument();
  });

  it("seeds CREATE_TIMED_DRAFT with the default target calendar, not column 0", async () => {
    // Pin the clock: createTimedDraft derives the draft from the real
    // `dayjs()` hour, so between 23:00 and 23:59 UTC the 1-hour draft runs
    // past midnight, becomes multi-day, and renders in the all-day row
    // instead of as the timed card this test looks for.
    setSystemTime(new Date("2026-05-20T10:00:00.000Z"));

    // Holidays is first in column order (read-only, visible) but is not the
    // default create target — primary writable Google is. Shortcut drafts
    // must land on primary so the grid column matches the form.
    const holidays = makeCalendar("Holidays in United States", {
      access: "reader",
      capabilities: getCalendarCapabilities("reader"),
    });
    const primary = makeCalendar("compasscaltest3@gmail.com", {
      isPrimary: true,
    });
    renderDayCalendarGrid([holidays, primary]);

    act(() => {
      emitViewCommand("CREATE_TIMED_DRAFT");
    });

    await waitFor(() => {
      expect(getGridDraft()?.values.calendarId).toBe(primary.id);
      expect(getIsFormOpen()).toBe(true);
    });

    const draftCard = screen.getByRole("button", {
      name: /timed event: untitled event/i,
    });
    // Column widths are 180; primary is the second column (index 1).
    expect(parseFloat(draftCard.style.left)).toBeGreaterThanOrEqual(180);
  });

  it("seeds CREATE_ALLDAY_DRAFT with the default target calendar, not column 0", async () => {
    const holidays = makeCalendar("Holidays in United States", {
      access: "reader",
      capabilities: getCalendarCapabilities("reader"),
    });
    const primary = makeCalendar("compasscaltest3@gmail.com", {
      isPrimary: true,
    });
    renderDayCalendarGrid([holidays, primary]);

    act(() => {
      emitViewCommand("CREATE_ALLDAY_DRAFT");
    });

    await waitFor(() => {
      expect(getGridDraft()?.values.calendarId).toBe(primary.id);
      expect(getIsFormOpen()).toBe(true);
    });

    const draftCard = screen.getByRole("button", {
      name: /all-day event: untitled event/i,
    });
    expect(parseFloat(draftCard.style.left)).toBeGreaterThanOrEqual(180);
  });

  it("renders a saved all-day event at full calendar-column width", async () => {
    const primary = makeCalendar("Primary", { isPrimary: true });
    const projects = makeCalendar("Projects");
    seededEvents = [
      createMockEvent({
        calendarId: projects.id,
        content: {
          kind: "details",
          title: "Column width all-day",
          description: "",
        },
        schedule: EventScheduleSchema.parse({
          kind: "allDay",
          start: "2026-05-20",
          end: "2026-05-21",
        }),
      }),
    ];
    renderDayCalendarGrid([primary, projects]);

    const eventButton = await screen.findByRole("button", {
      name: /all-day event: column width all-day/i,
    });

    expect(parseFloat(eventButton.style.width)).toBe(170);
    expect(parseFloat(eventButton.style.height)).toBe(20);
    expect(parseFloat(eventButton.style.left)).toBe(180);
    expect(parseFloat(eventButton.style.top)).toBe(3);
  });

  it("scrolls the Day timed grid to now when the Day view requests it", () => {
    const scroll = mock();

    HTMLElement.prototype.scroll = scroll;
    renderDayCalendarGrid();
    scroll.mockClear();

    emitViewCommand("SCROLL_TO_NOW_LINE");

    expect(scroll).toHaveBeenCalledWith(
      expect.objectContaining({
        behavior: "smooth",
        top: expect.any(Number),
      }),
    );
  });

  it("seeds a keyboardPlace draft on the focused writable column", async () => {
    const personal = makeCalendar("Personal");
    const work = makeCalendar("Work", { isPrimary: true });
    renderDayCalendarGrid([personal, work]);

    const personalColumn = await screen.findByRole("button", {
      name: "Focus Personal column",
    });
    act(() => {
      personalColumn.focus();
    });

    pressKey("ArrowDown", {
      keyDownInit: { shiftKey: true },
      keyUpInit: { shiftKey: true },
    });

    await waitFor(() => {
      expect(getGridDraft()?.values.calendarId).toBe(personal.id);
    });
    expect(getIsFormOpen()).toBe(false);
    expect(useDraftStore.getState().status?.activity).toBe("keyboardPlace");
  });

  it("seeds CREATE_TIMED_DRAFT on the focused writable column", async () => {
    const personal = makeCalendar("Personal");
    const work = makeCalendar("Work", { isPrimary: true });
    renderDayCalendarGrid([personal, work]);

    const personalColumn = await screen.findByRole("button", {
      name: "Focus Personal column",
    });
    act(() => {
      personalColumn.focus();
    });

    act(() => {
      emitViewCommand("CREATE_TIMED_DRAFT");
    });

    await waitFor(() => {
      expect(getGridDraft()?.values.calendarId).toBe(personal.id);
      expect(getIsFormOpen()).toBe(true);
    });
  });

  it("highlights the focused calendar column on the timed and all-day grids", async () => {
    const personal = makeCalendar("Personal");
    const work = makeCalendar("Work", { isPrimary: true });
    renderDayCalendarGrid([personal, work]);

    const personalColumn = await screen.findByRole("button", {
      name: "Focus Personal column",
    });
    act(() => {
      personalColumn.focus();
    });

    await waitFor(() => {
      expect(
        within(getTimedGrid())
          .getByRole("columnheader", { name: /Personal, / })
          .getAttribute("data-focused-column"),
      ).toBe("true");
      expect(
        within(getAllDayRegion())
          .getByRole("columnheader", { name: /Personal, / })
          .getAttribute("data-focused-column"),
      ).toBe("true");
    });
  });
});
