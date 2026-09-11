import { QueryClient } from "@tanstack/react-query";
import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactElement } from "react";
import {
  type Calendar,
  getCalendarCapabilities,
} from "@core/types/calendar.contracts";
import { CalendarIdSchema, EventIdSchema } from "@core/types/domain-primitives";
import { EventScheduleSchema } from "@core/types/event.contracts";
import { createMockStandaloneEvent } from "@core/util/test/ccal.event.factory";
import { render, screen, waitFor } from "@web/__tests__/__mocks__/mock.render";
import {
  seedPendingEventMutations,
  toNormalizedEventQueryData,
} from "@web/__tests__/utils/event-query-test-data";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { seedHiddenEventIds } from "@web/__tests__/utils/hidden-events-test-data";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import { ID_CONTEXT_MENU_ITEMS } from "@web/common/constants/web.constants";
import { type GridEvent } from "@web/common/types/web.event.types";
import { gridEventDefaultPosition } from "@web/common/utils/event/event.util";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { editGridEventDraft } from "@web/events/grid-event-draft.adapter";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import {
  selectIsEventFormOpen,
  useDraftStore,
} from "@web/events/stores/draft.store";
import { beforeEach, describe, expect, it, mock } from "bun:test";

const mockClose = mock();

const EVENT_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";

const createMockGridEvent = (overrides: Partial<GridEvent> = {}): GridEvent => {
  const standaloneEvent = createMockStandaloneEvent();
  return {
    ...standaloneEvent,
    _id: EVENT_ID,
    position: gridEventDefaultPosition,
    ...overrides,
  } as GridEvent;
};

const createSourceEvent = (event: GridEvent) =>
  createMockEvent({
    id: EventIdSchema.parse(event._id ?? EVENT_ID),
    content: {
      kind: "details",
      title: event.title ?? "",
      description: event.description ?? "",
    },
    schedule: EventScheduleSchema.parse({
      kind: "timed",
      start: "2026-05-20T09:00:00.000Z",
      end: "2026-05-20T10:00:00.000Z",
      timeZone: "UTC",
    }),
  });

// GridContextMenuWrapper.tsx (the real right-click flow) already pushes a
// GridEventDraft into the store's `gridDraft` field before ContextMenuItems
// mounts; seed the same field so edit can open the store-owned form.
const seedGridDraftForEvent = (event: GridEvent) => {
  const draft = editGridEventDraft(createSourceEvent(event));
  useDraftStore.setState({ gridDraft: draft });
};

const { ContextMenuItems } =
  require("./ContextMenuItems") as typeof import("./ContextMenuItems");

const renderWithTheme = (
  ui: ReactElement,
  {
    pendingEventIds = [],
    calendars,
    event,
    hiddenEventIds,
  }: {
    pendingEventIds?: string[];
    calendars?: Calendar[];
    event?: GridEvent;
    hiddenEventIds?: readonly string[];
  } = {},
) => {
  const queryClient = new QueryClient();
  seedPendingEventMutations(queryClient, pendingEventIds);
  queryClient.setQueryData(calendarQueryKeys.all, calendars ?? []);
  if (hiddenEventIds) {
    seedHiddenEventIds(queryClient, hiddenEventIds);
  }
  if (event?._id) {
    queryClient.setQueryData(
      eventQueryKeys.week({
        source: "local",
        start: "2026-05-18T00:00:00.000Z",
        end: "2026-05-24T23:59:59.999Z",
      }),
      toNormalizedEventQueryData([createSourceEvent(event)]),
    );
  }

  return {
    ...render(ui, { queryClient }),
    queryClient,
  };
};

