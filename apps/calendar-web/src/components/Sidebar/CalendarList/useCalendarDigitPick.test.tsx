import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import userEvent from "@testing-library/user-event";
import { type ReactNode } from "react";
import dayjs from "@core/util/date/dayjs";
import { createMockCalendar } from "@web/__tests__/utils/factories/calendar.factory";
import * as Track from "@web/auth/posthog/track";
import {
  eventJumpActions,
  useEventJumpStore,
} from "@web/shortcuts/shift-hint/event-jump.store";
import { useShiftHoldEventHints } from "@web/shortcuts/shift-hint/useShiftHoldEventHints";
import { useCalendarDigitPick } from "./useCalendarDigitPick";
import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

const calendars = [
  createMockCalendar({ name: "Work" }),
  createMockCalendar({ name: "Home" }),
];

function DigitPickHarness({
  children,
  onPick,
}: {
  children?: ReactNode;
  onPick: (name: string) => void;
}) {
  const { sectionProps } = useCalendarDigitPick({
    calendars,
    onPick: (calendar) => onPick(calendar.name),
  });
  return (
    <fieldset aria-label="Calendars" {...sectionProps}>
      {children}
    </fieldset>
  );
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

describe("useCalendarDigitPick with the grid's typed-time listener mounted", () => {
  afterEach(() => {
    cleanup();
    eventJumpActions.reset();
  });

  it("toggles the calendar instead of buffering a typed time", async () => {
    const user = userEvent.setup();
    const onPick = mock();
    const createAtTime = mock();
    renderHook(() =>
      useShiftHoldEventHints({
        createAtTime,
        focus: () => {},
        getQuickTimeDay: () => dayjs("2026-08-05"),
        listVisible: () => [],
        timedEvents: [],
        visibleDays: [dayjs("2026-08-05")],
      }),
    );
    render(
      <DigitPickHarness onPick={onPick}>
        <button type="button">tyler@example.com</button>
      </DigitPickHarness>,
    );

    act(() => {
      screen.getByRole("button", { name: "tyler@example.com" }).focus();
    });
    await user.keyboard("1");

    expect(onPick).toHaveBeenCalledWith("Work");
    expect(useEventJumpStore.getState().quickTimeDigits).toBe("");
    expect(createAtTime).not.toHaveBeenCalled();
  });
});
