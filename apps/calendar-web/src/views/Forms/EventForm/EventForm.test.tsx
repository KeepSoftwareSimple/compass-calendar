import { HotkeyManager, resolveModifier } from "@tanstack/react-hotkeys";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act, type SetStateAction, useState } from "react";
import { type EventId } from "@core/types/domain-primitives";
import { EventScheduleSchema } from "@core/types/event.contracts";
import dayjs from "@core/util/date/dayjs";
import {
  createStoreWrapper,
  renderWithStore,
} from "@web/__tests__/render-with-store";
import { toNormalizedEventQueryData } from "@web/__tests__/utils/event-query-test-data";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import { ID_GRID_MAIN } from "@web/common/constants/web.constants";
import { Categories_Event } from "@web/common/types/web.event.types";
import { focusEventFormField } from "@web/common/utils/form/form.util";
import { type GridEventDraft } from "@web/events/event-draft.types";
import {
  createGridEventDraft,
  editGridEventDraft,
  replaceGridDraftSchedule,
  timedGridSchedule,
} from "@web/events/grid-event-draft.adapter";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import { useEditSequenceShortcut } from "@web/shortcuts/useEditSequenceShortcut";
import { type Props as DateTimeSectionProps } from "@web/views/Forms/EventForm/DateControlsSection/DateTimeSection/DateTimeSection";
import { getFormDates } from "@web/views/Forms/EventForm/DateControlsSection/DateTimeSection/form.datetime.util";
import * as realSavesection from "@web/views/Forms/EventForm/SaveSection/SaveSection";
import { beforeEach, describe, expect, it, mock } from "bun:test";

/**
 * The `Mod+E` leader lives in one place for the whole app (Week/Day mount it
 * via useGridEventFormFieldSequences), not in EventForm. When no grid card is
 * focused and the form is open, that owner dispatches straight to
 * focusEventFormField, which is what this harness reproduces so the form's own
 * fields can still be tested against the real leader.
 */
function WithEditLeader({ children }: { children: React.ReactNode }) {
  useEditSequenceShortcut({ onSequence: focusEventFormField });
  return <>{children}</>;
}

type CapturedDateTimeSectionProps = Pick<
  DateTimeSectionProps,
  | "displayEndDate"
  | "endTime"
  | "selectedEndDate"
  | "selectedStartDate"
  | "startTime"
>;

interface CapturedDateControlsSectionProps {
  dateTimeSectionProps: CapturedDateTimeSectionProps;
  eventCategory: Categories_Event;
  onToggleAllDay: (checked: boolean) => void;
}

let capturedDateControlsSectionProps: CapturedDateControlsSectionProps | null =
  null;

mock.module(
  "@web/views/Forms/EventForm/DateControlsSection/DateControlsSection/DateControlsSection",
  () => ({
    DateControlsSection: (props: CapturedDateControlsSectionProps) => {
      capturedDateControlsSectionProps = props;
      return null;
    },
  }),
);

interface CapturedRecurrenceSectionProps {
  draft: { values: { recurrence: { kind: string; rules?: string[] } } };
  seriesRules?: readonly string[];
}

let capturedRecurrenceSectionProps: CapturedRecurrenceSectionProps | null =
  null;

mock.module(
  "@web/views/Forms/EventForm/DateControlsSection/RecurrenceSection/RecurrenceSection",
  () => ({
    RecurrenceSection: (props: CapturedRecurrenceSectionProps) => {
      capturedRecurrenceSectionProps = props;
      return null;
    },
  }),
);

mockModuleForFile(
  "@web/views/Forms/EventForm/SaveSection/SaveSection",
  realSavesection,
  {
    SaveSection: ({ onSubmit }: { onSubmit: () => void }) => (
      <button type="button" onClick={onSubmit}>
        Save
      </button>
    ),
  },
);

const { EventForm } = require("./EventForm") as typeof import("./EventForm");

function dispatchModKey(
  target: HTMLElement,
  key: string,
  { shift = false }: { shift?: boolean } = {},
) {
  const modifierKey = resolveModifier("Mod");
  const isControl = modifierKey === "Control";

  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      composed: true,
      ctrlKey: isControl,
      key,
      metaKey: !isControl,
      shiftKey: shift,
    }),
  );
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

// digitPickIndex matches on the physical `code` first; a bare `key` (as
// dispatchKey sends) only exercises its numpad fallback path. Set `code` too
// so this hits the primary match real keyboards actually send.
function dispatchDigitKey(target: HTMLElement, code: string, key: string) {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    composed: true,
    code,
    key,
  });
  target.dispatchEvent(event);
  return event;
}

// digitPickIndex/physicalDigitIndex match on the physical `code` first; set
// it alongside `key` so this hits the primary match real keyboards send.
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

function dispatchArrowDown(target: HTMLElement) {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    composed: true,
    key: "ArrowDown",
  });
  target.dispatchEvent(event);
  return event;
}

function dispatchDelete(target: HTMLElement) {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    composed: true,
    key: "Delete",
  });
  target.dispatchEvent(event);
  return event;
}

// An "edit" GridEventDraft for an already-saved event, built from the strict
// `Event` contract via the same editGridEventDraft adapter production code
// uses (DayCalendarGrid.tsx, GridDraft.tsx).
const createEditDraft = (
  overrides: {
    description?: string;
    endDate?: string;
    startDate?: string;
    title?: string;
    location?: string | null;
    organizer?: { email: string; displayName: string | null } | null;
    attendees?: Array<{
      email: string;
      displayName: string | null;
      responseStatus: "needsAction" | "accepted" | "declined" | "tentative";
    }>;
    conference?: { url: string; label: string | null } | null;
  } = {},
): GridEventDraft => {
  const {
    description = "",
    endDate = "2026-04-24T15:00:00.000Z",
    startDate = "2026-04-24T14:00:00.000Z",
    title = "Keyboard duplicate event",
    location = null,
    organizer = null,
    attendees = [],
    conference = null,
  } = overrides;

  const event = createMockEvent({
    content: {
      kind: "details",
      title,
      description,
      location,
      organizer,
      attendees,
      conference,
    },
    schedule: EventScheduleSchema.parse({
      kind: "timed",
      start: startDate,
      end: endDate,
      timeZone: "UTC",
    }),
  });

  const draft = editGridEventDraft(event);
  if (!draft) throw new Error("expected an edit draft");

  return draft;
};

