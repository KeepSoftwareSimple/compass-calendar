import { render, screen } from "@testing-library/react";
import { EdgeFocusIndicator } from "@web/grid/shortcuts/EdgeFocusIndicator";
import { edgeFocusActions } from "@web/grid/shortcuts/edge-focus.store";
import { edgeFocusHintParts } from "@web/grid/shortcuts/edge-focus-hint.parts";
import { getPartsPlainText } from "@web/shortcuts/tips/shortcut-tips.data";
import { afterEach, describe, expect, it } from "bun:test";

await import("@testing-library/jest-dom");

afterEach(() => {
  edgeFocusActions.reset();
});

describe("EdgeFocusIndicator", () => {
  it("renders actionable hints instead of a mode-only label", () => {
    edgeFocusActions.setEdge(
      "event-1",
      "startDate",
      "Editing start time",
      false,
    );
    render(<EdgeFocusIndicator />);

    expect(screen.getByRole("status")).not.toHaveTextContent(
      /^Editing start time$/,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      getPartsPlainText(
        edgeFocusHintParts("startDate", false, "Editing start time"),
      ),
    );
  });
});
