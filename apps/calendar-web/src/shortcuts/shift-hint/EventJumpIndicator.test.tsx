import { render, screen } from "@testing-library/react";
import {
  EVENT_JUMP_IDLE_HINT_PARTS,
  EventJumpIndicator,
  eventJumpSelectionHintParts,
} from "@web/shortcuts/shift-hint/EventJumpIndicator";
import {
  eventJumpActions,
  initialEventJumpState,
  useEventJumpStore,
} from "@web/shortcuts/shift-hint/event-jump.store";
import { getPartsPlainText } from "@web/shortcuts/tips/shortcut-tips.data";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

const EVENT_JUMP_IDLE_HINT = getPartsPlainText(EVENT_JUMP_IDLE_HINT_PARTS);

const expectEscKeycap = () => {
  // Query the visual chip, not the sr-only sentence that also contains "Esc".
  const chip = screen.getByText("Esc");
  expect(chip.closest("[aria-hidden]")).toBeTruthy();
};

describe("EventJumpIndicator", () => {
  beforeEach(() => {
    useEventJumpStore.setState(initialEventJumpState, true);
  });

  afterEach(() => {
    useEventJumpStore.setState(initialEventJumpState, true);
  });

  it("renders Esc as a keycap while event jump is on", () => {
    eventJumpActions.setActive(true);
    render(<EventJumpIndicator />);

    expect(screen.getByRole("status")).toHaveTextContent(EVENT_JUMP_IDLE_HINT);
    expectEscKeycap();
  });

  it("keeps Esc as a keycap after a day is selected", () => {
    eventJumpActions.setActive(true);
    eventJumpActions.setActiveDayKeys(["2026-08-27"], "Thursday selected");
    render(<EventJumpIndicator />);

    expect(screen.getByRole("status")).toHaveTextContent(
      getPartsPlainText(eventJumpSelectionHintParts("Thursday selected")),
    );
    expectEscKeycap();
  });

  it("speaks the exit announcement as plain text", () => {
    eventJumpActions.setActive(true);
    eventJumpActions.setActive(false);
    render(<EventJumpIndicator />);

    expect(screen.getByRole("status")).toHaveTextContent("Event jump off");
    expect(screen.queryByText("Esc")).not.toBeInTheDocument();
  });

  it("speaks a go-to-date orientation while jump mode is off", () => {
    eventJumpActions.setActiveDayKeys(
      ["2026-10-03"],
      "Showing week of Saturday, October 3, 2026",
    );
    render(<EventJumpIndicator />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Showing week of Saturday, October 3, 2026",
    );
    expect(screen.queryByText("Esc")).not.toBeInTheDocument();
  });
});
