import "@testing-library/jest-dom";
import { cleanup, render, screen } from "@testing-library/react";
import { StableLabel } from "@web/components/StableLabel/StableLabel";
import { afterEach, describe, expect, it } from "bun:test";

afterEach(() => {
  cleanup();
});

describe("StableLabel", () => {
  it("names the button by the current label only", () => {
    render(
      <button type="button">
        <StableLabel labels={["Save changes", "Saving…"]}>Saving…</StableLabel>
      </button>,
    );

    expect(screen.getByRole("button", { name: "Saving…" })).toBeInTheDocument();
  });

  it("keeps the idle label in the slot, hidden from assistive tech, while busy", () => {
    render(
      <button type="button">
        <StableLabel labels={["Save changes", "Saving…"]}>Saving…</StableLabel>
      </button>,
    );

    expect(screen.getByText("Save changes")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});
