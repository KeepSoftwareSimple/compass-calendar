import { HotkeyManager } from "@tanstack/react-hotkeys";
import { act } from "react";
import { EventIdSchema } from "@core/types/domain-primitives";
import { EventScheduleSchema } from "@core/types/event.contracts";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@web/__tests__/__mocks__/mock.render";
import { toNormalizedEventQueryData } from "@web/__tests__/utils/event-query-test-data";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { createCompassQueryClient } from "@web/api/query-client";
import { SidebarEventDetails } from "@web/components/Sidebar/EventDetails/SidebarEventDetails";
import {
  createGridEventDraft,
  editGridEventDraft,
} from "@web/events/grid-event-draft.adapter";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import { draftActions, useDraftStore } from "@web/events/stores/draft.store";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import "@testing-library/jest-dom";

const EXISTING_EVENT_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";
const RECURRING_EVENT_ID = "bbbbbbbbbbbbbbbbbbbbbbbb";

beforeEach(() => {
  HotkeyManager.resetInstance();
  draftActions.discard();
});

afterEach(() => {
  cleanup();
});

describe("SidebarEventDetails", () => {
  it("renders nothing while the draft store says the form is closed", () => {
    const draft = createGridEventDraft({
      kind: "allDay",
      start: new Date("2026-05-20"),
      end: new Date("2026-05-21"),
    });
    draftActions.startGridDraft({ activity: "keyboardPlace", draft });

    render(<SidebarEventDetails />);

    expect(screen.queryByRole("form")).toBeNull();
  });

  it("focuses the title when the form opens, with the actions one Shift+Tab away", async () => {
    const draft = createGridEventDraft({
      kind: "allDay",
      start: new Date("2026-05-20"),
      end: new Date("2026-05-21"),
    });
    draftActions.startGridDraft({ activity: "gridClick", draft });

    render(<SidebarEventDetails />);

    const title = await screen.findByPlaceholderText("Title");
    await waitFor(() => expect(title).toHaveFocus());

    // The action row renders above the title, so it sits behind Shift+Tab
    // instead of taking the first forward Tab out of the title. Each action
    // is its own tab stop so Delete and Close are reachable without arrows.
    const actionRow = screen.getByRole("group", { name: "Event actions" });
    expect(
      actionRow.compareDocumentPosition(title) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const actionButtons = within(actionRow).getAllByRole("button");
    expect(actionButtons.length).toBeGreaterThan(1);
    expect(
      actionButtons.every((button) => button.getAttribute("tabindex") !== "-1"),
    ).toBe(true);
  });

  it("prompts before discarding a dirty existing event from the Close action", async () => {
    const existingEvent = createMockEvent({
      id: EventIdSchema.parse(EXISTING_EVENT_ID),
      content: {
        kind: "details",
        title: "Existing Event",
        description: "",
      },
      schedule: EventScheduleSchema.parse({
        kind: "timed",
        start: "2026-05-20T14:00:00.000Z",
        end: "2026-05-20T15:00:00.000Z",
        timeZone: "UTC",
      }),
    });
    const draft = editGridEventDraft(existingEvent);
    if (!draft) throw new Error("expected an edit draft");
    draft.values.title = "Changed title";
    draftActions.startGridDraft({ activity: "keyboardEdit", draft });

    render(<SidebarEventDetails />);

    await screen.findByDisplayValue("Changed title");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    // Same confirm path as Escape: the button routes through requestClose
    // rather than re-deriving the dirty check.
    expect(
      await screen.findByRole("dialog", { name: "Discard unsaved changes?" }),
    ).toBeInTheDocument();
    expect(useDraftStore.getState().status?.isFormOpen).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() =>
      expect(useDraftStore.getState().status?.isFormOpen).toBe(false),
    );
  });

  it("closes the form on Escape", async () => {
    const draft = createGridEventDraft({
      kind: "allDay",
      start: new Date("2026-05-20"),
      end: new Date("2026-05-21"),
    });
    draftActions.startGridDraft({ activity: "gridClick", draft });

    render(<SidebarEventDetails />);

    const titleField = await screen.findByPlaceholderText("Title");
    fireEvent.keyDown(titleField, { key: "Escape" });

    await waitFor(() =>
      expect(useDraftStore.getState().status?.isFormOpen).toBe(false),
    );
  });

  it("closes an unchanged existing event on Escape without prompting", async () => {
    const existingEvent = createMockEvent({
      id: EventIdSchema.parse(EXISTING_EVENT_ID),
      content: {
        kind: "details",
        title: "Existing Event",
        description: "",
      },
      schedule: EventScheduleSchema.parse({
        kind: "timed",
        start: "2026-05-20T14:00:00.000Z",
        end: "2026-05-20T15:00:00.000Z",
        timeZone: "UTC",
      }),
    });
    const draft = editGridEventDraft(existingEvent);
    if (!draft) throw new Error("expected an edit draft");
    draftActions.startGridDraft({ activity: "keyboardEdit", draft });

    render(<SidebarEventDetails />);

    const titleField = await screen.findByPlaceholderText("Title");
    fireEvent.keyDown(titleField, { key: "Escape" });

    await waitFor(() =>
      expect(useDraftStore.getState().status?.isFormOpen).toBe(false),
    );
    expect(
      screen.queryByRole("dialog", { name: "Discard unsaved changes?" }),
    ).toBeNull();
  });

  it("prompts before discarding a dirty existing event on Escape", async () => {
    const existingEvent = createMockEvent({
      id: EventIdSchema.parse(EXISTING_EVENT_ID),
      content: {
        kind: "details",
        title: "Existing Event",
        description: "",
      },
      schedule: EventScheduleSchema.parse({
        kind: "timed",
        start: "2026-05-20T14:00:00.000Z",
        end: "2026-05-20T15:00:00.000Z",
        timeZone: "UTC",
      }),
    });
    const draft = editGridEventDraft(existingEvent);
    if (!draft) throw new Error("expected an edit draft");
    draft.values.title = "Changed title";
    draftActions.startGridDraft({ activity: "keyboardEdit", draft });

    render(<SidebarEventDetails />);

    const titleField = await screen.findByDisplayValue("Changed title");
    fireEvent.keyDown(titleField, { key: "Escape" });

    expect(
      await screen.findByRole("dialog", { name: "Discard unsaved changes?" }),
    ).toBeInTheDocument();
    expect(useDraftStore.getState().status?.isFormOpen).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Discard unsaved changes?" }),
      ).toBeNull(),
    );
    expect(useDraftStore.getState().status?.isFormOpen).toBe(true);

    fireEvent.keyDown(titleField, { key: "Escape" });
    expect(
      await screen.findByRole("dialog", { name: "Discard unsaved changes?" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() =>
      expect(useDraftStore.getState().status?.isFormOpen).toBe(false),
    );
  });

  it("discards a dirty existing event on Shift+Escape without prompting", async () => {
    const existingEvent = createMockEvent({
      id: EventIdSchema.parse(EXISTING_EVENT_ID),
      content: {
        kind: "details",
        title: "Existing Event",
        description: "",
      },
      schedule: EventScheduleSchema.parse({
        kind: "timed",
        start: "2026-05-20T14:00:00.000Z",
        end: "2026-05-20T15:00:00.000Z",
        timeZone: "UTC",
      }),
    });
    const draft = editGridEventDraft(existingEvent);
    if (!draft) throw new Error("expected an edit draft");
    draft.values.title = "Changed title";
    draftActions.startGridDraft({ activity: "keyboardEdit", draft });

    render(<SidebarEventDetails />);

    const titleField = await screen.findByDisplayValue("Changed title");
    fireEvent.keyDown(titleField, { key: "Escape", shiftKey: true });

    await waitFor(() =>
      expect(useDraftStore.getState().status?.isFormOpen).toBe(false),
    );
    expect(
      screen.queryByRole("dialog", { name: "Discard unsaved changes?" }),
    ).toBeNull();
  });

  it("discards from the confirm dialog on Shift+Escape", async () => {
    const existingEvent = createMockEvent({
      id: EventIdSchema.parse(EXISTING_EVENT_ID),
      content: {
        kind: "details",
        title: "Existing Event",
        description: "",
      },
      schedule: EventScheduleSchema.parse({
        kind: "timed",
        start: "2026-05-20T14:00:00.000Z",
        end: "2026-05-20T15:00:00.000Z",
        timeZone: "UTC",
      }),
    });
    const draft = editGridEventDraft(existingEvent);
    if (!draft) throw new Error("expected an edit draft");
    draft.values.title = "Changed title";
    draftActions.startGridDraft({ activity: "keyboardEdit", draft });

    render(<SidebarEventDetails />);

    const titleField = await screen.findByDisplayValue("Changed title");
    fireEvent.keyDown(titleField, { key: "Escape" });

    const dialog = await screen.findByRole("dialog", {
      name: "Discard unsaved changes?",
    });
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Escape", shiftKey: true });

    await waitFor(() =>
      expect(useDraftStore.getState().status?.isFormOpen).toBe(false),
    );
    expect(
      screen.queryByRole("dialog", { name: "Discard unsaved changes?" }),
    ).toBeNull();
  });

  it("deletes an already-saved event on Delete instead of just closing the form", async () => {
    const existingEvent = createMockEvent({
      id: EventIdSchema.parse(EXISTING_EVENT_ID),
      content: {
        kind: "details",
        title: "Existing Event",
        description: "",
      },
      schedule: EventScheduleSchema.parse({
        kind: "timed",
        start: "2026-05-20T14:00:00.000Z",
        end: "2026-05-20T15:00:00.000Z",
        timeZone: "UTC",
      }),
    });

    const queryClient = createCompassQueryClient();
    queryClient.setQueryData(
      eventQueryKeys.day({
        source: "local",
        start: "2026-05-20T00:00:00.000Z",
        end: "2026-05-21T00:00:00.000Z",
      }),
      toNormalizedEventQueryData([existingEvent]),
    );

    const draft = editGridEventDraft(existingEvent);
    if (!draft) throw new Error("expected an edit draft");
    draftActions.startGridDraft({ activity: "keyboardEdit", draft });

    render(<SidebarEventDetails />, { queryClient });

    const titleField = await screen.findByPlaceholderText("Title");
    await waitFor(() => expect(titleField).toHaveFocus());

    // A real keyboard user moves focus off the title text field before
    // Delete deletes the event, rather than editing the title text.
    act(() => titleField.blur());

    fireEvent.keyDown(screen.getByRole("form"), {
      bubbles: true,
      cancelable: true,
      key: "Delete",
    });

    // A delete mutation only fires on the real-delete branch
    // (`handleEventFormDelete` calling `onDelete`), never on the draft-close
    // branch (`onClose` only) — so this pins SidebarEventDetails computing
    // isDraft from whether the event already exists, not hardcoding it to
    // true for every opened event.
    await waitFor(() =>
      expect(
        queryClient
          .getMutationCache()
          .getAll()
          .some(
            (mutation) =>
              mutation.options.mutationKey?.[2] === "delete" &&
              (mutation.state.variables as { id?: string }).id ===
                EXISTING_EVENT_ID,
          ),
      ).toBe(true),
    );
  });

  it("deletes a recurring day event immediately", async () => {
    const recurringEvent = createMockEvent({
      id: EventIdSchema.parse(RECURRING_EVENT_ID),
      content: {
        kind: "details",
        title: "Recurring Event",
        description: "",
      },
      recurrence: { kind: "series", rules: ["RRULE:FREQ=WEEKLY"] },
      schedule: EventScheduleSchema.parse({
        kind: "timed",
        start: "2026-05-20T14:00:00.000Z",
        end: "2026-05-20T15:00:00.000Z",
        timeZone: "UTC",
      }),
    });
    const queryClient = createCompassQueryClient();
    queryClient.setQueryData(
      eventQueryKeys.day({
        source: "local",
        start: "2026-05-20T00:00:00.000Z",
        end: "2026-05-21T00:00:00.000Z",
      }),
      toNormalizedEventQueryData([recurringEvent]),
    );

    const draft = editGridEventDraft(recurringEvent);
    if (!draft) throw new Error("expected an edit draft");
    draftActions.startGridDraft({ activity: "keyboardEdit", draft });

    render(<SidebarEventDetails />, { queryClient });

    const titleField = await screen.findByPlaceholderText("Title");
    act(() => titleField.blur());
    fireEvent.keyDown(screen.getByRole("form"), { key: "Delete" });

    await waitFor(() =>
      expect(
        queryClient
          .getMutationCache()
          .getAll()
          .some(
            (mutation) =>
              mutation.options.mutationKey?.[2] === "delete" &&
              (mutation.state.variables as { id?: string }).id ===
                RECURRING_EVENT_ID,
          ),
      ).toBe(true),
    );
    expect(
      screen.queryByRole("radiogroup", { name: "Delete events" }),
    ).toBeNull();
  });
});
