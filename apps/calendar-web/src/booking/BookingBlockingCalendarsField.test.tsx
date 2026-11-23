import "@testing-library/jest-dom";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMockCalendar,
  createMockConnection,
} from "@web/__tests__/utils/factories/calendar.factory";
import { BookingBlockingCalendarsField } from "@web/booking/BookingBlockingCalendarsField";
import { BOOKING_BLOCKING_CALENDARS_COLLAPSE_THRESHOLD } from "@web/booking/booking-blocking-calendars.constants";
import { describe, expect, it, mock } from "bun:test";

const hostConnection = createMockConnection("host@example.com");

function calendarsForAccount(count: number, email = "host@example.com") {
  return Array.from({ length: count }, (_, index) =>
    createMockCalendar({
      name: `Calendar ${index + 1}`,
      accountEmail: email,
    }),
  );
}

describe("BookingBlockingCalendarsField", () => {
  it("collapses large account groups by default and expands on header activation", async () => {
    const user = userEvent.setup({ delay: null });
    const calendars = calendarsForAccount(
      BOOKING_BLOCKING_CALENDARS_COLLAPSE_THRESHOLD + 1,
    );
    const onToggle = mock(() => {});

    render(
      <BookingBlockingCalendarsField
        unavailableCalendars={[]}
        availabilityCalendars={calendars}
        blockingCalendarIds={[]}
        connections={[hostConnection]}
        onToggle={onToggle}
      />,
    );

    const header = screen.getByRole("button", {
      name: `host@example.com (Google), 0 of ${calendars.length} blocking`,
    });
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(header.getAttribute("aria-controls")).toBeNull();
    expect(
      screen.queryByRole("checkbox", { name: "Calendar 1" }),
    ).not.toBeInTheDocument();

    await user.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("checkbox", { name: "Calendar 1" }),
    ).toBeInTheDocument();

    await user.keyboard("{Enter}");
    expect(header).toHaveAttribute("aria-expanded", "false");
  });

  it("lets a host remove a selected calendar that disappeared from the catalog", async () => {
    const retired = createMockCalendar({ name: "Retired calendar" });
    const onToggle = mock(() => {});
    render(
      <BookingBlockingCalendarsField
        availabilityCalendars={[]}
        unavailableCalendars={[retired]}
        blockingCalendarIds={[retired.id]}
        connections={[]}
        onToggle={onToggle}
      />,
    );
    const checkbox = screen.getByRole("checkbox", { name: "Retired calendar" });
    expect(checkbox).toBeChecked();
    await userEvent.setup().click(checkbox);
    expect(onToggle).toHaveBeenCalledWith(retired.id, false);
  });

  it("keeps a single account with few calendars flat without a group header", () => {
    const calendars = calendarsForAccount(2);
    render(
      <BookingBlockingCalendarsField
        unavailableCalendars={[]}
        availabilityCalendars={calendars}
        blockingCalendarIds={[calendars[0]!.id]}
        connections={[hostConnection]}
        onToggle={mock(() => {})}
      />,
    );

    const blocking = screen.getByRole("group", { name: "Blocking calendars" });
    expect(
      within(blocking).queryByRole("button", { name: /blocking$/ }),
    ).toBeNull();
    expect(
      within(blocking).getByRole("checkbox", { name: "Calendar 1" }),
    ).toBeChecked();
  });
});
