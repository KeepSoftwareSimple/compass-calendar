import { HotkeyManager, resolveModifier } from "@tanstack/react-hotkeys";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  type Calendar,
  getCalendarCapabilities,
} from "@core/types/calendar.contracts";
import { CalendarIdSchema } from "@core/types/domain-primitives";
import { type Event } from "@core/types/event.contracts";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import { focusEventFormField } from "@web/common/utils/form/form.util";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { type GridEventDraft } from "@web/events/event-draft.types";
import {
  createGridEventDraft,
  editGridEventDraft,
  timedGridSchedule,
} from "@web/events/grid-event-draft.adapter";
import { useEditSequenceShortcut } from "@web/shortcuts/useEditSequenceShortcut";
import { EventForm } from "@web/views/Forms/EventForm/EventForm";
import { beforeEach, describe, expect, it, mock } from "bun:test";

// The "Add Google Meet" switch: offered on a create draft whose target
// calendar advertises a conference kind, never on an edit (sync has no
// conference channel on update), and reachable through the `e m` leader
// sequence like every other form field. Sibling to the attendees test for
// the same isolation reasons (full form, no subcomponent mocks).

const makeCalendar = (overrides: Partial<Calendar> = {}): Calendar => ({
  id: CalendarIdSchema.parse(createObjectIdString()),
  name: "Work calendar",
  description: "",
  timeZone: null,
  foregroundColor: "#000000",
  backgroundColor: "#3b82f6",
  provider: "google",
  access: "owner",
  capabilities: {
    ...getCalendarCapabilities("owner"),
    conferenceKinds: ["meet"],
  },
  isPrimary: true,
  isVisible: true,
  isActive: true,
  accountEmail: "me@example.com",
  ...overrides,
});

const createDraftOn = (calendarId: Calendar["id"]): GridEventDraft =>
  createGridEventDraft(
    timedGridSchedule(
      new Date("2026-05-20T10:00:00.000Z"),
      new Date("2026-05-20T11:00:00.000Z"),
    ),
    undefined,
    calendarId,
  );

const editDraftWithLink = (calendarId: Calendar["id"]): GridEventDraft => {
  const event: Event = createMockEvent({
    calendarId,
    content: {
      kind: "details",
      title: "Weekly sync",
      description: "",
      conference: {
        url: "https://meet.google.com/abc-defg-hij",
        label: "Google Meet",
      },
    },
  });
  const draft = editGridEventDraft(event);
  if (!draft) throw new Error("expected an edit draft");
  return draft;
};

function WithEditLeader({ children }: { children: React.ReactNode }) {
  useEditSequenceShortcut({ onSequence: focusEventFormField });
  return <>{children}</>;
}

const renderEventForm = (draft: GridEventDraft, calendars: Calendar[]) => {
  const { queryClient, wrapper } = createStoreWrapper();
  queryClient.setQueryData(calendarQueryKeys.all, calendars);
  const setDraft = mock();

  const utils = render(
    <WithEditLeader>
      <EventForm
        draft={draft}
        isDraft={draft.kind === "create"}
        isExistingEvent={draft.kind === "edit"}
        onClose={mock()}
        onDelete={mock()}
        onDuplicate={mock()}
        onSubmit={mock()}
        setDraft={setDraft}
      />
    </WithEditLeader>,
    { wrapper },
  );

  return { setDraft, ...utils };
};

function dispatchModKey(target: HTMLElement, key: string) {
  const isControl = resolveModifier("Mod") === "Control";
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      composed: true,
      ctrlKey: isControl,
      key,
      metaKey: !isControl,
    }),
  );
}

function dispatchKey(target: HTMLElement, key: string) {
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      composed: true,
      key,
    }),
  );
}

describe("EventForm meeting link switch", () => {
  beforeEach(() => {
    HotkeyManager.resetInstance();
    document.body.removeAttribute("data-app-locked");
  });

  it("offers Add Google Meet, off by default, on a create draft targeting a calendar that can mint one", () => {
    const calendar = makeCalendar();
    renderEventForm(createDraftOn(calendar.id), [calendar]);

    const toggle = screen.getByRole("switch", { name: "Add Google Meet" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("labels the switch by the calendar's conference kind, never its provider", () => {
    const calendar = makeCalendar({
      provider: "microsoft",
      capabilities: {
        ...getCalendarCapabilities("owner"),
        conferenceKinds: ["teams"],
      },
    });
    renderEventForm(createDraftOn(calendar.id), [calendar]);

    expect(
      screen.getByRole("switch", { name: "Add Microsoft Teams" }),
    ).toBeInTheDocument();
  });

  it("hides the switch when the calendar cannot mint a link", () => {
    const calendar = makeCalendar({
      capabilities: {
        ...getCalendarCapabilities("owner"),
        conferenceKinds: [],
      },
    });
    renderEventForm(createDraftOn(calendar.id), [calendar]);

    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("hides the switch on an edit draft", () => {
    const calendar = makeCalendar();
    renderEventForm(editDraftWithLink(calendar.id), [calendar]);

    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("writes createConference into the draft when toggled", async () => {
    const user = userEvent.setup();
    const calendar = makeCalendar();
    const { setDraft } = renderEventForm(createDraftOn(calendar.id), [
      calendar,
    ]);

    await user.click(screen.getByRole("switch", { name: "Add Google Meet" }));

    // EventForm resolves updaters itself and hands setDraft the next draft.
    const next = setDraft.mock.calls.at(-1)?.[0] as GridEventDraft;
    expect(next.kind).toBe("create");
    expect(next.values).toMatchObject({ createConference: true });
  });

  it("jumps focus to the switch with Mod+E then M on a create draft", () => {
    const calendar = makeCalendar();
    renderEventForm(createDraftOn(calendar.id), [calendar]);

    const titleField = screen.getByPlaceholderText("Title");
    act(() => titleField.focus());

    dispatchModKey(titleField, "e");
    dispatchKey(titleField, "m");

    expect(
      screen.getByRole("switch", { name: "Add Google Meet" }),
    ).toHaveFocus();
  });

  it("jumps focus to the existing meeting link with Mod+E then M on an edit draft", () => {
    const calendar = makeCalendar();
    renderEventForm(editDraftWithLink(calendar.id), [calendar]);

    const titleField = screen.getByPlaceholderText("Title");
    act(() => titleField.focus());

    dispatchModKey(titleField, "e");
    dispatchKey(titleField, "m");

    expect(screen.getByRole("link", { name: "Google Meet" })).toHaveFocus();
    expect(
      screen.getByRole("button", { name: "copy meeting link" }),
    ).toBeInTheDocument();
  });
});
