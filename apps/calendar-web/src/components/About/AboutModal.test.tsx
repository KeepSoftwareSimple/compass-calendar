import "@testing-library/jest-dom";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithStore } from "@web/__tests__/render-with-store";
import { SOCIAL_LINKS } from "@web/common/constants/social.constants";
import {
  selectIsAboutOpen,
  selectIsCmdPaletteOpen,
  useSettingsStore,
} from "@web/settings/settings.store";
import { AboutModal } from "./AboutModal";
import { beforeEach, describe, expect, it, mock } from "bun:test";

describe("AboutModal", () => {
  const mockWriteText = mock(() => Promise.resolve());

  beforeEach(() => {
    mockWriteText.mockClear();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: mockWriteText },
    });
  });

  it("renders nothing while closed", () => {
    renderWithStore(<AboutModal />, { settings: { isAboutOpen: false } });

    expect(screen.queryByText("About Compass")).not.toBeInTheDocument();
  });

  it("shows the app version and social links while open", () => {
    renderWithStore(<AboutModal />, { settings: { isAboutOpen: true } });

    expect(screen.getByText("About Compass")).toBeInTheDocument();
    expect(screen.getByText(/Version: dev/)).toBeInTheDocument();

    for (const { label, href } of SOCIAL_LINKS) {
      expect(screen.getByLabelText(label)).toHaveAttribute("href", href);
    }
  });

  it("copies the version to the clipboard", async () => {
    renderWithStore(<AboutModal />, { settings: { isAboutOpen: true } });

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect(mockWriteText).toHaveBeenCalledWith("dev");
    expect(
      await screen.findByRole("button", { name: "Copied" }),
    ).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    renderWithStore(<AboutModal />, { settings: { isAboutOpen: true } });

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(selectIsAboutOpen(useSettingsStore.getState())).toBe(false);
    expect(selectIsCmdPaletteOpen(useSettingsStore.getState())).toBe(false);
  });

  it("returns to the command palette on Escape when opened from it", () => {
    renderWithStore(<AboutModal />, {
      settings: { isAboutOpen: true, overlayOpenedFromPalette: true },
    });

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(selectIsAboutOpen(useSettingsStore.getState())).toBe(false);
    expect(selectIsCmdPaletteOpen(useSettingsStore.getState())).toBe(true);
  });
});
