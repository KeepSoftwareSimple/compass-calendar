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
import { beforeEach, describe, expect, it, mock } from "bun:test";

function verticalCenter(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  return rect.top + rect.height / 2;
}

function textStartX(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return (
    rect.left +
    Number.parseFloat(style.paddingLeft) +
    Number.parseFloat(style.textIndent || "0") +
    Number.parseFloat(style.marginLeft || "0")
  );
}

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

  it("lines up guest placeholder with location text and icon centers", () => {
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
    const guestsCombobox = screen.getByRole("combobox", { name: "Guests" });
    const guestRoot = guestsCombobox.closest(".c-attendee-field");
    expect(guestRoot).toBeTruthy();
    const placeholder = guestRoot!.querySelector(
      ".attendee-field__placeholder",
    );
    expect(placeholder).toBeTruthy();

    const placeholderStyle = getComputedStyle(placeholder as HTMLElement);
    expect(placeholderStyle.marginLeft).toBe("0px");
    expect(placeholderStyle.marginRight).toBe("0px");
    expect(placeholderStyle.paddingLeft).toBe("0px");
    expect(["20px", "1.25rem"]).toContain(placeholderStyle.lineHeight);

    const valueContainer = guestRoot!.querySelector(
      ".attendee-field__value-container",
    );
    expect(getComputedStyle(valueContainer as HTMLElement).paddingLeft).toBe(
      "0px",
    );

    const iconRows = container.querySelectorAll(".flex.min-h-8.items-start");
    expect(iconRows.length).toBeGreaterThanOrEqual(2);
    const locationRow = locationInput.closest(".flex.min-h-8");
    const guestsRow = guestsCombobox.closest(".flex.min-h-8");
    expect(locationRow).toBeTruthy();
    expect(guestsRow).toBeTruthy();

    const sharedLeft = 64;
    const sharedLineCenter = 12;
    locationInput.getBoundingClientRect = () =>
      ({
        left: sharedLeft,
        top: sharedLineCenter - 10,
        right: sharedLeft + 200,
        bottom: sharedLineCenter + 10,
        width: 200,
        height: 20,
        x: sharedLeft,
        y: sharedLineCenter - 10,
        toJSON: () => ({}),
      }) as DOMRect;
    (placeholder as HTMLElement).getBoundingClientRect = () =>
      ({
        left: sharedLeft,
        top: sharedLineCenter - 10,
        right: sharedLeft + 80,
        bottom: sharedLineCenter + 10,
        width: 80,
        height: 20,
        x: sharedLeft,
        y: sharedLineCenter - 10,
        toJSON: () => ({}),
      }) as DOMRect;

    const locationIcon = (locationRow as HTMLElement).querySelector(
      "span.w-4 svg",
    );
    const guestsIcon = (guestsRow as HTMLElement).querySelector("span.w-4 svg");
    expect(locationIcon).toBeTruthy();
    expect(guestsIcon).toBeTruthy();
    (locationIcon as SVGElement).getBoundingClientRect = () =>
      ({
        left: 40,
        top: sharedLineCenter - 8,
        right: 56,
        bottom: sharedLineCenter + 8,
        width: 16,
        height: 16,
        x: 40,
        y: sharedLineCenter - 8,
        toJSON: () => ({}),
      }) as DOMRect;
    (guestsIcon as SVGElement).getBoundingClientRect = () =>
      ({
        left: 40,
        top: sharedLineCenter - 8,
        right: 56,
        bottom: sharedLineCenter + 8,
        width: 16,
        height: 16,
        x: 40,
        y: sharedLineCenter - 8,
        toJSON: () => ({}),
      }) as DOMRect;

    expect(
      Math.abs(
        textStartX(locationInput) - textStartX(placeholder as HTMLElement),
      ),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(
        verticalCenter(locationIcon) -
          verticalCenter(placeholder as HTMLElement),
      ),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(
        verticalCenter(guestsIcon) - verticalCenter(placeholder as HTMLElement),
      ),
    ).toBeLessThanOrEqual(1);
  });
});
