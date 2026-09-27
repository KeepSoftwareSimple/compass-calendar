import { render, screen } from "@testing-library/react";
import { TIMED_HOUR_SLOT_HEIGHT_CLASS } from "@web/grid/grid.constants";
import { describe, expect, it } from "bun:test";
import "@testing-library/jest-dom";
import { HourLabelColumn } from "./HourLabelColumn";

describe("HourLabelColumn", () => {
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
  });
});
