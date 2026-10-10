import "@testing-library/jest-dom";
import { HotkeyManager } from "@tanstack/react-hotkeys";
import { render, screen } from "@testing-library/react";
import {
  type Calendar,
  getCalendarCapabilities,
} from "@core/types/calendar.contracts";
import { CalendarIdSchema } from "@core/types/domain-primitives";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import { focusEventFormField } from "@web/common/utils/form/form.util";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import {
  createGridEventDraft,
  timedGridSchedule,
} from "@web/events/grid-event-draft.adapter";
import { useEditSequenceShortcut } from "@web/shortcuts/useEditSequenceShortcut";
import { EventForm } from "@web/views/Forms/EventForm/EventForm";
import { formCardFieldTextStartX } from "@web/views/Forms/EventForm/FormCardIconRow";
import { beforeEach, describe, expect, it, mock } from "bun:test";

const makeCalendar = (): Calendar => ({
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
});

function WithEditLeader({ children }: { children: React.ReactNode }) {
  useEditSequenceShortcut({ onSequence: focusEventFormField });
  return <>{children}</>;
}

const mockRect = (left: number): DOMRect =>
  ({
    left,
    top: 0,
    right: left + 120,
    bottom: 20,
    width: 120,
    height: 20,
    x: left,
    y: 0,
    toJSON: () => ({}),
  }) as DOMRect;

describe("EventForm location and meet row alignment", () => {
  beforeEach(() => {
    HotkeyManager.resetInstance();
  });

  it("starts location placeholder and Add Google Meet label at the same x", () => {
    const calendar = makeCalendar();
    const draft = createGridEventDraft(
      timedGridSchedule(
        new Date("2026-05-20T10:00:00.000Z"),
        new Date("2026-05-20T11:00:00.000Z"),
      ),
      undefined,
      calendar.id,
    );
    const { queryClient, wrapper } = createStoreWrapper();
    queryClient.setQueryData(calendarQueryKeys.all, [calendar]);

    render(
      <WithEditLeader>
        <EventForm
          draft={draft}
          isDraft
          isExistingEvent={false}
          onClose={mock()}
          onDelete={mock()}
          onDuplicate={mock()}
          onSubmit={mock()}
          setDraft={mock()}
        />
      </WithEditLeader>,
      { wrapper },
    );

    const locationInput = screen.getByRole("textbox", {
      name: "Location",
    });
    const meetLabel = screen.getByText("Add Google Meet");

    expect(locationInput.className).not.toMatch(/\bpx-2\b/);
    expect(locationInput.className).toContain("px-0");
    expect(meetLabel).toHaveClass("text-text-muted");
    expect(locationInput.className).toContain("placeholder:text-text-muted");

    const sharedLeft = 48;
    locationInput.getBoundingClientRect = () => mockRect(sharedLeft);
    meetLabel.getBoundingClientRect = () => mockRect(sharedLeft);
    locationInput.style.paddingLeft = "0";
    meetLabel.style.paddingLeft = "0";

    expect(formCardFieldTextStartX(locationInput)).toBe(
      formCardFieldTextStartX(meetLabel),
    );

    locationInput.style.paddingLeft = "8px";
    expect(formCardFieldTextStartX(locationInput)).toBe(sharedLeft + 8);
    expect(formCardFieldTextStartX(meetLabel)).toBe(sharedLeft);
  });
});
