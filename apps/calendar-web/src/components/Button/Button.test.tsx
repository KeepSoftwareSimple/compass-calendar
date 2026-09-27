import { afterEach, describe, expect, it } from "bun:test";
import "@testing-library/jest-dom";
import { cleanup, render, screen } from "@testing-library/react";
import { themeActions, useThemeStore } from "@web/settings/theme/theme.store";
import { SaveButton } from "./Button";

describe("SaveButton", () => {
  afterEach(() => {
    cleanup();
    themeActions.setTheme("dark-abyss");
  });

  it("applies the fill via a CSS variable so hover:bg-background can override it", () => {
    render(<SaveButton minWidth={110}>Save</SaveButton>);

    const button = screen.getByRole("button", { name: "Save" });

    // Inline `background` outranks Tailwind hover utilities and was the
    // contrast bug: text-muted painted over the event fill (~1:1).
    expect(button.style.background).toBe("");
    expect(button.style.getPropertyValue("--save-button-bg")).toBeTruthy();
    expect(button.className).toContain("bg-(--save-button-bg)");
    expect(button.className).toContain("hover:bg-background");
    expect(button.className).toContain("hover:text-text-muted");
  });

  it("keeps a CSS-variable fill under Light Beach", () => {
    themeActions.setTheme("light-beach");
    expect(useThemeStore.getState().theme).toBe("light-beach");

    render(<SaveButton minWidth={110}>Save</SaveButton>);

    const button = screen.getByRole("button", { name: "Save" });
    expect(button.style.background).toBe("");
    expect(button.style.getPropertyValue("--save-button-bg")).toBe("#454442");
  });
});
