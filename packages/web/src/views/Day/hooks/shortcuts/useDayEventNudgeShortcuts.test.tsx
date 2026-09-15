import { HotkeyManager } from "@tanstack/react-hotkeys";
import { act } from "@testing-library/react";
import { Origin } from "@core/constants/core.constants";
import { EventIdSchema } from "@core/types/domain-primitives";
import { EventScheduleSchema } from "@core/types/event.contracts";
import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import {
  cleanup,
  renderHook,
  waitFor,
} from "@web/__tests__/__mocks__/mock.render";
import { toNormalizedEventQueryData } from "@web/__tests__/utils/event-query-test-data";
import { createMockCalendar } from "@web/__tests__/utils/factories/calendar.factory";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { pressKey } from "@web/__tests__/utils/keyboard.test.util";
import { createCompassQueryClient } from "@web/api/query-client";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import { ID_EVENT_FORM } from "@web/common/constants/web.constants";
import { type GridEvent } from "@web/common/types/web.event.types";
import { getBrowserTimeZone } from "@web/common/utils/datetime/web.date.util";
import { createTimedDraft } from "@web/common/utils/draft/draft.util";
import { gridEventDefaultPosition } from "@web/common/utils/event/event.util";
import {
  createGridEventDraft,
  timedGridSchedule,
} from "@web/events/grid-event-draft.adapter";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import { type EventRepository } from "@web/events/repositories/event.repository.types";
import { draftActions, useDraftStore } from "@web/events/stores/draft.store";
import {
  initialEdgeFocusState,
  useEdgeFocusStore,
} from "@web/grid/shortcuts/edge-focus.store";
import {
  dayEventRegistry,
  getDayInteractionTargetAttributes,
} from "@web/views/Day/interaction/registry/day-event.registry";
import { useDayEventNudgeShortcuts } from "./useDayEventNudgeShortcuts";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  setSystemTime,
} from "bun:test";

const TIMED_EVENT_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";
const LATER_TIMED_EVENT_ID = "cccccccccccccccccccccccc";
const ALL_DAY_EVENT_ID = "bbbbbbbbbbbbbbbbbbbbbbbb";

const timedEvent: GridEvent = {
  _id: TIMED_EVENT_ID,
  endDate: "2026-05-20T10:00:00.000",
  isAllDay: false,
  origin: Origin.COMPASS,
  position: gridEventDefaultPosition,
  startDate: "2026-05-20T09:00:00.000",
  title: "Timed event",
  user: "user-1",
};

const laterTimedEvent: GridEvent = {
  ...timedEvent,
  _id: LATER_TIMED_EVENT_ID,
  startDate: "2026-05-20T11:00:00.000",
  endDate: "2026-05-20T12:00:00.000",
  title: "Later event",
};

const allDayEvent: GridEvent = {
  _id: ALL_DAY_EVENT_ID,
  endDate: "2026-05-21",
  isAllDay: true,
  origin: Origin.COMPASS,
  position: gridEventDefaultPosition,
  startDate: "2026-05-20",
  title: "All-day event",
  user: "user-1",
};

const timedEventContract = createMockEvent({
  id: EventIdSchema.parse(TIMED_EVENT_ID),
  content: { kind: "details", title: "Timed event", description: "" },
  schedule: EventScheduleSchema.parse({
    kind: "timed",
    start: "2026-05-20T09:00:00.000Z",
    end: "2026-05-20T10:00:00.000Z",
    timeZone: "UTC",
  }),
});

const allDayEventContract = createMockEvent({
  id: EventIdSchema.parse(ALL_DAY_EVENT_ID),
  content: { kind: "details", title: "All-day event", description: "" },
  schedule: EventScheduleSchema.parse({
    kind: "allDay",
    start: "2026-05-20",
    end: "2026-05-21",
  }),
});

