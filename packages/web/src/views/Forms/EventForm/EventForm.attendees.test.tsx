import { HotkeyManager, resolveModifier } from "@tanstack/react-hotkeys";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  type Calendar,
  getCalendarCapabilities,
} from "@core/types/calendar.contracts";
import { CalendarIdSchema, EventIdSchema } from "@core/types/domain-primitives";
import { type Event } from "@core/types/event.contracts";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { type GridEventDraft } from "@web/events/event-draft.types";
import { editGridEventDraft } from "@web/events/grid-event-draft.adapter";
import { EventForm } from "@web/views/Forms/EventForm/EventForm";
import { beforeEach, describe, expect, it, mock } from "bun:test";

// WP-04 attendee-editor gating: the guest combobox renders wherever the whole
// write path can deliver a guest edit — a writable calendar that can invite
// attendees and an event the user organizes — repeating events included, where
// the edit is series-wide and the field says so. Everyone else keeps the
// read-only guest list. Sibling to EventForm.readOnly.test.tsx (full form, no
// subcomponent mocks) for the same isolation reasons.

const ACCOUNT_EMAIL = "me@example.com";

const makeCalendar = (overrides: Partial<Calendar> = {}): Calendar => ({
  id: CalendarIdSchema.parse(createObjectIdString()),
  name: "Work calendar",
  description: "",
  timeZone: null,
  foregroundColor: "#000000",
  backgroundColor: "#3b82f6",
  provider: "google",
  access: "owner",
  capabilities: getCalendarCapabilities("owner"),
  isPrimary: true,
  isVisible: true,
  isActive: true,
  accountEmail: ACCOUNT_EMAIL,
  ...overrides,
});

const makeMeetingEvent = (
  calendarId: Calendar["id"],
  overrides: Partial<Event> = {},
): Event =>
  createMockEvent({
    calendarId,
    content: {
      kind: "details",
      title: "Weekly sync",
      description: "",
      organizer: { email: ACCOUNT_EMAIL, displayName: null },
      attendees: [
        {
          email: "guest@example.com",
          displayName: "Guest One",
          responseStatus: "accepted",
        },
      ],
    },
    ...overrides,
  });

const renderEventForm = (
  draft: GridEventDraft,
  calendars: Calendar[],
  overrides: { onSubmit?: (draft: GridEventDraft | null) => void } = {},
) => {
  const { queryClient, wrapper } = createStoreWrapper();
  queryClient.setQueryData(calendarQueryKeys.all, calendars);

  const onSubmit = overrides.onSubmit ?? mock();
  const setDraft = mock();

  const utils = render(
    <EventForm
      draft={draft}
      isDraft={draft.kind === "create"}
      isExistingEvent={draft.kind === "edit"}
      onClose={mock()}
      onDelete={mock()}
      onDuplicate={mock()}
      onSubmit={onSubmit}
      setDraft={setDraft}
    />,
    { wrapper },
  );

  return { onSubmit, setDraft, ...utils };
};

const editDraftOrThrow = (event: Event): GridEventDraft => {
  const draft = editGridEventDraft(event);
  if (!draft) throw new Error("expected an edit draft");
  return draft;
};

function dispatchModDigitKey(target: HTMLElement, code: string, key: string) {
  const modifierKey = resolveModifier("Mod");
  const isControl = modifierKey === "Control";
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    composed: true,
    code,
    ctrlKey: isControl,
    key,
    metaKey: !isControl,
  });
  target.dispatchEvent(event);
  return event;
}

