import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { createMockCalendar } from "@web/__tests__/utils/factories/calendar.factory";
import * as Track from "@web/auth/posthog/track";
import { useCalendarDigitPick } from "./useCalendarDigitPick";
import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

const calendars = [
  createMockCalendar({ name: "Work" }),
  createMockCalendar({ name: "Home" }),
];

function DigitPickHarness({ onPick }: { onPick: (name: string) => void }) {
  const { sectionProps } = useCalendarDigitPick({
    calendars,
    onPick: (calendar) => onPick(calendar.name),
  });
  return <fieldset aria-label="Calendars" {...sectionProps} />;
}

describe("useCalendarDigitPick", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("picks the calendar at the pressed digit's index", () => {
    const onPick = mock();
    render(<DigitPickHarness onPick={onPick} />);

    fireEvent.keyDown(screen.getByRole("group"), {
      key: "1",
      code: "Digit1",
    });

    expect(onPick).toHaveBeenCalledWith("Work");
  });

  it("records focus-calendar-digit when a digit picks a calendar", () => {
    const track = spyOn(Track, "track");
    render(<DigitPickHarness onPick={mock()} />);

    fireEvent.keyDown(screen.getByRole("group"), {
      key: "2",
      code: "Digit2",
    });

    const recorded = track.mock.calls.filter(
      ([name, props]) =>
        name === "shortcut_invoked" &&
        (props as { shortcut_id?: string }).shortcut_id ===
          "focus-calendar-digit",
    );
    expect(recorded).toHaveLength(1);
    track.mockRestore();
  });

  it("does not record when the digit has no matching calendar", () => {
    const track = spyOn(Track, "track");
    render(<DigitPickHarness onPick={mock()} />);

    fireEvent.keyDown(screen.getByRole("group"), {
      key: "9",
      code: "Digit9",
    });

    expect(
      track.mock.calls.filter(([name]) => name === "shortcut_invoked"),
    ).toHaveLength(0);
    track.mockRestore();
  });
});