describe("ContextMenuItems", () => {
  beforeEach(() => {
    mockClose.mockClear();
    useDraftStore.setState({ gridDraft: null, status: null });
  });

  it("should render menu items", () => {
    const event = createMockGridEvent({
      title: "Test Event",
    });

    renderWithTheme(<ContextMenuItems event={event} close={mockClose} />, {
      event,
    });

    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("Duplicate")).toBeInTheDocument();
    expect(screen.getByText("Hide event")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
    expect(
      screen.getByRole("menuitemradio", { name: "Blue" }),
    ).toBeInTheDocument();
  });

  it("applies a color from the swatch strip and closes", async () => {
    const user = userEvent.setup();
    const event = createMockGridEvent({
      title: "Test Event",
    });
    const setColor = mock();

    const { ContextMenuItemsView } =
      require("./ContextMenuItems") as typeof import("./ContextMenuItems");

    renderWithTheme(
      <ContextMenuItemsView
        event={event}
        close={mockClose}
        actions={{
          delete: mock(),
          duplicate: mock(),
          edit: mock(),
          setColor,
          toggleHidden: mock(),
        }}
      />,
      { event },
    );

    await user.click(screen.getByRole("menuitemradio", { name: "Coral" }));
    expect(setColor).toHaveBeenCalledWith("coral");
    expect(mockClose).toHaveBeenCalled();
  });

  it("picks a color by digit from the swatch strip and closes", () => {
    const event = createMockGridEvent({ title: "Test Event" });
    const setColor = mock();

    const { ContextMenuItemsView } =
      require("./ContextMenuItems") as typeof import("./ContextMenuItems");

    renderWithTheme(
      <ContextMenuItemsView
        event={event}
        close={mockClose}
        actions={{
          delete: mock(),
          duplicate: mock(),
          edit: mock(),
          setColor,
          toggleHidden: mock(),
        }}
      />,
      { event },
    );

    // The pick is index-based off the fieldset, not target-relative - firing
    // on "Coral" still picks index 0 ("Calendar default").
    const anyFocusedSwatch = screen.getByRole("menuitemradio", {
      name: "Coral",
    });
    fireEvent.keyDown(anyFocusedSwatch, { code: "Digit1", key: "1" });

    expect(setColor).toHaveBeenCalledWith(null);
    expect(mockClose).toHaveBeenCalled();
  });

  it("should call onClick handlers", async () => {
    const user = userEvent.setup();
    const event = createMockGridEvent({
      title: "Test Event",
    });
    seedGridDraftForEvent(event);

    renderWithTheme(<ContextMenuItems event={event} close={mockClose} />, {
      event,
    });

    const editButton = screen.getByRole("menuitem", { name: "Edit" });
    await user.click(editButton);

    expect(selectIsEventFormOpen(useDraftStore.getState())).toBe(true);
    expect(mockClose).toHaveBeenCalled();
  });

  it("allows delete while the event's own mutation is pending", async () => {
    const user = userEvent.setup();
    const event = createMockGridEvent({
      title: "Pending Event",
    });

    const { queryClient } = renderWithTheme(
      <ContextMenuItems event={event} close={mockClose} />,
      {
        pendingEventIds: [EVENT_ID],
        event,
      },
    );

    const deleteButton = screen.getByRole("menuitem", { name: "Delete" });
    expect(deleteButton).not.toBeDisabled();
    await user.click(deleteButton);

    await waitFor(() =>
      expect(
        queryClient
          .getMutationCache()
          .getAll()
          .some((mutation) => mutation.options.mutationKey?.[2] === "delete"),
      ).toBe(true),
    );
    expect(mockClose).toHaveBeenCalled();
  });

  it("allows edit while the event's own mutation is pending", async () => {
    const user = userEvent.setup();
    const event = createMockGridEvent({
      title: "Pending Event",
    });
    seedGridDraftForEvent(event);

    renderWithTheme(<ContextMenuItems event={event} close={mockClose} />, {
      pendingEventIds: [EVENT_ID],
      event,
    });

    const editButton = screen.getByRole("menuitem", { name: "Edit" });
    await user.click(editButton);

    expect(selectIsEventFormOpen(useDraftStore.getState())).toBe(true);
    expect(mockClose).toHaveBeenCalled();
  });

  it("allows duplicate while the event's own mutation is pending", async () => {
    const user = userEvent.setup();
    const event = createMockGridEvent({
      title: "Pending Event",
    });

    renderWithTheme(<ContextMenuItems event={event} close={mockClose} />, {
      pendingEventIds: [EVENT_ID],
      event,
    });

    const duplicateButton = screen.getByRole("menuitem", { name: "Duplicate" });
    await user.click(duplicateButton);

    await waitFor(() => {
      expect(useDraftStore.getState().gridDraft?.kind).toBe("create");
      expect(selectIsEventFormOpen(useDraftStore.getState())).toBe(true);
    });
    expect(mockClose).toHaveBeenCalled();
  });

  it("does not apply a wait cursor to actions while pending", () => {
    const event = createMockGridEvent({
      title: "Pending Event",
    });

    renderWithTheme(<ContextMenuItems event={event} close={mockClose} />, {
      pendingEventIds: [EVENT_ID],
      event,
    });

    const deleteButton = screen.getByRole("menuitem", { name: "Delete" });
    expect(deleteButton).not.toBeDisabled();
    expect(deleteButton).not.toHaveStyle({ cursor: "wait" });
  });
});

