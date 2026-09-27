import { HotkeyManager } from "@tanstack/react-hotkeys";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import {
  type Calendar,
  getCalendarCapabilities,
} from "@core/types/calendar.contracts";
import { CalendarIdSchema } from "@core/types/domain-primitives";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { type GridEventDraft } from "@web/events/event-draft.types";
import {
  createGridEventDraft,
  editGridEventDraft,
  timedGridSchedule,
} from "@web/events/grid-event-draft.adapter";
import { EventForm } from "@web/views/Forms/EventForm/EventForm";
import { beforeEach, describe, expect, it, mock } from "bun:test";

// This file covers EventForm's integration with CalendarSelect specifically
// (packet 08 step 7) - EventForm.test.tsx already covers the form's other
// behaviors and carries pre-existing lint warnings, so this is a sibling
// file rather than an extension of it.

const makeCalendar = (overrides: Partial<Calendar> = {}): Calendar => ({
  id: CalendarIdSchema.parse(createObjectIdString()),
  name: "Work",
  description: "",
  timeZone: null,
  foregroundColor: "#000000",
  backgroundColor: "#3b82f6",
  provider: "google",
  access: "owner",
  capabilities: getCalendarCapabilities("owner"),
  isPrimary: false,
  isVisible: true,
  isActive: true,
  ...overrides,
});

const createNewDraft = (): GridEventDraft =>
  createGridEventDraft(
    timedGridSchedule(
      new Date("2026-07-13T09:00:00.000Z"),
      new Date("2026-07-13T10:00:00.000Z"),
    ),
  );

const renderEventForm = (
  draft: GridEventDraft,
  calendars: Calendar[],
  overrides: { onSubmit?: (draft: GridEventDraft | null) => void } = {},
) => {
  const { queryClient, wrapper } = createStoreWrapper();
  queryClient.setQueryData(calendarQueryKeys.all, calendars);

  const onSubmit = overrides.onSubmit ?? mock();

  const utils = render(
    <EventForm
      draft={draft}
      isDraft={draft.kind === "create"}
      isExistingEvent={draft.kind === "edit"}
      onClose={mock()}
      onDelete={mock()}
      onDuplicate={mock()}
      onSubmit={onSubmit}
      setDraft={mock()}
    />,
    { wrapper },
  );

  return { onSubmit, ...utils };
};

describe("EventForm calendar selection", () => {
  beforeEach(() => {
    HotkeyManager.resetInstance();
    document.body.removeAttribute("data-app-locked");
  });

  it("renders the calendar combobox for a new-event draft and reflects the picked calendar in the submitted draft", async () => {
    const user = userEvent.setup();
    const primary = makeCalendar({ name: "Personal", isPrimary: true });
    const team = makeCalendar({ name: "Team" });
    const onSubmit = mock();

    renderEventForm(createNewDraft(), [primary, team], { onSubmit });

    const trigger = screen.getByRole("combobox", { name: /Calendar:/ });
    expect(trigger.getAttribute("aria-label")).toMatch(/Personal \(primary\)/);

    await user.click(trigger);
    await user.click(await screen.findByRole("option", { name: "Team" }));

    const titleField = screen.getByPlaceholderText("Title");
    act(() => titleField.focus());
    await user.type(titleField, "Plan launch");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({ calendarId: team.id }),
      }),
    );
  });

  it("shows read-only calendar text (no combobox) when editing an existing event", () => {
    const work = makeCalendar({ name: "Work" });
    const event = createMockEvent({ calendarId: work.id });
    const draft = editGridEventDraft(event);
    if (!draft) throw new Error("expected an edit draft");

    renderEventForm(draft, [work]);

    expect(screen.getByText("Calendar: Work")).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: /calendar/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("shows a no-writable-calendar message instead of a combobox when creating with only read-only calendars", () => {
    const readOnly = makeCalendar({
      name: "Holidays",
      access: "reader",
      capabilities: getCalendarCapabilities("reader"),
    });

    renderEventForm(createNewDraft(), [readOnly]);

    expect(
      screen.getByText("No writable calendar available"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: /calendar/i }),
    ).not.toBeInTheDocument();
  });
});
