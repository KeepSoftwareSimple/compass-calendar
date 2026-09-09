import "@testing-library/jest-dom";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import {
  DEFAULT_WEEKLY_AVAILABILITY,
  type WeeklyAvailability,
} from "@core/types/booking.contracts";
import { BookingWeeklyHoursEditor } from "@web/booking/BookingWeeklyHoursEditor";
import { afterEach, describe, expect, it, mock } from "bun:test";

afterEach(() => {
  document.body.replaceChildren();
});

const renderEditor = (
  value: WeeklyAvailability = DEFAULT_WEEKLY_AVAILABILITY,
  describedBy?: string,
) => {
  const onChange = mock((_next: WeeklyAvailability) => {});
  render(
    <BookingWeeklyHoursEditor
      describedBy={describedBy}
      onChange={onChange}
      value={value}
    />,
  );
  return onChange;
};

const lastCall = (onChange: ReturnType<typeof renderEditor>) =>
  onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];

const renderStatefulEditor = (
  initial: WeeklyAvailability = DEFAULT_WEEKLY_AVAILABILITY,
) => {
  const onChange = mock((_next: WeeklyAvailability) => {});
  function Harness() {
    const [value, setValue] = useState(initial);
    return (
      <BookingWeeklyHoursEditor
        describedBy="booking-hours-timezone"
        onChange={(next) => {
          onChange(next);
          setValue(next);
        }}
        value={value}
      />
    );
  }
  render(<Harness />);
  return onChange;
};

const mondayStart = () =>
  screen.getByRole("combobox", { name: "Monday start" });
const mondayEnd = () => screen.getByRole("combobox", { name: "Monday end" });
const dayCheckbox = (name: string) => screen.getByRole("checkbox", { name });

describe("BookingWeeklyHoursEditor", () => {
  it("renders Monday to Friday checked with 9:00 AM to 5:00 PM and weekend unchecked", () => {
    renderEditor(DEFAULT_WEEKLY_AVAILABILITY, "booking-hours-timezone");

    expect(mondayStart()).toHaveDisplayValue("9:00 AM");
    expect(mondayEnd()).toHaveDisplayValue("5:00 PM");
    for (const name of [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
    ]) {
      expect(dayCheckbox(name)).toBeChecked();
    }
    expect(dayCheckbox("Saturday")).not.toBeChecked();
    expect(dayCheckbox("Sunday")).not.toBeChecked();
    expect(
      screen.queryByRole("combobox", { name: "Saturday start" }),
    ).toBeNull();
    expect(screen.queryByText(/Unavailable/)).not.toBeInTheDocument();
    expect(mondayStart()).toHaveAttribute(
      "aria-describedby",
      "booking-hours-timezone",
    );
    expect(mondayEnd()).toHaveAttribute(
      "aria-describedby",
      "booking-hours-timezone",
    );
  });

  it("checking Saturday emits a 09:00 to 17:00 interval for weekday 6", async () => {
    const user = userEvent.setup({ delay: null });
    const onChange = renderEditor();

    await user.click(dayCheckbox("Saturday"));

    expect(lastCall(onChange)?.filter((entry) => entry.weekday === 6)).toEqual([
      { weekday: 6, start: "09:00", end: "17:00" },
    ]);
  });

  it("unchecking Monday emits an array without weekday 1", async () => {
    const user = userEvent.setup({ delay: null });
    const onChange = renderEditor();

    await user.click(dayCheckbox("Monday"));

    expect(lastCall(onChange)?.some((entry) => entry.weekday === 1)).toBe(
      false,
    );
  });

  it("Add hours to Tuesday emits two intervals and focuses Tuesday start 2", async () => {
    const user = userEvent.setup({ delay: null });
    const onChange = renderStatefulEditor();

    await user.click(
      screen.getByRole("button", { name: "Add hours to Tuesday" }),
    );

    expect(lastCall(onChange)?.filter((entry) => entry.weekday === 2)).toEqual([
      { weekday: 2, start: "09:00", end: "17:00" },
      { weekday: 2, start: "18:00", end: "19:00" },
    ]);
    const secondStart = screen.getByRole("combobox", {
      name: "Tuesday start 2",
    });
    expect(secondStart).toHaveAttribute(
      "aria-describedby",
      "booking-hours-timezone",
    );
    expect(secondStart).toHaveFocus();
  });

  it("renders Tuesday start 2 and the minus button removes it and focuses Tuesday start", async () => {
    const user = userEvent.setup({ delay: null });
    const twoBlocks: WeeklyAvailability = [
      ...DEFAULT_WEEKLY_AVAILABILITY.filter((entry) => entry.weekday !== 2),
      { weekday: 2, start: "09:00", end: "17:00" },
      { weekday: 2, start: "18:00", end: "19:00" },
    ];
    const onChange = renderStatefulEditor(twoBlocks);

    expect(
      screen.getByRole("combobox", { name: "Tuesday start 2" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "Remove Tuesday 6:00 PM to 7:00 PM",
      }),
    );
    expect(lastCall(onChange)?.filter((entry) => entry.weekday === 2)).toEqual([
      { weekday: 2, start: "09:00", end: "17:00" },
    ]);
    expect(
      screen.getByRole("combobox", { name: "Tuesday start" }),
    ).toHaveFocus();
  });

  it("Tuesday end options never include a time at or before start, and never after Tuesday start 2", () => {
    const twoBlocks: WeeklyAvailability = [
      ...DEFAULT_WEEKLY_AVAILABILITY.filter((entry) => entry.weekday !== 2),
      { weekday: 2, start: "09:00", end: "12:00" },
      { weekday: 2, start: "13:00", end: "17:00" },
    ];
    renderEditor(twoBlocks);

    const options = within(
      screen.getByRole("combobox", { name: "Tuesday end" }),
    )
      .getAllByRole("option")
      .map((option) => (option as HTMLOptionElement).value);
    expect(options).not.toContain("09:00");
    expect(options.some((value) => value <= "09:00")).toBe(false);
    expect(options).not.toContain("13:15");
    expect(options[options.length - 1]).toBe("13:00");
  });

  it("Add hours to Monday is disabled when Monday ends at 23:00", () => {
    renderEditor([
      { weekday: 1, start: "22:00", end: "23:00" },
      ...DEFAULT_WEEKLY_AVAILABILITY.filter((entry) => entry.weekday !== 1),
    ]);

    expect(
      screen.getByRole("button", { name: "Add hours to Monday" }),
    ).toBeDisabled();
  });

  it("never shows Choose at least one day", () => {
    renderEditor([]);

    expect(
      screen.queryByText("Choose at least one day."),
    ).not.toBeInTheDocument();
  });
});
