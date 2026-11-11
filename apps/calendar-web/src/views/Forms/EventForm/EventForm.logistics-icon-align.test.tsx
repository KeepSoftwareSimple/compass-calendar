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
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import {
  createGridEventDraft,
  timedGridSchedule,
} from "@web/events/grid-event-draft.adapter";
import { EventForm } from "@web/views/Forms/EventForm/EventForm";
import { FORM_CARD_FIELD_INPUT_CLASSNAME } from "@web/views/Forms/EventForm/FormCardIconRow";
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

describe("EventForm logistics icon row alignment", () => {
  beforeEach(() => {
    HotkeyManager.resetInstance();
  });

  it("lines up guest placeholder with location field typography and icon rows", () => {
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

    const { container } = render(
      <EventForm
        draft={draft}
        isDraft
        isExistingEvent={false}
        onClose={mock()}
        onDelete={mock()}
        onDuplicate={mock()}
        onSubmit={mock()}
        setDraft={mock()}
      />,
      { wrapper },
    );

    const locationInput = screen.getByRole("textbox", { name: "Location" });
    expect(locationInput).toHaveClass(
      ...FORM_CARD_FIELD_INPUT_CLASSNAME.split(" ").filter(Boolean),
    );

    const guestsCombobox = screen.getByRole("combobox", { name: "Guests" });
    const guestRoot = guestsCombobox.closest(".c-attendee-field");
    expect(guestRoot).not.toBeNull();
    if (guestRoot === null) {
      throw new Error("expected attendee field root");
    }
    const placeholder = guestRoot.querySelector(".attendee-field__placeholder");
    expect(placeholder).not.toBeNull();
    if (placeholder === null) {
      throw new Error("expected guest placeholder node");
    }

    const placeholderStyle = getComputedStyle(placeholder);
    expect(placeholderStyle.marginLeft).toBe("0px");
    expect(placeholderStyle.marginRight).toBe("0px");
    expect(placeholderStyle.paddingLeft).toBe("0px");
    expect(["20px", "1.25rem"]).toContain(placeholderStyle.lineHeight);

    const valueContainer = guestRoot.querySelector(
      ".attendee-field__value-container",
    );
    expect(valueContainer).not.toBeNull();
    if (valueContainer === null) {
      throw new Error("expected guest value container node");
    }
    expect(getComputedStyle(valueContainer).paddingLeft).toBe("0px");

    const iconRows = container.querySelectorAll(".flex.min-h-8.items-start");
    expect(iconRows.length).toBeGreaterThanOrEqual(2);

    const locationRow = locationInput.closest(".flex.min-h-8");
    const guestsRow = guestsCombobox.closest(".flex.min-h-8");
    expect(locationRow).not.toBeNull();
    expect(guestsRow).not.toBeNull();
    if (locationRow === null || guestsRow === null) {
      throw new Error("expected location and guest icon rows");
    }

    expect(locationRow).toHaveClass("leading-5");
    expect(guestsRow).toHaveClass("leading-5");

    const locationIconColumn = locationRow.querySelector("span.w-4");
    const guestsIconColumn = guestsRow.querySelector("span.w-4");
    expect(locationIconColumn).not.toBeNull();
    expect(guestsIconColumn).not.toBeNull();
    if (locationIconColumn === null || guestsIconColumn === null) {
      throw new Error("expected logistics icon columns");
    }
    expect(locationIconColumn).toHaveClass("h-5", "leading-5");
    expect(guestsIconColumn).toHaveClass("h-5", "leading-5");

    expect(guestsRow.querySelector(".min-w-0.flex-1.items-center")).toBeNull();
  });
});
