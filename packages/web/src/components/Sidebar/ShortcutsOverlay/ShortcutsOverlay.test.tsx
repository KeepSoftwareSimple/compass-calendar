import { HotkeyManager, HotkeysProvider } from "@tanstack/react-hotkeys";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type PropsWithChildren } from "react";
import { pressKey } from "@web/__tests__/utils/keyboard.test.util";
import {
  selectIsShortcutsOpen,
  useViewStore,
  viewActions,
} from "@web/events/stores/view.store";
import { beforeEach, describe, expect, it } from "bun:test";
import "@testing-library/jest-dom";
import { ShortcutsOverlay } from "./ShortcutsOverlay";

const sections = [
  {
    id: "navigate",
    title: "Day",
    shortcuts: [
      {
        id: "nav-prev",
        keys: ["j"],
        label: "Previous day",
        section: "navigate",
      },
      { id: "nav-next", keys: ["k"], label: "Next day", section: "navigate" },
    ],
  },
  {
    id: "empty",
    title: "Empty",
    shortcuts: [],
  },
];

function wrapper({ children }: PropsWithChildren) {
  return <HotkeysProvider>{children}</HotkeysProvider>;
}

describe("ShortcutsOverlay", () => {
  beforeEach(() => {
    HotkeyManager.resetInstance();
    document.body.removeAttribute("data-app-locked");
    viewActions.setSidebarOpen(false);
  });

  it("renders shortcut sections over the sidebar", () => {
    viewActions.setSidebarOpen(true);
    viewActions.toggleShortcuts();

    render(<ShortcutsOverlay sections={sections} viewLabel="Day" />, {
      wrapper,
    });

    const overlay = screen.getByRole("dialog", { name: "Keyboard shortcuts" });

    expect(overlay.firstElementChild?.className).toContain("translate-x-0");
    expect(overlay.inert).toBe(false);
    expect(screen.getByText("Shortcuts")).toBeInTheDocument();
    expect(
      screen.getByText("Keyboard shortcuts for Day view"),
    ).toBeInTheDocument();
    expect(screen.getByText("Day")).toBeInTheDocument();
    expect(screen.getByText("Previous day")).toBeInTheDocument();
    expect(screen.queryByText("Empty")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Printable version" }),
    ).toHaveAttribute("href", "/shortcuts");
  });

  it("closes when Escape is pressed", async () => {
    viewActions.setSidebarOpen(true);
    viewActions.toggleShortcuts();

    render(<ShortcutsOverlay sections={sections} />, { wrapper });

    act(() => {
      pressKey("Escape");
    });

    await waitFor(() => {
      expect(selectIsShortcutsOpen(useViewStore.getState())).toBe(false);
    });
  });

  it("clears the search query before closing on Escape", async () => {
    const user = userEvent.setup();
    viewActions.setSidebarOpen(true);
    viewActions.toggleShortcuts();

    render(<ShortcutsOverlay sections={sections} />, { wrapper });

    await user.type(
      screen.getByPlaceholderText("Search shortcuts..."),
      "previous",
    );
    expect(screen.getByText("Previous day")).toBeInTheDocument();
    expect(screen.queryByText("Next day")).not.toBeInTheDocument();

    act(() => {
      pressKey("Escape");
    });

    await waitFor(() => {
      expect(selectIsShortcutsOpen(useViewStore.getState())).toBe(true);
      expect(screen.getByPlaceholderText("Search shortcuts...")).toHaveValue(
        "",
      );
      expect(screen.getByText("Next day")).toBeInTheDocument();
    });

    act(() => {
      pressKey("Escape");
    });

    await waitFor(() => {
      expect(selectIsShortcutsOpen(useViewStore.getState())).toBe(false);
    });
  });

  it("dismisses with Escape while the app is locked", async () => {
    document.body.dataset.appLocked = "true";
    viewActions.setSidebarOpen(true);
    viewActions.toggleShortcuts();

    render(<ShortcutsOverlay sections={sections} />, { wrapper });

    act(() => {
      pressKey("Escape");
    });

    await waitFor(() => {
      expect(selectIsShortcutsOpen(useViewStore.getState())).toBe(false);
    });
  });

  it("is inert and off-screen when closed", () => {
    render(<ShortcutsOverlay sections={sections} />, { wrapper });

    // jsdom still exposes inert dialogs to role queries; assert the inert
    // flag and off-screen transform that browsers use to hide it.
    const overlay = screen.getByRole("dialog", {
      hidden: true,
      name: "Keyboard shortcuts",
    });
    expect(overlay.inert).toBe(true);
    expect(overlay.firstElementChild?.className).toContain("-translate-x-full");
  });
});