// packet 08 step 8: read-only (unwritable calendar or busy content) events
// can be inspected but never mutated - the menu drops straight to that
// smaller surface (View, Duplicate) instead of disabling the hidden items.
describe("ContextMenuItems read-only gate", () => {
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

  beforeEach(() => {
    mockClose.mockClear();
    useDraftStore.setState({ gridDraft: null, status: null });
  });

  it("shows View (not Edit), hides Delete, but keeps Duplicate for a read-only-calendar event", () => {
    const readOnlyCalendar = makeCalendar();
    const event = createMockGridEvent({
      title: "Shared event",
      calendarId: readOnlyCalendar.id,
    });

    renderWithTheme(<ContextMenuItems event={event} close={mockClose} />, {
      calendars: [readOnlyCalendar],
      event,
    });

    expect(screen.getByRole("menuitem", { name: "View" })).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Edit" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Duplicate" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Hide event" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Delete" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitemradio", { name: "Blue" }),
    ).not.toBeInTheDocument();
  });

  it("treats a busy event as read-only even on a writable calendar", () => {
    const writableCalendar = makeCalendar({
      access: "owner",
      capabilities: getCalendarCapabilities("owner"),
    });
    const event = createMockGridEvent({
      title: "",
      calendarId: writableCalendar.id,
      isBusy: true,
    });

    renderWithTheme(<ContextMenuItems event={event} close={mockClose} />, {
      calendars: [writableCalendar],
      event,
    });

    expect(screen.getByRole("menuitem", { name: "View" })).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Hide event" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Delete" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the full menu (Edit, Delete) for a writable-calendar event", () => {
    const writableCalendar = makeCalendar({
      access: "owner",
      capabilities: getCalendarCapabilities("owner"),
    });
    const event = createMockGridEvent({
      title: "My event",
      calendarId: writableCalendar.id,
    });

    renderWithTheme(<ContextMenuItems event={event} close={mockClose} />, {
      calendars: [writableCalendar],
      event,
    });

    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Hide event" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Delete" }),
    ).toBeInTheDocument();
  });
});

describe("ContextMenuItems hide event", () => {
  const mockToggleHidden = mock();

  beforeEach(() => {
    mockClose.mockClear();
    mockToggleHidden.mockClear();
    useDraftStore.setState({ gridDraft: null, status: null });
  });

  const renderView = (event: GridEvent) => {
    const { ContextMenuItemsView } =
      require("./ContextMenuItems") as typeof import("./ContextMenuItems");

    return renderWithTheme(
      <ContextMenuItemsView
        event={event}
        close={mockClose}
        actions={{
          delete: mock(),
          duplicate: mock(),
          edit: mock(),
          setColor: mock(),
          toggleHidden: mockToggleHidden,
        }}
      />,
      { event },
    );
  };

  it("keeps menuitem accessible names free of the x keycap", () => {
    const event = createMockGridEvent({ title: "Test Event" });
    renderWithTheme(<ContextMenuItems event={event} close={mockClose} />, {
      event,
    });

    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Duplicate" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Hide event" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Delete" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem")).toHaveLength(4);
  });

  it("labels the item Show event when the id is already hidden", () => {
    const event = createMockGridEvent({ title: "Hidden Event" });
    renderWithTheme(<ContextMenuItems event={event} close={mockClose} />, {
      event,
      hiddenEventIds: [EVENT_ID],
    });

    expect(
      screen.getByRole("menuitem", { name: "Show event" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Hide event" }),
    ).not.toBeInTheDocument();
  });

  it("toggles hidden state from the item click and from x, then closes", async () => {
    const user = userEvent.setup();
    const event = createMockGridEvent({ title: "Test Event" });
    renderView(event);

    await user.click(screen.getByRole("menuitem", { name: "Hide event" }));
    expect(mockToggleHidden).toHaveBeenCalledTimes(1);
    expect(mockClose).toHaveBeenCalledTimes(1);

    mockToggleHidden.mockClear();
    mockClose.mockClear();
    renderView(event);

    fireEvent.keyDown(document.getElementById(ID_CONTEXT_MENU_ITEMS)!, {
      key: "x",
    });
    expect(mockToggleHidden).toHaveBeenCalledTimes(1);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});
