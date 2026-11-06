import "@testing-library/jest-dom";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithStore } from "@web/__tests__/render-with-store";
import {
  selectIsAboutOpen,
  selectIsCmdPaletteOpen,
  useSettingsStore,
} from "@web/settings/settings.store";
import { AboutModal } from "./AboutModal";
import {
  ABOUT_SOCIAL_LINKS,
  ABOUT_SOCIAL_SHORTCUTS,
  COPY_VERSION_SHORTCUT,
} from "./about-modal.constants";
import { beforeEach, describe, expect, it, mock } from "bun:test";

describe("AboutModal", () => {
  const mockWriteText = mock(() => Promise.resolve());
  const mockWindowOpen = mock(() => null);

  beforeEach(() => {
    mockWriteText.mockClear();
    mockWindowOpen.mockClear();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: mockWriteText },
    });
    window.open = mockWindowOpen as typeof window.open;
  });

  it("renders nothing while closed", () => {
    renderWithStore(<AboutModal />, { settings: { isAboutOpen: false } });

    expect(screen.queryByText("About Compass")).not.toBeInTheDocument();
  });

  it("shows the app version, copy keycap, and social links while open", () => {
    renderWithStore(<AboutModal />, { settings: { isAboutOpen: true } });

    expect(screen.getByText("About Compass")).toBeInTheDocument();
    expect(screen.getByText(/Version: dev/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toHaveTextContent(
      COPY_VERSION_SHORTCUT,
    );

    for (const { label, href, id } of ABOUT_SOCIAL_LINKS) {
      const link = screen.getByLabelText(label);
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveTextContent(ABOUT_SOCIAL_SHORTCUTS[id]);
    }
  });

  it("copies the version to the clipboard from the button", async () => {
    renderWithStore(<AboutModal />, { settings: { isAboutOpen: true } });

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect(mockWriteText).toHaveBeenCalledWith("dev");
    expect(
      await screen.findByRole("button", { name: "Copied" }),
    ).toBeInTheDocument();
  });

  it("copies the version when C is pressed while open", async () => {
    renderWithStore(<AboutModal />, { settings: { isAboutOpen: true } });

    fireEvent.keyDown(document, { key: "c", code: "KeyC" });

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith("dev");
    });
  });

  it("opens each social link from its letter shortcut while open", async () => {
    renderWithStore(<AboutModal />, { settings: { isAboutOpen: true } });

    for (const { id, href } of ABOUT_SOCIAL_LINKS) {
      mockWindowOpen.mockClear();
      const shortcut = ABOUT_SOCIAL_SHORTCUTS[id];
      fireEvent.keyDown(document, {
        key: shortcut.toLowerCase(),
        code: `Key${shortcut}`,
      });

      await waitFor(() => {
        expect(mockWindowOpen).toHaveBeenCalledWith(
          href,
          "_blank",
          "noopener,noreferrer",
        );
      });
    }
  });

  it("does not handle letter shortcuts while closed", async () => {
    renderWithStore(<AboutModal />, { settings: { isAboutOpen: false } });

    fireEvent.keyDown(document, { key: "c", code: "KeyC" });
    fireEvent.keyDown(document, { key: "b", code: "KeyB" });

    await waitFor(() => {
      expect(mockWriteText).not.toHaveBeenCalled();
      expect(mockWindowOpen).not.toHaveBeenCalled();
    });
  });

  it("does not handle shortcuts while typing in an input", async () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    renderWithStore(<AboutModal />, { settings: { isAboutOpen: true } });

    fireEvent.keyDown(input, { key: "c", code: "KeyC" });

    await waitFor(() => {
      expect(mockWriteText).not.toHaveBeenCalled();
    });

    document.body.removeChild(input);
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
