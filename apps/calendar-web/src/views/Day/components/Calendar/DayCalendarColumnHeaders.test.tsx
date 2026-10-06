import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getCalendarCapabilities } from "@core/types/calendar.contracts";
import { createMockCalendar } from "@web/__tests__/utils/factories/calendar.factory";
import { PAGE_JUMP_ATTRIBUTE } from "@web/shortcuts/page-jump/page-jump.targets";
import { getEffectiveTimeZone } from "@web/timezone/effective-timezone.store";
import { formatTimeZoneAbbreviation } from "@web/timezone/format-timezone-abbreviation";
import { DayCalendarColumnHeaders } from "@web/views/Day/components/Calendar/DayCalendarColumnHeaders";
import { CALENDAR_COLUMN_ID_ATTRIBUTE } from "@web/views/Day/components/Calendar/dayCalendarColumnFocus.util";
import { afterEach, describe, expect, it, mock } from "bun:test";

const personal = createMockCalendar({ name: "Personal" });
const holidays = createMockCalendar({
  name: "Holidays",
  access: "reader",
  capabilities: getCalendarCapabilities("reader"),
});

describe("DayCalendarColumnHeaders", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the effective timezone in the grid corner", () => {
    render(<DayCalendarColumnHeaders calendars={[personal]} />);

    const abbreviation = formatTimeZoneAbbreviation(getEffectiveTimeZone());
    expect(
      screen.getByRole("button", {
        name: `Calendar timezone: ${abbreviation}`,
      }),
    ).toHaveTextContent(abbreviation);
    expect(screen.getByLabelText("Personal")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Calendars" })).toHaveTextContent(
      "Personal",
    );
  });

  it("still shows the timezone when there are no calendars", () => {
    render(<DayCalendarColumnHeaders calendars={[]} />);

    const abbreviation = formatTimeZoneAbbreviation(getEffectiveTimeZone());
    expect(
      screen.getByRole("button", {
        name: `Calendar timezone: ${abbreviation}`,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Calendars" }),
    ).not.toBeInTheDocument();
  });

  it("makes every displayed calendar a focusable jump target", () => {
    render(
      <DayCalendarColumnHeaders
        calendars={[personal, holidays]}
        pageJumpDigitByCalendarId={
          new Map([
            [personal.id, "2"],
            [holidays.id, "3"],
          ])
        }
      />,
    );

    for (const calendar of [personal, holidays]) {
      const column = screen.getByRole("button", {
        name: `Focus ${calendar.name} column`,
      });
      expect(column).toHaveAttribute(
        PAGE_JUMP_ATTRIBUTE,
        `day-column:${calendar.id}`,
      );
      expect(column).toHaveAttribute(CALENDAR_COLUMN_ID_ATTRIBUTE, calendar.id);
      expect(column).toHaveClass("w-full");
    }
  });

  it("shows the full calendar name in a tooltip on hover", async () => {
    const user = userEvent.setup();
    render(
      <DayCalendarColumnHeaders
        calendars={[
          createMockCalendar({
            name: "Holidays in United States",
          }),
        ]}
      />,
    );

    await user.hover(
      screen.getByRole("button", {
        name: "Focus Holidays in United States column",
      }),
    );

    expect(
      await screen.findByRole("tooltip", {
        name: "Holidays in United States",
      }),
    ).toBeInTheDocument();
  });

  it("reports focus changes for full-column highlight", () => {
    const onColumnFocusChange = mock();
    render(
      <DayCalendarColumnHeaders
        calendars={[personal]}
        onColumnFocusChange={onColumnFocusChange}
      />,
    );

    screen.getByRole("button", { name: "Focus Personal column" }).focus();

    expect(onColumnFocusChange).toHaveBeenCalledWith(personal.id);
  });
});
