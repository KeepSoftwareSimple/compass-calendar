import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PointerHint } from "@web/components/PointerHint/PointerHint";
import {
  readPointerHintDismissedPermanently,
  resetPointerHintPersistenceForTests,
} from "@web/shortcuts/keyboard-only/pointer-hint.storage";
import {
  initialPointerHintState,
  pointerHintActions,
  usePointerHintStore,
} from "@web/shortcuts/keyboard-only/pointer-hint.store";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

describe("PointerHint", () => {
  beforeEach(() => {
    resetPointerHintPersistenceForTests();
    usePointerHintStore.setState(initialPointerHintState, true);
  });

  afterEach(() => {
    resetPointerHintPersistenceForTests();
    usePointerHintStore.setState(initialPointerHintState, true);
  });

  it("renders nothing until the store pulses a palette shortcut", () => {
    const { container, rerender } = render(<PointerHint />);
    expect(container).toBeEmptyDOMElement();

    pointerHintActions.pulse({ shortcutKey: "t", source: "palette" });
    rerender(<PointerHint />);
    expect(screen.getByRole("status")).toHaveTextContent("Next time, press");
  });

  it("shows chord shortcuts from the palette", () => {
    pointerHintActions.pulse({
      shortcutKey: ["Mod", "K"],
      source: "palette",
    });
    render(<PointerHint />);
    expect(screen.getByRole("status")).toHaveTextContent("Next time, press");
  });

  it("persists dismissal when the close control is clicked", async () => {
    const user = userEvent.setup();
    pointerHintActions.pulse({ shortcutKey: "w", source: "palette" });
    render(<PointerHint />);

    await user.click(
      screen.getByRole("button", { name: "Turn off keyboard tips" }),
    );

    expect(readPointerHintDismissedPermanently()).toBe(true);
    expect(usePointerHintStore.getState().isVisible).toBe(false);
  });
});
