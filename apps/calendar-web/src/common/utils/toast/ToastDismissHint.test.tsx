import { render, screen } from "@testing-library/react";
import { ToastDismissHint } from "@web/common/utils/toast/ToastDismissHint";
import { clearAppLockReasons, setAppLockReason } from "@web/shortcuts/app-lock";
import { afterEach, describe, expect, it } from "bun:test";

describe("ToastDismissHint", () => {
  afterEach(() => {
    clearAppLockReasons();
  });

  it("shows an Esc keycap and how to dismiss", () => {
    render(<ToastDismissHint />);

    expect(screen.getByRole("note")).toBeTruthy();
    expect(screen.getByText("Press Esc to dismiss")).toBeTruthy();
    expect(screen.getByText("Esc")).toBeTruthy();
  });

  it("hides the Esc tip while an overlay owns Escape", () => {
    setAppLockReason("settingsModal", true);
    render(<ToastDismissHint />);

    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.queryByText("Press Esc to dismiss")).toBeNull();
  });
});
