import { fireEvent, render, screen } from "@testing-library/react";
import { ProgressiveShortcutTipParts } from "@web/shortcuts/tips/ProgressiveShortcutTipParts";
import { describe, expect, it } from "bun:test";

describe("ProgressiveShortcutTipParts", () => {
  it("reveals secondary keys after More is activated", () => {
    render(
      <ProgressiveShortcutTipParts
        hintId="test-hint"
        primary={[{ keys: ["Enter"] }, " pick"]}
        secondary={[{ keys: ["PageDown"] }, " month"]}
      />,
    );

    expect(screen.getByRole("button", { name: "More" })).toBeInTheDocument();
    expect(screen.queryByTestId("pagedown-icon")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByTestId("pagedown-icon")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Less" }));
    expect(screen.queryByTestId("pagedown-icon")).toBeNull();
  });
});