// A "create" GridEventDraft for a not-yet-saved draft (no source event).
const createNewDraft = (
  overrides: { endDate?: string; startDate?: string; title?: string } = {},
): GridEventDraft => {
  const {
    endDate = "2026-04-24T15:00:00.000Z",
    startDate = "2026-04-24T14:00:00.000Z",
    title = "Unsaved draft",
  } = overrides;

  const draft = createGridEventDraft(
    timedGridSchedule(new Date(startDate), new Date(endDate)),
  );
  if (draft.kind !== "create") throw new Error("expected a create draft");

  return { ...draft, values: { ...draft.values, title } };
};

const createAllDayDraft = (): GridEventDraft =>
  createGridEventDraft({
    kind: "allDay",
    start: new Date("2026-04-24T00:00:00"),
    end: new Date("2026-04-25T00:00:00"),
  });

describe("EventForm", () => {
  beforeEach(() => {
    HotkeyManager.resetInstance();
    capturedDateControlsSectionProps = null;
    capturedRecurrenceSectionProps = null;
    document.body.removeAttribute("data-app-locked");
  });

  it("renders the actions toolbar above the title", () => {
    renderWithStore(
      <EventForm
        draft={createEditDraft({ description: "Plan the launch" })}
        isDraft={false}
        isExistingEvent={true}
        onClose={mock()}
        onDelete={mock()}
        onDuplicate={mock()}
        onSubmit={mock()}
        setDraft={mock()}
      />,
    );

    const title = screen.getByPlaceholderText("Title");
    const actionRow = screen.getByRole("group", { name: "Event actions" });

    // Above the title in DOM order, so the title keeps the form's opening
    // focus and the action row sits behind Shift+Tab rather than stealing the
    // first forward Tab the way the old kebab menu did.
    expect(
      actionRow.compareDocumentPosition(title) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      within(actionRow).getByRole("button", { name: "Duplicate" }),
    ).toBeInTheDocument();
    expect(
      within(actionRow).getByRole("button", { name: "Delete" }),
    ).toBeInTheDocument();
    expect(
      within(actionRow).getByRole("button", { name: "Close" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "copy event" }),
    ).not.toBeInTheDocument();
  });

  it("does not render field-level copy buttons", () => {
    renderWithStore(
      <EventForm
        draft={createEditDraft({
          title: "Standup",
          location: "Room 4",
          description: "Plan the launch",
        })}
        isDraft={false}
        isExistingEvent={true}
        onClose={mock()}
        onDelete={mock()}
        onDuplicate={mock()}
        onSubmit={mock()}
        setDraft={mock()}
      />,
    );

    expect(screen.getByPlaceholderText("Title")).toHaveValue("Standup");
    expect(
      screen.queryByRole("button", { name: "copy event title" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "copy event location" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "copy event description" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "copy attendee list" }),
    ).not.toBeInTheDocument();
  });

  it("renders as a transparent sidebar column with the save footer after the fields", () => {
    renderWithStore(
      <EventForm
        draft={createEditDraft({ description: "Plan the launch" })}
        isDraft={false}
        isExistingEvent={true}
        onClose={mock()}
        onDelete={mock()}
        onDuplicate={mock()}
        onSubmit={mock()}
        setDraft={mock()}
      />,
    );

    // Regression guard for the old floating-card look: the form root used to
    // paint an opaque `--event-form-bg` tint over the sidebar background.
    const form = screen.getByRole("form");
    expect(form.style.getPropertyValue("--event-form-bg")).toBe("");

    // The save footer is pinned outside the scrollable field body, so it must
    // follow the description in DOM order.
    const description = screen.getByRole("textbox", { name: "Description" });
    const save = screen.getByRole("button", { name: "Save" });
    expect(
      description.compareDocumentPosition(save) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("lets long descriptions grow with content instead of capping height", () => {
    const longDescription = Array.from(
      { length: 12 },
      (_, index) =>
        `<p>Paragraph ${index + 1}: event details that should remain visible without an inner scroll trap.</p>`,
    ).join("");

    renderWithStore(
      <EventForm
        draft={createEditDraft({ description: longDescription })}
        isDraft={false}
        isExistingEvent={true}
        onClose={mock()}
        onDelete={mock()}
        onDuplicate={mock()}
        onSubmit={mock()}
        setDraft={mock()}
      />,
    );

    const description = screen.getByRole("textbox", { name: "Description" });
    const wrapper = description.closest(".c-rich-text");

    expect(wrapper?.className).not.toContain("max-h-45");
    expect(wrapper?.className).not.toContain("overflow-y-auto");
    expect(description.textContent).toContain("Paragraph 1:");
    expect(description.textContent).toContain("Paragraph 12:");
  });

  it("duplicates the event with Mod+D while the title field is focused", async () => {
    const draft = createEditDraft();
    const onDuplicate = mock();
    const onClose = mock();

    renderWithStore(
      <EventForm
        draft={draft}
        isDraft={false}
        isExistingEvent={true}
        onClose={onClose}
        onDelete={mock()}
        onDuplicate={onDuplicate}
        onSubmit={mock()}
        setDraft={mock()}
      />,
    );

    const titleField = screen.getByPlaceholderText("Title");
    act(() => titleField.focus());

    dispatchModKey(titleField, "d");

    await waitFor(() => {
      expect(onDuplicate).toHaveBeenCalledTimes(1);
    });
    expect(onDuplicate).toHaveBeenCalledWith(draft);
    // Same handler as the Duplicate action button, which closes the form.
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("does not duplicate the event with Mod+C while the title field is focused", () => {
    const onDuplicate = mock();

    renderWithStore(
      <EventForm
        draft={createEditDraft()}
        isDraft={false}
        isExistingEvent={true}
        onClose={mock()}
        onDelete={mock()}
        onDuplicate={onDuplicate}
        onSubmit={mock()}
        setDraft={mock()}
      />,
    );

    const titleField = screen.getByPlaceholderText("Title");
    act(() => titleField.focus());

    dispatchModKey(titleField, "c");

    expect(onDuplicate).not.toHaveBeenCalled();
  });

  it("jumps focus to the location field with Mod+E then L from the title field", () => {
    renderWithStore(
      <WithEditLeader>
        <EventForm
          draft={createEditDraft()}
          isDraft={false}
          isExistingEvent={true}
          onClose={mock()}
          onDelete={mock()}
          onDuplicate={mock()}
          onSubmit={mock()}
          setDraft={mock()}
        />
      </WithEditLeader>,
    );

    const titleField = screen.getByPlaceholderText("Title");
    act(() => titleField.focus());

    dispatchModKey(titleField, "e");
    const followEvent = dispatchKey(titleField, "l");

    expect(followEvent.defaultPrevented).toBe(true);
    expect(screen.getByRole("textbox", { name: "Location" })).toHaveFocus();
  });

  it("jumps focus to the description field with Mod+E then D from the location field", () => {
    renderWithStore(
      <WithEditLeader>
        <EventForm
          draft={createEditDraft({ description: "Plan the launch" })}
          isDraft={false}
          isExistingEvent={true}
          onClose={mock()}
          onDelete={mock()}
          onDuplicate={mock()}
          onSubmit={mock()}
          setDraft={mock()}
        />
      </WithEditLeader>,
    );

    const locationField = screen.getByRole("textbox", { name: "Location" });
    act(() => locationField.focus());

    dispatchModKey(locationField, "e");
    dispatchKey(locationField, "d");

    expect(screen.getByRole("textbox", { name: "Description" })).toHaveFocus();
  });

  it("jumps focus out of the TipTap description editor to the title field with Mod+E then T", () => {
    renderWithStore(
      <WithEditLeader>
        <EventForm
          draft={createEditDraft({ description: "Plan the launch" })}
          isDraft={false}
          isExistingEvent={true}
          onClose={mock()}
          onDelete={mock()}
          onDuplicate={mock()}
          onSubmit={mock()}
          setDraft={mock()}
        />
      </WithEditLeader>,
    );

    const descriptionField = screen.getByRole("textbox", {
      name: "Description",
    });
    act(() => descriptionField.focus());

    dispatchModKey(descriptionField, "e");
    dispatchKey(descriptionField, "t");

    expect(screen.getByPlaceholderText("Title")).toHaveFocus();
  });

  it("does not crash jumping to the account field on an edit draft, where the picker isn't rendered", () => {
    renderWithStore(
      <WithEditLeader>
        <EventForm
          draft={createEditDraft()}
          isDraft={false}
          isExistingEvent={true}
          onClose={mock()}
          onDelete={mock()}
          onDuplicate={mock()}
          onSubmit={mock()}
          setDraft={mock()}
        />
      </WithEditLeader>,
    );

    const titleField = screen.getByPlaceholderText("Title");
    act(() => titleField.focus());

    dispatchModKey(titleField, "e");
    expect(() => dispatchKey(titleField, "a")).not.toThrow();
    expect(titleField).toHaveFocus();
  });

  it("jumps focus to the color picker with Mod+E then C from the title field", () => {
    renderWithStore(
      <WithEditLeader>
        <EventForm
          draft={createEditDraft()}
          isDraft={false}
          isExistingEvent={true}
          onClose={mock()}
          onDelete={mock()}
          onDuplicate={mock()}
          onSubmit={mock()}
          setDraft={mock()}
        />
      </WithEditLeader>,
    );

    const titleField = screen.getByPlaceholderText("Title");
    act(() => titleField.focus());

    dispatchModKey(titleField, "e");
    dispatchKey(titleField, "c");

    expect(
      screen.getByRole("radio", { name: "Calendar default" }),
    ).toHaveFocus();
  });

  it("picks a color directly with a digit after jumping to the color field", () => {
    function Harness() {
      const [draft, setDraft] = useState<GridEventDraft | null>(
        createEditDraft(),
      );

      if (!draft) return null;

      return (
        <WithEditLeader>
          <EventForm
            draft={draft}
            isDraft={false}
            isExistingEvent={true}
            onClose={mock()}
            onDelete={mock()}
            onDuplicate={mock()}
            onSubmit={mock()}
            setDraft={setDraft}
          />
        </WithEditLeader>
      );
    }

    renderWithStore(<Harness />);

    const titleField = screen.getByPlaceholderText("Title");
    act(() => titleField.focus());

    dispatchModKey(titleField, "e");
    dispatchKey(titleField, "c");

    const defaultRadio = screen.getByRole("radio", {
      name: "Calendar default",
    });
    expect(defaultRadio).toHaveFocus();

    let event: KeyboardEvent;
    act(() => {
      event = dispatchDigitKey(defaultRadio, "Digit4", "4");
    });

    expect(event!.defaultPrevented).toBe(true);
    expect(screen.getByRole("radio", { name: "Plum" })).toHaveFocus();
  });

  it("does not jump focus when a bare letter is typed without the Mod+E leader", () => {
    renderWithStore(
      <WithEditLeader>
        <EventForm
          draft={createEditDraft()}
          isDraft={false}
          isExistingEvent={true}
          onClose={mock()}
          onDelete={mock()}
          onDuplicate={mock()}
          onSubmit={mock()}
          setDraft={mock()}
        />
      </WithEditLeader>,
    );

    const titleField = screen.getByPlaceholderText("Title");
    act(() => titleField.focus());

    const event = dispatchKey(titleField, "l");

    expect(event.defaultPrevented).toBe(false);
    expect(titleField).toHaveFocus();
  });

  it("jumps focus to the location field with Mod+7 from the title field", () => {
    renderWithStore(
      <EventForm
        draft={createEditDraft()}
        isDraft={false}
        isExistingEvent={true}
        onClose={mock()}
        onDelete={mock()}
        onDuplicate={mock()}
        onSubmit={mock()}
        setDraft={mock()}
      />,
    );

    const titleField = screen.getByPlaceholderText("Title");
    act(() => titleField.focus());

    const event = dispatchModDigitKey(titleField, "Digit7", "7");

    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByRole("textbox", { name: "Location" })).toHaveFocus();
  });

  it("jumps focus to the checked color swatch with Mod+6 from the title field", () => {
    renderWithStore(
      <EventForm
        draft={createEditDraft()}
        isDraft={false}
        isExistingEvent={true}
        onClose={mock()}
        onDelete={mock()}
        onDuplicate={mock()}
        onSubmit={mock()}
        setDraft={mock()}
      />,
    );

    const titleField = screen.getByPlaceholderText("Title");
    act(() => titleField.focus());

    dispatchModDigitKey(titleField, "Digit6", "6");

    expect(
      screen.getByRole("radio", { name: "Calendar default" }),
    ).toHaveFocus();
  });

  it("jumps focus to the description field with Mod+9 from the title field", () => {
    renderWithStore(
      <EventForm
        draft={createEditDraft({ description: "Plan the launch" })}
        isDraft={false}
        isExistingEvent={true}
        onClose={mock()}
        onDelete={mock()}
        onDuplicate={mock()}
        onSubmit={mock()}
        setDraft={mock()}
      />,
    );

    const titleField = screen.getByPlaceholderText("Title");
    act(() => titleField.focus());

    dispatchModDigitKey(titleField, "Digit9", "9");

    expect(screen.getByRole("textbox", { name: "Description" })).toHaveFocus();
  });

  it("picks a color directly with a bare digit after jumping to color with Mod+6", () => {
    function Harness() {
      const [draft, setDraft] = useState<GridEventDraft | null>(
        createEditDraft(),
      );

      if (!draft) return null;

      return (
        <EventForm
          draft={draft}
          isDraft={false}
          isExistingEvent={true}
          onClose={mock()}
          onDelete={mock()}
          onDuplicate={mock()}
          onSubmit={mock()}
          setDraft={setDraft}
        />
      );
    }

    renderWithStore(<Harness />);

    const titleField = screen.getByPlaceholderText("Title");
    act(() => titleField.focus());

    dispatchModDigitKey(titleField, "Digit6", "6");

    const defaultRadio = screen.getByRole("radio", {
      name: "Calendar default",
    });
    expect(defaultRadio).toHaveFocus();

    let event: KeyboardEvent;
    act(() => {
      event = dispatchDigitKey(defaultRadio, "Digit4", "4");
    });

    expect(event!.defaultPrevented).toBe(true);
    expect(screen.getByRole("radio", { name: "Plum" })).toHaveFocus();
  });

  it("does not throw jumping to the calendar field (Mod+5) on an edit draft, which has no calendar picker", () => {
    renderWithStore(
      <EventForm
        draft={createEditDraft()}
        isDraft={false}
        isExistingEvent={true}
        onClose={mock()}
        onDelete={mock()}
        onDuplicate={mock()}
        onSubmit={mock()}
        setDraft={mock()}
      />,
    );

    const titleField = screen.getByPlaceholderText("Title");
    act(() => titleField.focus());

    expect(() => dispatchModDigitKey(titleField, "Digit5", "5")).not.toThrow();
    expect(titleField).toHaveFocus();
  });

  it("closes a draft event immediately when deleting from the menu", async () => {
    const user = userEvent.setup();
    const onClose = mock();
    const onDelete = mock();

    renderWithStore(
      <EventForm
        draft={createNewDraft({ title: "Unsaved draft" })}
        isDraft={true}
        isExistingEvent={false}
        onClose={onClose}
        onDelete={onDelete}
        onDuplicate={mock()}
        onSubmit={mock()}
        setDraft={mock()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not delete an existing event when Delete is pressed in the title field", async () => {
    const onClose = mock();
    const onDelete = mock();

    renderWithStore(
      <EventForm
        draft={createEditDraft()}
        isDraft={false}
        isExistingEvent={true}
        onClose={onClose}
        onDelete={onDelete}
        onDuplicate={mock()}
        onSubmit={mock()}
        setDraft={mock()}
      />,
    );

    const titleField = screen.getByPlaceholderText("Title");
    act(() => titleField.focus());

    const event = dispatchDelete(titleField);

    expect(event.defaultPrevented).toBe(false);
    expect(onDelete).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not delete an existing event when Delete is pressed in the description field", async () => {
    const onClose = mock();
    const onDelete = mock();

    renderWithStore(
      <EventForm
        draft={createEditDraft({ description: "Plan the launch" })}
        isDraft={false}
        isExistingEvent={true}
        onClose={onClose}
        onDelete={onDelete}
        onDuplicate={mock()}
        onSubmit={mock()}
        setDraft={mock()}
      />,
    );

    const descriptionField = screen.getByRole("textbox", {
      name: "Description",
    });
    act(() => descriptionField.focus());

    const event = dispatchDelete(descriptionField);

    expect(event.defaultPrevented).toBe(false);
    expect(onDelete).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not submit when Enter is pressed in the description field", async () => {
    // Regression: existing-event Enter-to-save used ignoreInputs:false and
    // skipped only drafts/comboboxes, so TipTap never received Enter as a
    // newline. shouldDeferEnterToTarget must stand the hotkey down here.
    const user = userEvent.setup();
    const onSubmit = mock();

    renderWithStore(
      <EventForm
        draft={createEditDraft({ description: "Plan the launch" })}
        isDraft={false}
        isExistingEvent={true}
        onClose={mock()}
        onDelete={mock()}
        onDuplicate={mock()}
        onSubmit={onSubmit}
        setDraft={mock()}
      />,
    );

    const descriptionField = screen.getByRole("textbox", {
      name: "Description",
    });
    act(() => descriptionField.focus());

    await user.keyboard("{Enter}");

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits when Enter is pressed on the focused Save button", async () => {
    // Companion to the description carve-out: Enter hotkey must not
    // preventDefault when deferring to buttons, or Tab→Save→Enter dies.
    const user = userEvent.setup();
    const onSubmit = mock();

    renderWithStore(
      <EventForm
        draft={createEditDraft()}
        isDraft={false}
        isExistingEvent={true}
        onClose={mock()}
        onDelete={mock()}
        onDuplicate={mock()}
        onSubmit={onSubmit}
        setDraft={mock()}
      />,
    );

    const save = screen.getByRole("button", { name: "Save" });
    act(() => save.focus());

    await user.keyboard("{Enter}");

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("submits with Mod+Enter while a color swatch is focused", async () => {
    // Color radios are HTMLInputElements; after a color change the form
    // re-renders with focus still on the swatch. Mod+Enter must still submit
    // (ignoreInputs: false), not only when focus returns to a text field.
    const user = userEvent.setup();
    const onSubmit = mock();

    function Harness() {
      const [draft, setDraft] = useState<GridEventDraft | null>(
        createEditDraft(),
      );

      if (!draft) return null;

      return (
        <EventForm
          draft={draft}
          isDraft={false}
          isExistingEvent={true}
          onClose={mock()}
          onDelete={mock()}
          onDuplicate={mock()}
          onSubmit={onSubmit}
          setDraft={setDraft}
        />
      );
    }

    renderWithStore(<Harness />);

    const blueSwatch = screen.getByRole("radio", { name: "Blue" });
    await user.click(blueSwatch);

    expect(blueSwatch).toHaveFocus();

    dispatchModKey(blueSwatch, "Enter");

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  });

  it("submits exactly once with Mod+Enter from the title field", async () => {
    // Local handleIgnoredKeys only preventDefaults Mod+Enter; the global
    // useAppShortcut owns submit. Both must not call onSubmit.
    const onSubmit = mock();

    renderWithStore(
      <EventForm
        draft={createEditDraft()}
        isDraft={false}
        isExistingEvent={true}
        onClose={mock()}
        onDelete={mock()}
        onDuplicate={mock()}
        onSubmit={onSubmit}
        setDraft={mock()}
      />,
    );

    const titleField = screen.getByPlaceholderText("Title");
    act(() => titleField.focus());

    dispatchModKey(titleField, "Enter");

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  });

  it("still deletes an existing event when Delete is pressed on a non-text form target", async () => {
    const onClose = mock();
    const onDelete = mock();

    renderWithStore(
      <EventForm
        draft={createEditDraft()}
        isDraft={false}
        isExistingEvent={true}
        onClose={onClose}
        onDelete={onDelete}
        onDuplicate={mock()}
        onSubmit={mock()}
        setDraft={mock()}
      />,
    );

    const form = screen.getByRole("form");
    act(() => form.focus());

    const event = dispatchDelete(form);

    expect(event.defaultPrevented).toBe(true);

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledTimes(1);
    });
  });

  it("rebases date and time controls during render when event dates change", () => {
    const draft = createEditDraft();
    const nextDraft = replaceGridDraftSchedule(draft, {
      kind: "timed",
      start: new Date("2026-04-25T16:30:00.000Z"),
      end: new Date("2026-04-27T17:30:00.000Z"),
      timeZone: "UTC",
    });

    const { rerender } = renderWithStore(
      <EventForm
        draft={draft}
        isDraft={false}
        isExistingEvent={true}
        onClose={mock()}
        onDelete={mock()}
        onDuplicate={mock()}
        onSubmit={mock()}
        setDraft={mock()}
      />,
    );

    rerender(
      <EventForm
        draft={nextDraft}
        isDraft={false}
        isExistingEvent={true}
        onClose={mock()}
        onDelete={mock()}
        onDuplicate={mock()}
        onSubmit={mock()}
        setDraft={mock()}
      />,
    );

    const expected = getFormDates(
      "2026-04-25T16:30:00.000Z",
      "2026-04-27T17:30:00.000Z",
    );
    const props = capturedDateControlsSectionProps?.dateTimeSectionProps;

    expect(props?.startTime).toEqual(expected.startTime);
    expect(props?.endTime).toEqual(expected.endTime);
    expect(props?.selectedStartDate).toEqual(expected.startDate);
    expect(props?.selectedEndDate).toEqual(expected.endDate);
    expect(props?.displayEndDate).toEqual(
      dayjs(expected.displayEndDate).toDate(),
    );
  });

  it("changes a draft to all day immediately and saves it as all day", async () => {
    const user = userEvent.setup();
    const onSubmit = mock();

    function Harness() {
      const [draft, setDraft] = useState<GridEventDraft | null>(
        createNewDraft(),
      );

      if (!draft) return null;

      return (
        <EventForm
          draft={draft}
          isDraft
          isExistingEvent={false}
          onClose={mock()}
          onDelete={mock()}
          onDuplicate={mock()}
          onSubmit={onSubmit}
          setDraft={setDraft}
        />
      );
    }

    renderWithStore(<Harness />);

    act(() => capturedDateControlsSectionProps?.onToggleAllDay(true));

    expect(capturedDateControlsSectionProps?.eventCategory).toBe(
      Categories_Event.ALLDAY,
    );

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({
          schedule: expect.objectContaining({ kind: "allDay" }),
        }),
      }),
    );
  });

  it("keeps every day covered by a cross-day timed draft when switching to all day", async () => {
    const user = userEvent.setup();
    const onSubmit = mock();

    function Harness() {
      const [draft, setDraft] = useState<GridEventDraft | null>(
        createNewDraft({
          startDate: "2026-04-24T14:00:00.000Z",
          endDate: "2026-04-25T15:00:00.000Z",
        }),
      );

      if (!draft) return null;

      return (
        <EventForm
          draft={draft}
          isDraft
          isExistingEvent={false}
          onClose={mock()}
          onDelete={mock()}
          onDuplicate={mock()}
          onSubmit={onSubmit}
          setDraft={setDraft}
        />
      );
    }

    renderWithStore(<Harness />);

    act(() => capturedDateControlsSectionProps?.onToggleAllDay(true));
    await user.click(screen.getByRole("button", { name: "Save" }));

    const savedDraft = onSubmit.mock.calls[0]?.[0] as GridEventDraft;
    expect(savedDraft.values.schedule).toMatchObject({ kind: "allDay" });
    if (savedDraft.values.schedule.kind !== "allDay") {
      throw new Error("expected an all-day schedule");
    }
    expect(dayjs(savedDraft.values.schedule.end).toYearMonthDayString()).toBe(
      "2026-04-26",
    );
  });

  it("changes an all-day draft to a timed event that can be saved", async () => {
    const user = userEvent.setup();
    const onSubmit = mock();

    function Harness() {
      const [draft, setDraft] = useState<GridEventDraft | null>(
        createAllDayDraft(),
      );

      if (!draft) return null;

      return (
        <EventForm
          draft={draft}
          isDraft
          isExistingEvent={false}
          onClose={mock()}
          onDelete={mock()}
          onDuplicate={mock()}
          onSubmit={onSubmit}
          setDraft={setDraft}
        />
      );
    }

    renderWithStore(<Harness />);

    act(() => capturedDateControlsSectionProps?.onToggleAllDay(false));

    expect(capturedDateControlsSectionProps?.eventCategory).toBe(
      Categories_Event.TIMED,
    );

    await user.click(screen.getByRole("button", { name: "Save" }));

    const savedDraft = onSubmit.mock.calls[0]?.[0] as GridEventDraft;
    expect(savedDraft.values.schedule).toMatchObject({ kind: "timed" });
    if (savedDraft.values.schedule.kind !== "timed") {
      throw new Error("expected a timed schedule");
    }
    expect(
      savedDraft.values.schedule.end.getTime() -
        savedDraft.values.schedule.start.getTime(),
    ).toBe(60 * 60 * 1000);
  });

  it("converts an all-day draft to a timed event inside the grid's current scroll position, not a fixed 9am", async () => {
    const user = userEvent.setup();
    const onSubmit = mock();

    // clientHeight/13hrs/60min = 1 minute per pixel, so scrollTop=780
    // means the grid is scrolled to 1pm (780 minutes from midnight) -
    // well past the 9am default this test exists to disprove.
    const fakeGrid = document.createElement("section");
    fakeGrid.id = ID_GRID_MAIN;
    Object.defineProperty(fakeGrid, "clientHeight", { value: 780 });
    fakeGrid.scrollTop = 780;
    document.body.appendChild(fakeGrid);

    function Harness() {
      const [draft, setDraft] = useState<GridEventDraft | null>(
        createAllDayDraft(),
      );

      if (!draft) return null;

      return (
        <EventForm
          draft={draft}
          isDraft
          isExistingEvent={false}
          onClose={mock()}
          onDelete={mock()}
          onDuplicate={mock()}
          onSubmit={onSubmit}
          setDraft={setDraft}
        />
      );
    }

    renderWithStore(<Harness />);

    act(() => capturedDateControlsSectionProps?.onToggleAllDay(false));

    await user.click(screen.getByRole("button", { name: "Save" }));

    const savedDraft = onSubmit.mock.calls[0]?.[0] as GridEventDraft;
    expect(savedDraft.values.schedule).toMatchObject({ kind: "timed" });
    if (savedDraft.values.schedule.kind !== "timed") {
      throw new Error("expected a timed schedule");
    }

    // visibleStartMinute (780) + 30min margin, rounded up to next 15 = 810
    // minutes from midnight = 13:30.
    expect(dayjs(savedDraft.values.schedule.start).format("HH:mm")).toBe(
      "13:30",
    );
    expect(
      savedDraft.values.schedule.end.getTime() -
        savedDraft.values.schedule.start.getTime(),
    ).toBe(60 * 60 * 1000);
  });

  it("lets an untouched empty draft title keep normal arrow-key behavior", () => {
    const draft = createNewDraft({ title: "" });

    renderWithStore(
      <EventForm
        draft={draft}
        isDraft={true}
        isExistingEvent={false}
        onClose={mock()}
        onDelete={mock()}
        onDuplicate={mock()}
        onSubmit={mock()}
        setDraft={mock()}
      />,
    );

    const titleField = screen.getByPlaceholderText("Title");
    const eventResult = dispatchArrowDown(titleField);

    expect(eventResult.defaultPrevented).toBe(false);
  });

  it("lets an untouched existing event title keep normal arrow-key behavior", () => {
    const draft = createEditDraft({ title: "Planning" });

    renderWithStore(
      <EventForm
        draft={draft}
        isDraft={false}
        isExistingEvent={true}
        onClose={mock()}
        onDelete={mock()}
        onDuplicate={mock()}
        onSubmit={mock()}
        setDraft={mock()}
      />,
    );

    const titleField = screen.getByPlaceholderText("Title");
    const eventResult = dispatchArrowDown(titleField);

    expect(eventResult.defaultPrevented).toBe(false);
  });

  it("lets the description field keep normal arrow-key behavior", () => {
    renderWithStore(
      <EventForm
        draft={createEditDraft({ description: "Plan the launch" })}
        isDraft={false}
        isExistingEvent={true}
        onClose={mock()}
        onDelete={mock()}
        onDuplicate={mock()}
        onSubmit={mock()}
        setDraft={mock()}
      />,
    );

    const descriptionField = screen.getByRole("textbox", {
      name: "Description",
    });
    const eventResult = dispatchArrowDown(descriptionField);

    expect(eventResult.defaultPrevented).toBe(false);
  });

  it("lets directly edited existing event titles keep normal arrow-key behavior", () => {
    const draft = createEditDraft({ title: "Planning" });

    renderWithStore(
      <EventForm
        draft={draft}
        isDraft={false}
        isExistingEvent={true}
        onClose={mock()}
        onDelete={mock()}
        onDuplicate={mock()}
        onSubmit={mock()}
        setDraft={mock()}
      />,
    );

    const titleField = screen.getByPlaceholderText("Title");
    fireEvent.pointerDown(titleField);
    const eventResult = dispatchArrowDown(titleField);

    expect(eventResult.defaultPrevented).toBe(false);
  });

  it("submits a typed draft title when Enter is pressed", async () => {
    const user = userEvent.setup();
    const onSubmit = mock();

    function Harness() {
      const [draft, setDraftState] = useState<GridEventDraft>(
        createNewDraft({ title: "" }),
      );
      const setDraftFromForm = (
        nextDraft: SetStateAction<GridEventDraft | null>,
      ) => {
        setDraftState((currentDraft) => {
          const resolvedDraft =
            typeof nextDraft === "function"
              ? nextDraft(currentDraft)
              : nextDraft;

          return resolvedDraft ?? currentDraft;
        });
      };

      return (
        <EventForm
          draft={draft}
          isDraft={true}
          isExistingEvent={false}
          onClose={mock()}
          onDelete={mock()}
          onDuplicate={mock()}
          onSubmit={onSubmit}
          setDraft={setDraftFromForm}
        />
      );
    }

    renderWithStore(<Harness />);

    const titleField = screen.getByPlaceholderText("Title");
    act(() => titleField.focus());

    await user.type(titleField, "Plan");
    await user.keyboard("{Enter}");

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({ title: "Plan" }),
      }),
    );
  });

  it("does not submit an existing event title with plain Enter", async () => {
    const user = userEvent.setup();
    const onSubmit = mock();

    renderWithStore(
      <EventForm
        draft={createEditDraft()}
        isDraft={true}
        isExistingEvent={true}
        onClose={mock()}
        onDelete={mock()}
        onDuplicate={mock()}
        onSubmit={onSubmit}
        setDraft={mock()}
      />,
    );

    const titleField = screen.getByPlaceholderText("Title");
    act(() => titleField.focus());

    await user.keyboard("{Enter}");

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not submit a draft when Enter is pressed outside the title field", async () => {
    const user = userEvent.setup();
    const onSubmit = mock();

    renderWithStore(
      <>
        <button type="button">Draft block</button>
        <EventForm
          draft={createEditDraft()}
          isDraft={true}
          isExistingEvent={false}
          onClose={mock()}
          onDelete={mock()}
          onDuplicate={mock()}
          onSubmit={onSubmit}
          setDraft={mock()}
        />
      </>,
    );

    await user.click(screen.getByRole("button", { name: "Draft block" }));

    await user.keyboard("{Enter}");

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("hydrates an occurrence's recurrence from its cached series base, and keeps it preserved through a title edit", async () => {
    const user = userEvent.setup();
    const onSubmit = mock();
    const seriesId = "0123456789abcdef11111111" as EventId;
    const seriesRules = ["RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE"];
    const seriesBase = createMockEvent({
      id: seriesId,
      content: { kind: "details", title: "Standup", description: "" },
      schedule: EventScheduleSchema.parse({
        kind: "timed",
        start: "2026-04-20T14:00:00.000Z",
        end: "2026-04-20T15:00:00.000Z",
        timeZone: "UTC",
      }),
      recurrence: { kind: "series", rules: seriesRules },
    });
    const occurrence = createMockEvent({
      content: { kind: "details", title: "Standup", description: "" },
      schedule: EventScheduleSchema.parse({
        kind: "timed",
        start: "2026-04-27T14:00:00.000Z",
        end: "2026-04-27T15:00:00.000Z",
        timeZone: "UTC",
      }),
      recurrence: { kind: "occurrence", seriesId },
    });
    const draft = editGridEventDraft(occurrence);
    if (!draft) throw new Error("expected an edit draft");

    const { queryClient, wrapper } = createStoreWrapper();
    // useEventById reads the cache synchronously on mount - the base must be
    // present before the first render, not seeded after (setQueryDefaults'
    // `initialData`, which seedEventQueries relies on, never materializes
    // without a mounted query for that exact key).
    queryClient.setQueryData(
      eventQueryKeys.week({
        source: "local",
        start: "2026-04-20T00:00:00.000Z",
        end: "2026-04-27T00:00:00.000Z",
      }),
      toNormalizedEventQueryData([seriesBase]),
    );

    function Harness() {
      const [currentDraft, setDraft] = useState<GridEventDraft | null>(draft);
      if (!currentDraft) return null;

      return (
        <EventForm
          draft={currentDraft}
          isDraft={false}
          isExistingEvent={true}
          onClose={mock()}
          onDelete={mock()}
          onDuplicate={mock()}
          onSubmit={onSubmit}
          setDraft={setDraft}
        />
      );
    }

    render(<Harness />, { wrapper });

    // The occurrence's own recurrence pointer carries no rule - this only
    // passes once EventForm resolves the series base and threads its rules
    // through, which is what lets RecurrenceSection auto-expand with the
    // real rule instead of reading the event as non-recurring.
    expect(
      capturedRecurrenceSectionProps?.draft.values.recurrence,
    ).toMatchObject({
      kind: "preserve",
    });
    expect(capturedRecurrenceSectionProps?.seriesRules).toEqual(seriesRules);

    const titleField = screen.getByPlaceholderText("Title");
    await user.clear(titleField);
    await user.type(titleField, "Standup (moved)");
    await user.click(screen.getByRole("button", { name: "Save" }));

    // A field edit that never touches recurrence must not flip the draft
    // from "preserve" to an explicit series conversion - the adapter's
    // no-op guard compares the hydrated rule against what the patch echoes
    // back, since every field patch spreads the whole projected event.
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({
          title: "Standup (moved)",
          recurrence: { kind: "preserve" },
        }),
      }),
    );
  });

  it("wires field errors to controls with aria-invalid and describedby", () => {
    renderWithStore(
      <EventForm
        draft={createEditDraft({ title: "" })}
        fieldErrors={{
          "content.title": "Title is required",
          end: "End must be after start",
        }}
        isDraft={false}
        isExistingEvent={true}
        onClose={mock()}
        onDelete={mock()}
        onDuplicate={mock()}
        onSubmit={mock()}
        setDraft={mock()}
      />,
    );

    const title = screen.getByRole("textbox", { name: "Title" });
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(title).toHaveAttribute(
      "aria-describedby",
      "event-form-error-content-title",
    );

    const schedule = screen.getByRole("group", { name: "Event schedule" });
    expect(schedule).toHaveAttribute("aria-invalid", "true");
    expect(schedule).toHaveAttribute(
      "aria-describedby",
      "event-form-error-end",
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Title is required");
    expect(screen.getByText("Title is required")).toBeInTheDocument();
    // Title is first in DOM order, so it receives focus when both fields fail.
    expect(title).toHaveFocus();
  });

  it("names the description field for assistive tech", () => {
    renderWithStore(
      <EventForm
        draft={createEditDraft({ description: "Notes" })}
        isDraft={false}
        isExistingEvent={true}
        onClose={mock()}
        onDelete={mock()}
        onDuplicate={mock()}
        onSubmit={mock()}
        setDraft={mock()}
      />,
    );

    // A contenteditable rich-text region, not a native input/textarea, so
    // jest-dom's value-based matcher doesn't apply - assert on rendered text.
    expect(
      screen.getByRole("textbox", { name: "Description" }).textContent,
    ).toBe("Notes");
  });

  describe("event details (meeting link, location, attendees)", () => {
    it("shows a meeting link that opens in a new tab", () => {
      renderWithStore(
        <EventForm
          draft={createEditDraft({
            conference: {
              url: "https://meet.google.com/abc-defg-hij",
              label: "Google Meet",
            },
          })}
          isDraft={false}
          isExistingEvent={true}
          onClose={mock()}
          onDelete={mock()}
          onDuplicate={mock()}
          onSubmit={mock()}
          setDraft={mock()}
        />,
      );

      const link = screen.getByRole("link", { name: "Google Meet" });
      expect(link).toHaveAttribute(
        "href",
        "https://meet.google.com/abc-defg-hij",
      );
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("shows an editable location field with a link to Google Maps", () => {
      renderWithStore(
        <EventForm
          draft={createEditDraft({ location: "200 Main St, Anytown" })}
          isDraft={false}
          isExistingEvent={true}
          onClose={mock()}
          onDelete={mock()}
          onDuplicate={mock()}
          onSubmit={mock()}
          setDraft={mock()}
        />,
      );

      expect(screen.getByRole("textbox", { name: "Location" })).toHaveValue(
        "200 Main St, Anytown",
      );

      const link = screen.getByRole("link", { name: "Open in Google Maps" });
      expect(link).toHaveAttribute(
        "href",
        "https://www.google.com/maps/search/?api=1&query=200%20Main%20St%2C%20Anytown",
      );
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("updates the draft location as the user types and shows the Maps link once populated", async () => {
      const user = userEvent.setup();

      function Harness() {
        const [draft, setDraftState] = useState<GridEventDraft>(
          createEditDraft({ location: "" }),
        );
        const setDraftFromForm = (
          nextDraft: SetStateAction<GridEventDraft | null>,
        ) => {
          setDraftState((currentDraft) => {
            const resolvedDraft =
              typeof nextDraft === "function"
                ? nextDraft(currentDraft)
                : nextDraft;

            return resolvedDraft ?? currentDraft;
          });
        };

        return (
          <EventForm
            draft={draft}
            isDraft={false}
            isExistingEvent={true}
            onClose={mock()}
            onDelete={mock()}
            onDuplicate={mock()}
            onSubmit={mock()}
            setDraft={setDraftFromForm}
          />
        );
      }

      renderWithStore(<Harness />);

      expect(
        screen.queryByRole("link", { name: "Open in Google Maps" }),
      ).not.toBeInTheDocument();

      const locationField = screen.getByRole("textbox", { name: "Location" });
      await user.type(locationField, "200 Main St");

      expect(locationField).toHaveValue("200 Main St");
      expect(
        screen.getByRole("link", { name: "Open in Google Maps" }),
      ).toHaveAttribute(
        "href",
        "https://www.google.com/maps/search/?api=1&query=200%20Main%20St",
      );
    });

    it("shows attendees with RSVP status and marks the organizer", () => {
      renderWithStore(
        <EventForm
          draft={createEditDraft({
            organizer: { email: "lead@example.com", displayName: "Team Lead" },
            attendees: [
              {
                email: "lead@example.com",
                displayName: "Team Lead",
                responseStatus: "accepted",
              },
              {
                email: "guest@example.com",
                displayName: null,
                responseStatus: "declined",
              },
            ],
          })}
          isDraft={false}
          isExistingEvent={true}
          onClose={mock()}
          onDelete={mock()}
          onDuplicate={mock()}
          onSubmit={mock()}
          setDraft={mock()}
        />,
      );

      expect(
        screen.getByText("2 guests (1 yes, 0 awaiting, 1 no)"),
      ).toBeInTheDocument();
      expect(screen.getByText("Team Lead (organizer)")).toBeInTheDocument();
      expect(screen.getByText("guest@example.com")).toBeInTheDocument();

      // RSVP status is otherwise a color+icon badge - each row needs an
      // accessible name carrying the same status text for screen readers.
      expect(
        screen.getByLabelText("Team Lead, yes, organizer"),
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText("guest@example.com, no"),
      ).toBeInTheDocument();
    });

    it("renders an empty, link-less location field and no attendees/conference section when the event has none of them", () => {
      renderWithStore(
        <EventForm
          draft={createEditDraft()}
          isDraft={false}
          isExistingEvent={true}
          onClose={mock()}
          onDelete={mock()}
          onDuplicate={mock()}
          onSubmit={mock()}
          setDraft={mock()}
        />,
      );

      expect(screen.getByRole("textbox", { name: "Location" })).toHaveValue("");
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(screen.queryByText(/guest/)).not.toBeInTheDocument();
    });
  });
});
