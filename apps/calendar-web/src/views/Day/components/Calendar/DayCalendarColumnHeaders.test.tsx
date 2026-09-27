import { cleanup, render, screen } from "@testing-library/react";
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

  it("makes writable calendars focusable jump targets", () => {
    render(
      <DayCalendarColumnHeaders
        calendars={[personal, holidays]}
        writableCalendarIds={new Set([personal.id])}
      />,
    );

    const column = screen.getByRole("button", {
      name: "Focus Personal column",
    });
    expect(column).toHaveAttribute(
      PAGE_JUMP_ATTRIBUTE,
      `day-column:${personal.id}`,
    );
    expect(column).toHaveAttribute(CALENDAR_COLUMN_ID_ATTRIBUTE, personal.id);
    expect(column).toHaveClass("w-full");
    expect(
      screen.queryByRole("button", { name: "Focus Holidays column" }),
    ).toBeNull();
    expect(screen.getByRole("region", { name: "Calendars" })).toHaveTextContent(
      "Holidays",
    );
  });

  it("reports focus changes for full-column highlight", () => {
    const onColumnFocusChange = mock();
    render(
      <DayCalendarColumnHeaders
        calendars={[personal]}
        onColumnFocusChange={onColumnFocusChange}
        writableCalendarIds={new Set([personal.id])}
      />,
    );

    screen.getByRole("button", { name: "Focus Personal column" }).focus();

    expect(onColumnFocusChange).toHaveBeenCalledWith(personal.id);
  });
});
