import { describe, expect, it, mock } from "bun:test";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MonthNavButton } from "./MonthNavButton";

describe("MonthNavButton", () => {
  it("opts into the shared c-focus-ring utility so keyboard focus is visible", () => {
    render(
      <MonthNavButton
        ariaLabel="Previous month"
        color="#fff"
        onClick={() => {}}
      >
        <span>‹</span>
      </MonthNavButton>,
    );

    // The month-nav chevrons are the first tab stop the "u" shortcut can land
    // on; without the ring they gave no focus feedback (the reported bug).
    expect(screen.getByRole("button", { name: "Previous month" })).toHaveClass(
      "c-focus-ring",
    );
  });

  it("is a real button that fires onClick from the keyboard", async () => {
    const user = userEvent.setup();
    const onClick = mock(() => {});
    render(
      <MonthNavButton ariaLabel="Next month" color="#fff" onClick={onClick}>
        <span>›</span>
      </MonthNavButton>,
    );

    screen.getByRole("button", { name: "Next month" }).focus();
    await user.keyboard("{Enter}");

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
