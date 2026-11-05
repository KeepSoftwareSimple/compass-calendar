import { render, screen } from "@testing-library/react";
import { TIMED_HOUR_SLOT_HEIGHT_CLASS } from "@web/grid/grid.constants";
import { describe, expect, it } from "bun:test";
import "@testing-library/jest-dom";
import { HourLabelColumn } from "./HourLabelColumn";

describe("HourLabelColumn", () => {
  it("hides a colliding hour label without removing it from layout", () => {
    render(
      <HourLabelColumn
        hiddenHourIndex={1}
        labels={["9 AM", "10 AM", "11 AM"]}
        width={50}
      />,
    );

    expect(screen.getByText("10 AM")).toHaveAttribute(
      "data-hour-label-hidden",
      "true",
    );
    expect(screen.getByText("10 AM")).toHaveStyle({ opacity: "0" });
    expect(screen.getByText("9 AM")).not.toHaveAttribute(
      "data-hour-label-hidden",
    );
  });

  it("sizes each slot as one visible hour without flex-shrinking the stack", () => {
    render(<HourLabelColumn labels={["1 AM", "2 AM", "11 PM"]} width={50} />);

    const firstSlot = screen.getByText("1 AM").parentElement;
    const column = firstSlot?.parentElement;

    expect(firstSlot).toHaveClass(TIMED_HOUR_SLOT_HEIGHT_CLASS);
    expect(screen.getByText("11 PM").parentElement).toHaveClass(
      TIMED_HOUR_SLOT_HEIGHT_CLASS,
    );
    expect(column).not.toHaveClass("flex");
    expect(column).not.toHaveClass("flex-col");
    expect(column?.className).not.toContain("translate-y");
  });
});
