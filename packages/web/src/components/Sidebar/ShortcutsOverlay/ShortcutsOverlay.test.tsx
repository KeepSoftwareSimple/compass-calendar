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
import { writeShortcutUsageProfile } from "@web/shortcuts/tips/shortcut-personalization.storage";
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
      screen.getByText("You've used 0 of 2 shortcuts here"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Keyboard shortcuts for Day view"),
    ).toBeInTheDocument();
    expect(screen.getByText("Day")).toBeInTheDocument();
    expect(screen.getByText("Previous day")).toBeInTheDocument();
    expect(screen.queryByText("Empty")).not.toBeInTheDocument();
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

  it("marks used shortcuts and narrows the header count with search", async () => {
    const user = userEvent.setup();
    writeShortcutUsageProfile({
      version: 2,
      actions: {},
      shortcuts: {
        "nav-prev": { invocations: 1, recentImpressions: 0 },
        "nav-next": { invocations: 2, recentImpressions: 0 },
        "nav-today": { invocations: 4, recentImpressions: 0 },
      },
    });
    viewActions.setSidebarOpen(true);
    viewActions.toggleShortcuts();

    render(
      <ShortcutsOverlay
        sections={[
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
              {
                id: "nav-next",
                keys: ["k"],
                label: "Next day",
                section: "navigate",
              },
              {
                id: "nav-today",
                keys: ["t"],
                label: "Go to today",
                section: "navigate",
              },
              {
                id: "nav-unused",
                keys: ["g"],
                label: "Go to date",
                section: "navigate",
              },
            ],
          },
        ]}
      />,
      { wrapper },
    );

    await waitFor(() => {
      expect(
        screen.getByText("You've used 3 of 4 shortcuts here"),
      ).toBeInTheDocument();
    });
    expect(screen.getAllByText("used")).toHaveLength(3);

    await user.type(
      screen.getByPlaceholderText("Search shortcuts..."),
      "previous",
    );

    expect(
      screen.getByText("You've used 1 of 1 shortcuts here"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("used")).toHaveLength(1);
    expect(screen.queryByText("Next day")).not.toBeInTheDocument();
  });
});
