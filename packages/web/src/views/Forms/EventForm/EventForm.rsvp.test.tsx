import { HotkeyManager, resolveModifier } from "@tanstack/react-hotkeys";
import { act, render, screen } from "@testing-library/react";
import { type ReactNode } from "react";
import {
  type Calendar,
  getCalendarCapabilities,
} from "@core/types/calendar.contracts";
import { CalendarIdSchema } from "@core/types/domain-primitives";
import { type Event } from "@core/types/event.contracts";
import { type Attendee } from "@core/types/event-attendance.contracts";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import { focusEventFormField } from "@web/common/utils/form/form.util";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { type GridEventDraft } from "@web/events/event-draft.types";
import { editGridEventDraft } from "@web/events/grid-event-draft.adapter";
import { useEditSequenceShortcut } from "@web/shortcuts/useEditSequenceShortcut";
import { EventForm } from "@web/views/Forms/EventForm/EventForm";
import { beforeEach, describe, expect, it, mock } from "bun:test";

// WP-08 RSVP-control gating: Going / Maybe / Decline shows exactly when the
// calendar's connected account email appears in the attendee list (organizer
// included), regardless of calendar writability — and never on local events
// or events the user is not invited to.

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

const selfAttendee: Attendee = {
  // Case-differing on purpose: the self match is case-insensitive.
  email: "Me@Example.com",
  displayName: null,
  responseStatus: "needsAction",
};

const otherAttendee: Attendee = {
  email: "guest@example.com",
  displayName: "Guest One",
  responseStatus: "accepted",
};

const makeInvitedEvent = (
  calendarId: Calendar["id"],
  overrides: Partial<Event> = {},
): Event =>
  createMockEvent({
    calendarId,
    content: {
      kind: "details",
      title: "Team offsite",
      description: "",
      organizer: { email: "organizer@example.com", displayName: null },
      attendees: [selfAttendee, otherAttendee],
    },
    ...overrides,
  });

const renderEventForm = (
  draft: GridEventDraft,
  calendars: Calendar[],
  wrap?: (form: ReactNode) => ReactNode,
) => {
  const { queryClient, wrapper } = createStoreWrapper();
  queryClient.setQueryData(calendarQueryKeys.all, calendars);

  const form = (
    <EventForm
      draft={draft}
      isDraft={false}
      isExistingEvent={true}
      onClose={mock()}
      onDelete={mock()}
      onDuplicate={mock()}
      onSubmit={mock()}
      setDraft={mock()}
    />
  );

  return render(wrap ? wrap(form) : form, { wrapper });
};

function WithEditLeader({ children }: { children: ReactNode }) {
  useEditSequenceShortcut({ onSequence: focusEventFormField });
  return <>{children}</>;
}

const editDraftOrThrow = (event: Event): GridEventDraft => {
  const draft = editGridEventDraft(event);
  if (!draft) throw new Error("expected an edit draft");
  return draft;
};

const queryRsvpGroup = () =>
  screen.queryByRole("radiogroup", { name: "Going?" });

function dispatchModDigitKey(target: HTMLElement, code: string, key: string) {
  const isControl = resolveModifier("Mod") === "Control";
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

function dispatchModKey(target: HTMLElement, key: string) {
  const isControl = resolveModifier("Mod") === "Control";
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    composed: true,
    ctrlKey: isControl,
    key,
    metaKey: !isControl,
  });
  target.dispatchEvent(event);
  return event;
}

function dispatchKey(target: HTMLElement, key: string) {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    composed: true,
    key,
  });
  target.dispatchEvent(event);
  return event;
}

const stubVisibleRect = (element: HTMLElement) => {
  element.getBoundingClientRect = () =>
    ({
      top: 200,
      left: 80,
      bottom: 240,
      right: 320,
      width: 240,
      height: 40,
      x: 80,
      y: 200,
      toJSON: () => ({}),
    }) as DOMRect;
};