const shiftKey = {
  keyDownInit: { shiftKey: true },
  keyUpInit: { shiftKey: true },
};
const altShiftKey = {
  keyDownInit: { altKey: true, shiftKey: true },
  keyUpInit: { altKey: true, shiftKey: true },
};

const focusCalendarTarget = (
  eventId: string,
  eventType: "all-day" | "timed",
) => {
  const button = document.createElement("button");
  Object.defineProperty(button, "offsetParent", {
    configurable: true,
    get: () => document.body,
  });
  document.body.appendChild(button);
  dayEventRegistry.register({
    element: button,
    eventId,
    eventType,
  });
  button.focus();
  return button;
};

/** A read-only card: attributes stamped, deliberately never registered. */
const addReadOnlyCalendarTarget = (
  eventId: string,
  eventType: "all-day" | "timed" = "timed",
) => {
  const button = document.createElement("button");
  Object.defineProperty(button, "offsetParent", {
    configurable: true,
    get: () => document.body,
  });
  const attributes = getDayInteractionTargetAttributes({
    eventId,
    eventType,
    isReadOnly: true,
  });
  for (const [key, value] of Object.entries(attributes)) {
    button.setAttribute(key, value);
  }
  document.body.appendChild(button);
  return button;
};

const renderEditShortcuts = ({
  allDayEvents = [],
  createDraftAtTime = () => {},
  navigateToDate,
  placeTimedDraft,
  timedEvents = [timedEvent],
}: {
  allDayEvents?: GridEvent[];
  createDraftAtTime?: (start: Dayjs) => void;
  navigateToDate?: (date: Dayjs) => void;
  placeTimedDraft?: () => void;
  timedEvents?: GridEvent[];
} = {}) => {
  const queryClient = createCompassQueryClient();
  const contracts = [timedEventContract];
  if (allDayEvents.some((event) => event._id === ALL_DAY_EVENT_ID)) {
    contracts.push(allDayEventContract);
  }
  queryClient.setQueryData(
    eventQueryKeys.day({
      source: "local",
      start: "2026-05-20T00:00:00.000Z",
      end: "2026-05-21T00:00:00.000Z",
    }),
    toNormalizedEventQueryData(contracts),
  );
  queryClient.setQueryData(calendarQueryKeys.all, [
    createMockCalendar({ id: timedEventContract.calendarId }),
  ]);
  const repository: EventRepository = {
    list: async () => [],
    create: async () => timedEventContract,
    replace: async (id, input) => {
      // The write contract's guest-edit field never round-trips into the
      // read-side Event content this stub returns.
      const { attendees: _guestEdit, ...content } = input.content;
      return {
        ...(id === ALL_DAY_EVENT_ID ? allDayEventContract : timedEventContract),
        id,
        content,
        schedule: input.schedule,
      };
    },
    delete: async () => {},
  };
  const dependencies = {
    source: "local" as const,
    repository,
    markWrite: async () => {},
    reportError: () => {},
  };
  const rendered = renderHook(
    () =>
      useDayEventNudgeShortcuts({
        allDayEvents,
        createDraftAtTime,
        dependencies,
        getQuickTimeDay: () => dayjs("2026-08-05"),
        navigateToDate,
        placeTimedDraft,
        timedEvents,
        visibleDays: [dayjs("2026-08-05")],
      }),
    {
      events: contracts,
      queryClient,
    },
  );
  return { queryClient, rendered };
};

const offsetString = (date: Dayjs) =>
  dayjs.tz(date.toDate(), getBrowserTimeZone()).format();

const getEditMutation = (
  queryClient: ReturnType<typeof createCompassQueryClient>,
) =>
  queryClient
    .getMutationCache()
    .getAll()
    .find((mutation) => mutation.options.mutationKey?.[2] === "replace");

beforeEach(() => {
  // Pin midday so keyboardPlace drafts (seeded from dayjs().hour()) do not
  // land near midnight and reject the next 15-minute Shift+Arrow move.
  setSystemTime(new Date("2026-05-20T12:00:00.000Z"));
  HotkeyManager.resetInstance();
  draftActions.discard();
  useEdgeFocusStore.setState(initialEdgeFocusState, true);
});

