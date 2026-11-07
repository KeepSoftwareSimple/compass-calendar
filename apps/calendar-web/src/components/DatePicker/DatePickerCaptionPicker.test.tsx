import {
  HotkeyManager,
  HotkeysProvider,
  resolveModifier,
} from "@tanstack/react-hotkeys";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act, type PropsWithChildren } from "react";
import { pressKey } from "@web/__tests__/utils/keyboard.test.util";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

process.env.PORT ??= "3000";

await import("@testing-library/jest-dom");
const { DatePicker } = await import("./DatePicker");

const wrapper = ({ children }: PropsWithChildren) => (
  <HotkeysProvider>{children}</HotkeysProvider>
);

const isMac = resolveModifier("Mod") === "Meta";
const pressGridMonthPrev = () => {
  const init = isMac
    ? { metaKey: true, altKey: true }
    : { ctrlKey: true, altKey: true };
  pressKey("j", { keyDownInit: init, keyUpInit: init });
};

beforeEach(() => {
  HotkeyManager.resetInstance();
});

afterEach(() => {
  HotkeyManager.resetInstance();
});

describe("DatePicker captionPicker", () => {
  it("steps the day grid month with Mod+Alt+J while the input is focused", async () => {
    render(
      <DatePicker
        captionPicker
        isOpen
        onCalendarClose={() => {}}
        onChange={() => {}}
        selected={new Date(2000, 0, 15)}
        view="grid"
        withTodayButton={false}
      />,
      { wrapper },
    );

    const input = document.querySelector<HTMLInputElement>(
      ".react-datepicker__input-container input",
    );
    expect(input).toBeTruthy();
    act(() => input?.focus());

    expect(screen.getByText("Jan 2000")).toBeInTheDocument();
    act(() => {
      pressGridMonthPrev();
    });

    await waitFor(() => {
      expect(screen.getByText("Dec 1999")).toBeInTheDocument();
    });
  });

  it("keeps the popover open when a year is picked with a life-style onChange", async () => {
    const user = userEvent.setup();
    let calendarOpen = true;
    const onChange = mock((date: Date | null) => {
      if (date) calendarOpen = false;
    });

    render(
      <DatePicker
        captionPicker
        isOpen={calendarOpen}
        maxDate={new Date(2026, 0, 1)}
        minDate={new Date(1900, 0, 1)}
        onCalendarClose={() => {
          calendarOpen = false;
        }}
        onChange={onChange}
        open={calendarOpen}
        selected={new Date(2000, 0, 15)}
        view="grid"
        withTodayButton={false}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Choose month and year" }),
    );
    await user.click(screen.getByText("1995"));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/Select month,/)).toBeInTheDocument();
  });

  it("opens year grid from the caption and returns to days after month pick", async () => {
    const user = userEvent.setup();
    const onChange = mock(() => {});
    const onSelect = mock(() => {});
    const maxDate = new Date(2026, 0, 1);
    const minDate = new Date(1900, 0, 1);

    render(
      <DatePicker
        captionPicker
        isOpen
        maxDate={maxDate}
        minDate={minDate}
        onCalendarClose={() => {}}
        onChange={onChange}
        onSelect={onSelect}
        open
        selected={new Date(2000, 0, 15)}
        view="grid"
        withTodayButton={false}
      />,
    );

    const captionButton = screen.getByRole("button", {
      name: "Choose month and year",
    });
    expect(captionButton.className).toMatch(/border/);

    await user.click(captionButton);

    expect(screen.getByText("Select year")).toBeInTheDocument();
    expect(screen.getByText("2000")).toBeInTheDocument();
    expect(screen.getAllByText(/^(19|20)\d{2}$/).length).toBeGreaterThanOrEqual(
      20,
    );

    await user.click(screen.getByText("1995"));

    expect(onChange).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByText("Jun")).toBeInTheDocument();

    await user.click(screen.getByText("Jun"));

    expect(onChange).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByText("15")).toBeInTheDocument();

    fireEvent.click(screen.getByText("15"));
    expect(onSelect).toHaveBeenCalled();
  });
});