describe("EventForm attendee editor gating", () => {
  beforeEach(() => {
    HotkeyManager.resetInstance();
    document.body.removeAttribute("data-app-locked");
  });

  it("renders the guest combobox (and not the read-only list) for an organized event on a writable calendar that can invite", () => {
    const calendar = makeCalendar();
    const draft = editDraftOrThrow(makeMeetingEvent(calendar.id));

    renderEventForm(draft, [calendar]);

    expect(screen.getByRole("combobox", { name: "Guests" })).toBeEnabled();
    // The editor owns the guest list; the read-only list stands down, but
    // the same tally copy sits with the chips so the host still sees RSVPs.
    expect(screen.getByText("1 guest (1 yes, 0 awaiting)")).toBeInTheDocument();
    expect(screen.getByLabelText("Guest One, yes")).toBeInTheDocument();
    // Existing guests appear as chips (displayName preferred).
    expect(screen.getByText("Guest One")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "copy attendee list" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "copy guest@example.com" }),
    ).toBeInTheDocument();
  });

  it("jumps focus to the guest combobox with Mod+8", () => {
    const calendar = makeCalendar();
    const draft = editDraftOrThrow(makeMeetingEvent(calendar.id));

    renderEventForm(draft, [calendar]);

    const titleField = screen.getByPlaceholderText("Title");
    act(() => titleField.focus());
    dispatchModDigitKey(titleField, "Digit8", "8");

    expect(screen.getByRole("combobox", { name: "Guests" })).toHaveFocus();
  });

  it("reveals a hold-Mod chip on the guests field", async () => {
    const calendar = makeCalendar();
    const draft = editDraftOrThrow(makeMeetingEvent(calendar.id));

    renderEventForm(draft, [calendar]);

    const wrapper = document.getElementById("event-form-attendees");
    expect(wrapper).not.toBeNull();
    wrapper!.getBoundingClientRect = () =>
      ({
        top: 120,
        left: 80,
        bottom: 160,
        right: 320,
        width: 240,
        height: 40,
        x: 80,
        y: 120,
        toJSON: () => ({}),
      }) as DOMRect;

    const isControl = resolveModifier("Mod") === "Control";
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          composed: true,
          key: isControl ? "Control" : "Meta",
          ctrlKey: isControl,
          metaKey: !isControl,
        }),
      );
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 750));
    });

    expect(screen.getByRole("status").textContent).toContain("8 for guests");
  });

  it("keeps the read-only guest list for an event the user does not organize", () => {
    const calendar = makeCalendar();
    const event = makeMeetingEvent(calendar.id, {
      content: {
        kind: "details",
        title: "Their meeting",
        description: "",
        organizer: { email: "someone-else@example.com", displayName: null },
        attendees: [
          {
            email: "guest@example.com",
            displayName: "Guest One",
            responseStatus: "needsAction",
          },
        ],
      },
    });

    renderEventForm(editDraftOrThrow(event), [calendar]);

    expect(
      screen.queryByRole("combobox", { name: "Guests" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/1 guest/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "copy attendee list" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "copy guest@example.com" }),
    ).toBeInTheDocument();
  });

  it("shows the editor on a microsoft calendar that can invite attendees", () => {
    const calendar = makeCalendar({ provider: "microsoft" });
    const draft = editDraftOrThrow(makeMeetingEvent(calendar.id));

    renderEventForm(draft, [calendar]);

    expect(screen.getByRole("combobox", { name: "Guests" })).toBeEnabled();
  });

  it("keeps the read-only guest list on a google calendar that cannot invite", () => {
    const calendar = makeCalendar({
      access: "reader",
      capabilities: getCalendarCapabilities("reader"),
    });
    const draft = editDraftOrThrow(makeMeetingEvent(calendar.id));

    renderEventForm(draft, [calendar]);

    expect(
      screen.queryByRole("combobox", { name: "Guests" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/1 guest/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "copy attendee list" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "copy guest@example.com" }),
    ).toBeInTheDocument();
  });

  it("shows no editor on a local calendar", () => {
    const calendar = makeCalendar({
      provider: "local",
      accountEmail: undefined,
      capabilities: {
        canReadAvailability: true,
        canReadDetails: true,
        canWrite: true,
        canManage: false,
        canWatchEvents: false,
        canInviteAttendees: false,
      },
    });
    const event = createMockEvent({
      calendarId: calendar.id,
      content: { kind: "details", title: "Errand", description: "" },
    });

    renderEventForm(editDraftOrThrow(event), [calendar]);

    expect(
      screen.queryByRole("combobox", { name: "Guests" }),
    ).not.toBeInTheDocument();
  });

  it("shows the editor for a single occurrence of a series, noting the edit is series-wide", () => {
    const calendar = makeCalendar();
    const seriesId = EventIdSchema.parse(createObjectIdString());
    const event = makeMeetingEvent(calendar.id, {
      recurrence: { kind: "occurrence", seriesId },
    });

    renderEventForm(editDraftOrThrow(event), [calendar]);

    expect(
      screen.getByRole("combobox", { name: "Guests" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Guest changes apply to all events in this series."),
    ).toBeInTheDocument();
  });

  it("shows the editor when editing the series base itself", () => {
    const calendar = makeCalendar();
    const event = makeMeetingEvent(calendar.id, {
      recurrence: { kind: "series", rules: ["RRULE:FREQ=WEEKLY"] },
    });

    renderEventForm(editDraftOrThrow(event), [calendar]);

    expect(
      screen.getByRole("combobox", { name: "Guests" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Guest changes apply to all events in this series."),
    ).toBeInTheDocument();
  });

  it("omits the series-wide note on a non-recurring event", () => {
    const calendar = makeCalendar();
    const event = makeMeetingEvent(calendar.id);

    renderEventForm(editDraftOrThrow(event), [calendar]);

    expect(
      screen.getByRole("combobox", { name: "Guests" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Guest changes apply to all events in this series."),
    ).not.toBeInTheDocument();
  });

  it("treats an event with no organizer as organized by the account (Compass-created)", () => {
    const calendar = makeCalendar();
    const event = createMockEvent({
      calendarId: calendar.id,
      content: { kind: "details", title: "My own event", description: "" },
    });

    renderEventForm(editDraftOrThrow(event), [calendar]);

    expect(
      screen.getByRole("combobox", { name: "Guests" }),
    ).toBeInTheDocument();
  });

  it("does not submit the form when Enter interacts with the guest combobox", async () => {
    const user = userEvent.setup();
    const calendar = makeCalendar();
    const draft = editDraftOrThrow(makeMeetingEvent(calendar.id));
    const onSubmit = mock();

    const { setDraft } = renderEventForm(draft, [calendar], { onSubmit });

    const combobox = screen.getByRole("combobox", { name: "Guests" });
    await user.type(combobox, "new-guest@example.com");
    await user.keyboard("{Enter}");

    // The chip landed in the draft, and the form did not save.
    expect(setDraft).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();

    // Enter outside the combobox still saves (regression guard).
    await user.click(screen.getByPlaceholderText("Title"));
    await user.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