afterEach(() => {
  cleanup();
  dayEventRegistry.clear();
  draftActions.discard();
  useEdgeFocusStore.setState(initialEdgeFocusState, true);
  document.body.innerHTML = "";
  setSystemTime();
});

describe("useDayEventNudgeShortcuts", () => {
  it("labels a read-only event for event jump even though it never registers", () => {
    const readOnlyButton = addReadOnlyCalendarTarget(TIMED_EVENT_ID);
    const { rendered } = renderEditShortcuts();

    act(() => {
      pressKey("h");
    });

    // Compare ids, never the nodes: a failed toEqual on a jsdom element
    // serializes the whole tree and eats the test process.
    const hints = rendered.result.current.shiftHints;
    expect(hints.map((hint) => hint.eventId)).toEqual([TIMED_EVENT_ID]);
    expect(hints[0]?.element).toBe(readOnlyButton);
  });

  it("moves the focused timed event 15 minutes earlier with Shift+ArrowUp", async () => {
    focusCalendarTarget(TIMED_EVENT_ID, "timed");
    const { queryClient } = renderEditShortcuts();

    pressKey("ArrowUp", shiftKey);

    await waitFor(() => {
      expect(getEditMutation(queryClient)).toBeDefined();
    });
    const { input } = getEditMutation(queryClient)?.state.variables as {
      input: { schedule: { start: string; end: string } };
    };
    expect(input.schedule.start).toBe(
      offsetString(dayjs(timedEvent.startDate).subtract(15, "minutes")),
    );
    expect(input.schedule.end).toBe(
      offsetString(dayjs(timedEvent.endDate).subtract(15, "minutes")),
    );
  });

  it("moves the focused timed event 15 minutes later with Shift+ArrowDown", async () => {
    focusCalendarTarget(TIMED_EVENT_ID, "timed");
    const { queryClient } = renderEditShortcuts();

    pressKey("ArrowDown", shiftKey);

    await waitFor(() => {
      expect(getEditMutation(queryClient)).toBeDefined();
    });
    const { input } = getEditMutation(queryClient)?.state.variables as {
      input: { schedule: { start: string } };
    };
    expect(input.schedule.start).toBe(
      offsetString(dayjs(timedEvent.startDate).add(15, "minutes")),
    );
  });

  it("moves the focused timed event to the next day with Shift+ArrowRight", async () => {
    const navigateToDate = mock(() => {});
    focusCalendarTarget(TIMED_EVENT_ID, "timed");
    const { queryClient } = renderEditShortcuts({ navigateToDate });

    pressKey("ArrowRight", shiftKey);

    await waitFor(() => {
      expect(getEditMutation(queryClient)).toBeDefined();
    });
    const { input } = getEditMutation(queryClient)?.state.variables as {
      input: { schedule: { start: string } };
    };
    expect(input.schedule.start).toBe(
      offsetString(dayjs(timedEvent.startDate).add(1, "day")),
    );
    expect(navigateToDate).toHaveBeenCalled();
  });

  it("moves the focused timed event an hour earlier with Alt+Shift+ArrowUp", async () => {
    focusCalendarTarget(TIMED_EVENT_ID, "timed");
    const { queryClient } = renderEditShortcuts();

    pressKey("ArrowUp", altShiftKey);

    await waitFor(() => {
      expect(getEditMutation(queryClient)).toBeDefined();
    });
    const { input } = getEditMutation(queryClient)?.state.variables as {
      input: { schedule: { start: string; end: string } };
    };
    expect(input.schedule.start).toBe(
      offsetString(dayjs(timedEvent.startDate).subtract(60, "minutes")),
    );
    expect(input.schedule.end).toBe(
      offsetString(dayjs(timedEvent.endDate).subtract(60, "minutes")),
    );
  });

  it("moves the focused timed event a week later with Alt+Shift+ArrowRight", async () => {
    const navigateToDate = mock(() => {});
    focusCalendarTarget(TIMED_EVENT_ID, "timed");
    const { queryClient } = renderEditShortcuts({ navigateToDate });

    pressKey("ArrowRight", altShiftKey);

    await waitFor(() => {
      expect(getEditMutation(queryClient)).toBeDefined();
    });
    const { input } = getEditMutation(queryClient)?.state.variables as {
      input: { schedule: { start: string } };
    };
    expect(input.schedule.start).toBe(
      offsetString(dayjs(timedEvent.startDate).add(7, "day")),
    );
    expect(navigateToDate).toHaveBeenCalled();
  });

  it("moves the focused all-day event a week earlier with Alt+Shift+ArrowLeft", async () => {
    focusCalendarTarget(ALL_DAY_EVENT_ID, "all-day");
    const { queryClient } = renderEditShortcuts({
      allDayEvents: [allDayEvent],
      timedEvents: [],
    });

    pressKey("ArrowLeft", altShiftKey);

    await waitFor(() => {
      expect(getEditMutation(queryClient)).toBeDefined();
    });
    const { input } = getEditMutation(queryClient)?.state.variables as {
      input: { schedule: { start: string; end: string } };
    };
    expect(input.schedule.start).toBe("2026-05-13");
    expect(input.schedule.end).toBe("2026-05-14");
  });

  it("does not convert an all-day event with Alt+Shift+ArrowDown", async () => {
    focusCalendarTarget(ALL_DAY_EVENT_ID, "all-day");
    const { queryClient } = renderEditShortcuts({
      allDayEvents: [allDayEvent],
      timedEvents: [],
    });

    pressKey("ArrowDown", altShiftKey);

    expect(getEditMutation(queryClient)).toBeUndefined();
  });

  it("moves the focused all-day event to the previous day with Shift+ArrowLeft", async () => {
    focusCalendarTarget(ALL_DAY_EVENT_ID, "all-day");
    const { queryClient } = renderEditShortcuts({
      allDayEvents: [allDayEvent],
      timedEvents: [],
    });

    pressKey("ArrowLeft", shiftKey);

    await waitFor(() => {
      expect(getEditMutation(queryClient)).toBeDefined();
    });
    const { input } = getEditMutation(queryClient)?.state.variables as {
      input: { schedule: { start: string; end: string } };
    };
    expect(input.schedule.start).toBe("2026-05-19");
    expect(input.schedule.end).toBe("2026-05-20");
  });

  it("converts a focused all-day event to timed with Shift+ArrowDown", async () => {
    focusCalendarTarget(ALL_DAY_EVENT_ID, "all-day");
    const { queryClient } = renderEditShortcuts({
      allDayEvents: [allDayEvent],
      timedEvents: [],
    });

    pressKey("ArrowDown", shiftKey);

    await waitFor(() => {
      expect(getEditMutation(queryClient)).toBeDefined();
    });
    const { input } = getEditMutation(queryClient)?.state.variables as {
      input: { schedule: { start: string; end: string } };
    };
    expect(input.schedule.start).toBe(
      offsetString(dayjs("2026-05-20T09:00:00.000")),
    );
    expect(input.schedule.end).toBe(
      offsetString(dayjs("2026-05-20T10:00:00.000")),
    );
  });

  it("does not convert an edge-focused all-day event with Shift+ArrowDown", async () => {
    focusCalendarTarget(ALL_DAY_EVENT_ID, "all-day");
    const { queryClient } = renderEditShortcuts({
      allDayEvents: [allDayEvent],
      timedEvents: [],
    });
    pressKey("Tab");

    pressKey("ArrowDown", shiftKey);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getEditMutation(queryClient)).toBeUndefined();
  });

  it("does not move anything when no event is focused", async () => {
    const { queryClient } = renderEditShortcuts();

    pressKey("ArrowUp", shiftKey);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getEditMutation(queryClient)).toBeUndefined();
  });

  it("places a keyboardPlace timed draft when Shift+Arrow is pressed with no focus", () => {
    const placeTimedDraft = mock(() => {
      createTimedDraft(dayjs("2026-05-20T00:00:00.000"), "keyboardPlace");
    });
    renderEditShortcuts({ placeTimedDraft });

    pressKey("ArrowDown", shiftKey);

    expect(placeTimedDraft).toHaveBeenCalled();
    const { status } = useDraftStore.getState();
    expect(status?.activity).toBe("keyboardPlace");
    expect(status?.isFormOpen).toBe(false);
  });

  it("repositions a keyboardPlace draft with a later Shift+Arrow", () => {
    const placeTimedDraft = mock(() => {
      createTimedDraft(dayjs("2026-05-20T00:00:00.000"), "keyboardPlace");
    });
    renderEditShortcuts({ placeTimedDraft });

    pressKey("ArrowDown", shiftKey);

    const placedStart =
      useDraftStore.getState().gridDraft?.values.schedule.start;
    expect(placedStart).toBeDefined();

    pressKey("ArrowDown", shiftKey);

    expect(
      dayjs(useDraftStore.getState().gridDraft?.values.schedule.start).format(),
    ).toBe(dayjs(placedStart).add(15, "minutes").format());
    expect(useDraftStore.getState().status?.isFormOpen).toBe(false);
    expect(placeTimedDraft).toHaveBeenCalledTimes(1);
  });

  it("does not place a draft when Shift+Arrow is pressed while the form is open", () => {
    const placeTimedDraft = mock(() => {});
    const draft = createGridEventDraft(
      timedGridSchedule(
        new Date("2026-05-20T09:00:00.000"),
        new Date("2026-05-20T10:00:00.000"),
      ),
    );
    draftActions.startGridDraft({ activity: "keyboardPlace", draft });
    draftActions.setFormOpen(true);
    renderEditShortcuts({ placeTimedDraft });

    pressKey("ArrowDown", shiftKey);

    expect(placeTimedDraft).not.toHaveBeenCalled();
    expect(
      dayjs(useDraftStore.getState().gridDraft?.values.schedule.start).format(),
    ).toBe(dayjs("2026-05-20T09:00:00.000").format());
  });

  it("discards a repositioned keyboardPlace draft on Escape", () => {
    const placeTimedDraft = mock(() => {
      createTimedDraft(dayjs("2026-05-20T00:00:00.000"), "keyboardPlace");
    });
    renderEditShortcuts({ placeTimedDraft });

    pressKey("ArrowDown", shiftKey);
    pressKey("ArrowDown", shiftKey);
    expect(useDraftStore.getState().status?.activity).toBe("keyboardPlace");

    pressKey("Escape");

    expect(useDraftStore.getState().gridDraft).toBeNull();
    expect(useDraftStore.getState().status?.isDrafting).toBe(false);
  });

  it("focuses the chronologically next event with ArrowDown", () => {
    const earlier = focusCalendarTarget(TIMED_EVENT_ID, "timed");
    const later = focusCalendarTarget(LATER_TIMED_EVENT_ID, "timed");
    earlier.focus();
    renderEditShortcuts({ timedEvents: [timedEvent, laterTimedEvent] });

    pressKey("ArrowDown");

    expect(document.activeElement).toBe(later);
  });

  it("focuses a read-only event with ArrowDown", () => {
    const earlier = focusCalendarTarget(TIMED_EVENT_ID, "timed");
    const readOnly = addReadOnlyCalendarTarget(LATER_TIMED_EVENT_ID);
    earlier.focus();
    renderEditShortcuts({ timedEvents: [timedEvent, laterTimedEvent] });

    pressKey("ArrowDown");

    expect(document.activeElement).toBe(readOnly);
  });

  it("navigates back off a focused read-only event with ArrowUp", () => {
    const earlier = focusCalendarTarget(TIMED_EVENT_ID, "timed");
    const readOnly = addReadOnlyCalendarTarget(LATER_TIMED_EVENT_ID);
    readOnly.focus();
    renderEditShortcuts({ timedEvents: [timedEvent, laterTimedEvent] });

    pressKey("ArrowUp");

    expect(document.activeElement).toBe(earlier);
  });

  it("focuses the chronologically next event with ArrowRight", () => {
    const earlier = focusCalendarTarget(TIMED_EVENT_ID, "timed");
    const later = focusCalendarTarget(LATER_TIMED_EVENT_ID, "timed");
    earlier.focus();
    const navigateToDate = mock(() => {});
    renderEditShortcuts({
      navigateToDate,
      timedEvents: [timedEvent, laterTimedEvent],
    });

    pressKey("ArrowRight");

    expect(document.activeElement).toBe(later);
    expect(navigateToDate).not.toHaveBeenCalled();
  });

  it("focuses the chronologically previous event with ArrowLeft", () => {
    const earlier = focusCalendarTarget(TIMED_EVENT_ID, "timed");
    const later = focusCalendarTarget(LATER_TIMED_EVENT_ID, "timed");
    later.focus();
    const navigateToDate = mock(() => {});
    renderEditShortcuts({
      navigateToDate,
      timedEvents: [timedEvent, laterTimedEvent],
    });

    pressKey("ArrowLeft");

    expect(document.activeElement).toBe(earlier);
    expect(navigateToDate).not.toHaveBeenCalled();
  });

  it("focuses the nearest-to-now event with ArrowRight when nothing is focused", () => {
    setSystemTime(new Date("2026-05-20T09:30:00.000"));
    const earlier = focusCalendarTarget(TIMED_EVENT_ID, "timed");
    const later = focusCalendarTarget(LATER_TIMED_EVENT_ID, "timed");
    earlier.blur();
    later.blur();
    const navigateToDate = mock(() => {});
    renderEditShortcuts({
      navigateToDate,
      timedEvents: [timedEvent, laterTimedEvent],
    });

    pressKey("ArrowRight");

    expect(document.activeElement).toBe(earlier);
    expect(navigateToDate).not.toHaveBeenCalled();

    pressKey("ArrowRight");

    expect(document.activeElement).toBe(later);
    expect(navigateToDate).not.toHaveBeenCalled();
  });

  it("focuses the nearest-to-now event when the timed grid canvas is focused", () => {
    setSystemTime(new Date("2026-05-20T09:30:00.000"));
    const earlier = focusCalendarTarget(TIMED_EVENT_ID, "timed");
    earlier.blur();
    const grid = document.createElement("section");
    grid.id = "mainGrid";
    grid.tabIndex = 0;
    document.body.appendChild(grid);
    grid.focus();
    renderEditShortcuts({
      timedEvents: [timedEvent, laterTimedEvent],
    });

    pressKey("ArrowRight");

    expect(document.activeElement).toBe(earlier);
  });

  it("does not steal ArrowRight from a focused non-event button", () => {
    focusCalendarTarget(TIMED_EVENT_ID, "timed").blur();
    const chrome = document.createElement("button");
    chrome.textContent = "Sidebar";
    document.body.appendChild(chrome);
    chrome.focus();
    renderEditShortcuts({ timedEvents: [timedEvent, laterTimedEvent] });

    pressKey("ArrowRight", {}, chrome);

    expect(document.activeElement).toBe(chrome);
  });

  it("moves the active shortcut-created draft with arrow keys", () => {
    const navigateToDate = mock(() => {});
    const draft = createGridEventDraft(
      timedGridSchedule(
        new Date("2026-05-20T09:00:00.000"),
        new Date("2026-05-20T10:00:00.000"),
      ),
    );
    draftActions.startGridDraft({ activity: "createShortcut", draft });
    renderEditShortcuts({ navigateToDate });

    act(() => {
      pressKey("ArrowRight");
    });

    const nextDraft = useDraftStore.getState().gridDraft;
    expect(dayjs(nextDraft?.values.schedule.start).format()).toBe(
      dayjs("2026-05-21T09:00:00.000").format(),
    );
    expect(navigateToDate).toHaveBeenCalled();
  });

  it("opens the focused event form and focuses the title on e then t", async () => {
    focusCalendarTarget(TIMED_EVENT_ID, "timed");
    renderEditShortcuts();

    const form = document.createElement("form");
    form.setAttribute("name", ID_EVENT_FORM);
    const title = document.createElement("input");
    title.name = "Event Title";
    form.appendChild(title);
    document.body.appendChild(form);

    act(() => {
      pressKey("e");
      pressKey("t");
    });

    await waitFor(() => {
      expect(useDraftStore.getState().status?.isFormOpen).toBe(true);
    });
    expect(useDraftStore.getState().status?.activity).toBe("keyboardEdit");
    expect(useDraftStore.getState().gridDraft?.kind).toBe("edit");

    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      });
    });

    expect(document.activeElement).toBe(title);
  });

  it("does nothing on e then t when no event is focused", () => {
    renderEditShortcuts();

    act(() => {
      pressKey("e");
      pressKey("t");
    });

    expect(useDraftStore.getState().status?.isFormOpen).toBeFalsy();
    expect(useDraftStore.getState().gridDraft).toBeNull();
  });

  it("cycles edge focus with Tab: whole event -> start -> end -> whole event", () => {
    focusCalendarTarget(TIMED_EVENT_ID, "timed");
    renderEditShortcuts();

    pressKey("Tab");
    expect(useEdgeFocusStore.getState()).toMatchObject({
      eventId: TIMED_EVENT_ID,
      edge: "startDate",
    });

    pressKey("Tab");
    expect(useEdgeFocusStore.getState().edge).toBe("endDate");

    pressKey("Tab");
    expect(useEdgeFocusStore.getState().edge).toBeNull();
  });

  it("lets Tab leave the card natively past the end edge instead of trapping focus", () => {
    focusCalendarTarget(TIMED_EVENT_ID, "timed");
    renderEditShortcuts();

    pressKey("Tab");
    pressKey("Tab");
    expect(useEdgeFocusStore.getState().edge).toBe("endDate");

    const thirdTab = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Tab",
    });
    document.dispatchEvent(thirdTab);

    expect(thirdTab.defaultPrevented).toBe(false);
    expect(useEdgeFocusStore.getState().edge).toBeNull();
  });

  it("cycles edge focus backward with Shift+Tab", () => {
    focusCalendarTarget(TIMED_EVENT_ID, "timed");
    renderEditShortcuts();

    pressKey("Tab", shiftKey);
    expect(useEdgeFocusStore.getState().edge).toBe("endDate");

    pressKey("Tab", shiftKey);
    expect(useEdgeFocusStore.getState().edge).toBe("startDate");
  });

  it("does not cycle edge focus with Tab when no event is focused", () => {
    renderEditShortcuts();

    pressKey("Tab");

    expect(useEdgeFocusStore.getState().eventId).toBeNull();
  });

  it("moves only the start edge with Shift+ArrowUp when the start edge is focused", async () => {
    focusCalendarTarget(TIMED_EVENT_ID, "timed");
    const { queryClient } = renderEditShortcuts();
    pressKey("Tab");

    pressKey("ArrowUp", shiftKey);

    await waitFor(() => {
      expect(getEditMutation(queryClient)).toBeDefined();
    });
    const { input } = getEditMutation(queryClient)?.state.variables as {
      input: { schedule: { start: string; end: string } };
    };
    expect(input.schedule.start).toBe(
      offsetString(dayjs(timedEvent.startDate).subtract(15, "minutes")),
    );
    expect(input.schedule.end).toBe(offsetString(dayjs(timedEvent.endDate)));
    expect(useEdgeFocusStore.getState().edge).toBe("startDate");
  });

  it("moves only the end edge with Shift+ArrowDown when the end edge is focused", async () => {
    focusCalendarTarget(TIMED_EVENT_ID, "timed");
    const { queryClient } = renderEditShortcuts();
    pressKey("Tab");
    pressKey("Tab");

    pressKey("ArrowDown", shiftKey);

    await waitFor(() => {
      expect(getEditMutation(queryClient)).toBeDefined();
    });
    const { input } = getEditMutation(queryClient)?.state.variables as {
      input: { schedule: { start: string; end: string } };
    };
    expect(input.schedule.start).toBe(
      offsetString(dayjs(timedEvent.startDate)),
    );
    expect(input.schedule.end).toBe(
      offsetString(dayjs(timedEvent.endDate).add(15, "minutes")),
    );
    expect(useEdgeFocusStore.getState().edge).toBe("endDate");
  });

  it("moves only the start edge an hour with Alt+Shift+ArrowUp when that edge is focused", async () => {
    focusCalendarTarget(TIMED_EVENT_ID, "timed");
    const { queryClient } = renderEditShortcuts();
    pressKey("Tab");

    pressKey("ArrowUp", altShiftKey);

    await waitFor(() => {
      expect(getEditMutation(queryClient)).toBeDefined();
    });
    const { input } = getEditMutation(queryClient)?.state.variables as {
      input: { schedule: { start: string; end: string } };
    };
    expect(input.schedule.start).toBe(
      offsetString(dayjs(timedEvent.startDate).subtract(60, "minutes")),
    );
    expect(input.schedule.end).toBe(offsetString(dayjs(timedEvent.endDate)));
    expect(useEdgeFocusStore.getState().edge).toBe("startDate");
  });

  it("refuses Alt+Shift+ArrowLeft on a timed edge", async () => {
    focusCalendarTarget(TIMED_EVENT_ID, "timed");
    const { queryClient } = renderEditShortcuts();
    pressKey("Tab");

    pressKey("ArrowLeft", altShiftKey);

    expect(getEditMutation(queryClient)).toBeUndefined();
  });

  it("flips the focused edge from start to end past the minimum duration", async () => {
    const shortEvent: GridEvent = {
      ...timedEvent,
      endDate: "2026-05-20T09:15:00.000",
    };
    focusCalendarTarget(TIMED_EVENT_ID, "timed");
    renderEditShortcuts({ timedEvents: [shortEvent] });
    pressKey("Tab");

    pressKey("ArrowDown", shiftKey);

    await waitFor(() => {
      expect(useEdgeFocusStore.getState().edge).toBe("endDate");
    });
    expect(useEdgeFocusStore.getState().eventId).toBe(TIMED_EVENT_ID);
  });

  it("resets edge focus with Escape", () => {
    focusCalendarTarget(TIMED_EVENT_ID, "timed");
    renderEditShortcuts();
    pressKey("Tab");
    expect(useEdgeFocusStore.getState().edge).toBe("startDate");

    pressKey("Escape");

    expect(useEdgeFocusStore.getState().edge).toBeNull();
  });

  it("resets edge focus when a different event is focused", () => {
    const laterEvent: GridEvent = {
      ...timedEvent,
      _id: "cccccccccccccccccccccccc",
      startDate: "2026-05-20T11:00:00.000",
      endDate: "2026-05-20T12:00:00.000",
      title: "Later event",
    };
    const earlier = focusCalendarTarget(TIMED_EVENT_ID, "timed");
    const later = focusCalendarTarget(laterEvent._id!, "timed");
    earlier.focus();
    renderEditShortcuts({ timedEvents: [timedEvent, laterEvent] });
    pressKey("Tab");
    expect(useEdgeFocusStore.getState().eventId).toBe(TIMED_EVENT_ID);

    act(() => {
      later.focus();
    });

    expect(useEdgeFocusStore.getState().eventId).toBeNull();
  });
});
