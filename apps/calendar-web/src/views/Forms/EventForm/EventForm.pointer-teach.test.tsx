import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventScheduleSchema } from "@core/types/event.contracts";
import { renderWithStore } from "@web/__tests__/render-with-store";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as trackModule from "@web/auth/posthog/track";
import { type GridEventDraft } from "@web/events/event-draft.types";
import { editGridEventDraft } from "@web/events/grid-event-draft.adapter";
import {
  initialPointerHintState,
  usePointerHintStore,
} from "@web/shortcuts/keyboard-only/pointer-hint.store";
import { writeShortcutUsageProfile } from "@web/shortcuts/tips/shortcut-personalization.storage";
import { resetPointerIntentSessionForTests } from "@web/views/Week/pointer-intent/pointer-intent.session";
import { EventForm } from "./EventForm";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const track = mock();
mockModuleForFile("@web/auth/posthog/track", trackModule, { track });

const createEditDraft = (overrides: { location?: string | null } = {}) => {
  const event = createMockEvent({
    content: {
      kind: "details",
      title: "Keyboard duplicate event",
      description: "",
      location: overrides.location ?? null,
      organizer: null,
      attendees: [],
      conference: null,
    },
    schedule: EventScheduleSchema.parse({
      kind: "timed",
      start: "2026-04-24T14:00:00.000Z",
      end: "2026-04-24T15:00:00.000Z",
      timeZone: "UTC",
    }),
  });
  const draft = editGridEventDraft(event);
  if (!draft) throw new Error("expected an edit draft");
  return draft satisfies GridEventDraft;
};

describe("EventForm pointer field digit teach", () => {
  beforeEach(() => {
    track.mockClear();
    resetPointerIntentSessionForTests();
    writeShortcutUsageProfile({ version: 2, actions: {}, shortcuts: {} });
    usePointerHintStore.setState(initialPointerHintState, true);
  });

  afterEach(() => {
    resetPointerIntentSessionForTests();
    usePointerHintStore.setState(initialPointerHintState, true);
  });

  it("shows the location digit chip and pill when the location input is clicked", async () => {
    const user = userEvent.setup();
    renderWithStore(
      <EventForm
        draft={createEditDraft({ location: "Room 4" })}
        isDraft={false}
        isExistingEvent={true}
        onClose={mock()}
        onDelete={mock()}
        onDuplicate={mock()}
        onSubmit={mock()}
        setDraft={mock()}
      />,
    );

    const locationField = screen.getByRole("textbox", { name: "Location" });
    await user.click(locationField);

    expect(document.querySelector("[data-form-digit-hints]")).toBeTruthy();
    expect(document.body.textContent).toContain("7");
    expect(track).toHaveBeenCalledWith(
      "pointer_hint_shown",
      expect.objectContaining({ shortcut_id: "edit-jump-field-digit" }),
    );
    expect(usePointerHintStore.getState().latestAttempt?.shortcutKey).toEqual([
      "Mod",
      "7",
    ]);
  });

  it("shows nothing when tabbing into the location input", async () => {
    const user = userEvent.setup();
    renderWithStore(
      <EventForm
        draft={createEditDraft({ location: "Room 4" })}
        isDraft={false}
        isExistingEvent={true}
        onClose={mock()}
        onDelete={mock()}
        onDuplicate={mock()}
        onSubmit={mock()}
        setDraft={mock()}
      />,
    );

    await user.tab();
    await user.tab();

    expect(document.querySelector("[data-form-digit-hints]")).toBeNull();
    expect(track).not.toHaveBeenCalled();
  });
});