describe("EventForm RSVP control gating", () => {
  beforeEach(() => {
    HotkeyManager.resetInstance();
    document.body.removeAttribute("data-app-locked");
  });

  it("shows the control when the account email is an attendee on a Google calendar", () => {
    const calendar = makeCalendar();
    renderEventForm(editDraftOrThrow(makeInvitedEvent(calendar.id)), [
      calendar,
    ]);

    expect(queryRsvpGroup()).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Going" })).toBeInTheDocument();
  });

  it("shows the control on a microsoft calendar the same way", () => {
    const calendar = makeCalendar({ provider: "microsoft" });
    renderEventForm(editDraftOrThrow(makeInvitedEvent(calendar.id)), [
      calendar,
    ]);

    expect(queryRsvpGroup()).toBeInTheDocument();
  });

  it("shows the control on a viewer-access (read-only) calendar — RSVP is not a calendar write", () => {
    const calendar = makeCalendar({
      access: "reader",
      capabilities: getCalendarCapabilities("reader"),
    });
    renderEventForm(editDraftOrThrow(makeInvitedEvent(calendar.id)), [
      calendar,
    ]);

    expect(queryRsvpGroup()).toBeInTheDocument();
    // The rest of the form stays read-only.
    expect(screen.getByRole("note")).toHaveTextContent(/read-only/i);
  });

  it("shows the control for the organizer when they are in the attendee list", () => {
    const calendar = makeCalendar();
    const event = makeInvitedEvent(calendar.id, {
      content: {
        kind: "details",
        title: "My own meeting",
        description: "",
        organizer: { email: ACCOUNT_EMAIL, displayName: null },
        attendees: [
          { ...selfAttendee, responseStatus: "accepted" },
          otherAttendee,
        ],
      },
    });

    renderEventForm(editDraftOrThrow(event), [calendar]);

    expect(queryRsvpGroup()).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Going" })).toBeChecked();
  });

  it("hides the control when the account email is not among the attendees", () => {
    const calendar = makeCalendar();
    const event = makeInvitedEvent(calendar.id, {
      content: {
        kind: "details",
        title: "Their meeting",
        description: "",
        organizer: { email: "organizer@example.com", displayName: null },
        attendees: [otherAttendee],
      },
    });

    renderEventForm(editDraftOrThrow(event), [calendar]);

    expect(queryRsvpGroup()).not.toBeInTheDocument();
  });

  it("hides the control on a local event", () => {
    const calendar = makeCalendar({
      provider: "local",
      accountEmail: undefined,
    });
    const event = createMockEvent({
      calendarId: calendar.id,
      content: { kind: "details", title: "Errand", description: "" },
    });

    renderEventForm(editDraftOrThrow(event), [calendar]);

    expect(queryRsvpGroup()).not.toBeInTheDocument();
  });

  it("hides the control for an event without attendees", () => {
    const calendar = makeCalendar();
    const event = createMockEvent({
      calendarId: calendar.id,
      content: { kind: "details", title: "Solo focus", description: "" },
    });

    renderEventForm(editDraftOrThrow(event), [calendar]);

    expect(queryRsvpGroup()).not.toBeInTheDocument();
  });
});

describe("EventForm RSVP shortcut targeting", () => {
  beforeEach(() => {
    HotkeyManager.resetInstance();
    document.body.removeAttribute("data-app-locked");
  });

  it("jumps focus to the Going radio with Mod+- when unanswered", () => {
    const calendar = makeCalendar();
    renderEventForm(editDraftOrThrow(makeInvitedEvent(calendar.id)), [
      calendar,
    ]);

    const titleField = screen.getByPlaceholderText("Title");
    act(() => titleField.focus());
    dispatchModDigitKey(titleField, "Minus", "-");

    expect(screen.getByRole("radio", { name: "Going" })).toHaveFocus();
  });

  it("jumps focus to the checked RSVP answer with Mod+-", () => {
    const calendar = makeCalendar();
    const event = makeInvitedEvent(calendar.id, {
      content: {
        kind: "details",
        title: "Team offsite",
        description: "",
        organizer: { email: "organizer@example.com", displayName: null },
        attendees: [
          { ...selfAttendee, responseStatus: "tentative" },
          otherAttendee,
        ],
      },
    });
    renderEventForm(editDraftOrThrow(event), [calendar]);

    const titleField = screen.getByPlaceholderText("Title");
    act(() => titleField.focus());
    dispatchModDigitKey(titleField, "Minus", "-");

    expect(screen.getByRole("radio", { name: "Maybe" })).toHaveFocus();
  });

  it("jumps focus to RSVP with Mod+E then G from the title field", () => {
    const calendar = makeCalendar();
    renderEventForm(
      editDraftOrThrow(makeInvitedEvent(calendar.id)),
      [calendar],
      (form) => <WithEditLeader>{form}</WithEditLeader>,
    );

    const titleField = screen.getByPlaceholderText("Title");
    act(() => titleField.focus());
    dispatchModKey(titleField, "e");
    dispatchKey(titleField, "g");

    expect(screen.getByRole("radio", { name: "Going" })).toHaveFocus();
  });

  it("reveals a hold-Mod chip on the RSVP control", async () => {
    const calendar = makeCalendar();
    renderEventForm(editDraftOrThrow(makeInvitedEvent(calendar.id)), [
      calendar,
    ]);

    const wrapper = document.getElementById("event-form-rsvp");
    expect(wrapper).not.toBeNull();
    stubVisibleRect(wrapper!);

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

    expect(screen.getByRole("status").textContent).toContain("- for going");
  });

  it("does not advertise the RSVP jump when the control is hidden", async () => {
    const calendar = makeCalendar();
    const event = makeInvitedEvent(calendar.id, {
      content: {
        kind: "details",
        title: "Their meeting",
        description: "",
        organizer: { email: "organizer@example.com", displayName: null },
        attendees: [otherAttendee],
      },
    });
    renderEventForm(editDraftOrThrow(event), [calendar]);

    expect(queryRsvpGroup()).not.toBeInTheDocument();

    const titleField = screen.getByPlaceholderText("Title");
    act(() => titleField.focus());
    expect(() => dispatchModDigitKey(titleField, "Minus", "-")).not.toThrow();
    expect(titleField).toHaveFocus();

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

    expect(screen.getByRole("status").textContent).not.toContain("going");
  });
});
