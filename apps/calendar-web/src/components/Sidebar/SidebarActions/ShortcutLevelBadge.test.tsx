import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import * as Track from "@web/auth/posthog/track";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { SHORTCUT_LEVEL_UP_TOAST_ID } from "@web/common/constants/toast.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  registerToastPort,
  resetToastPort,
} from "@web/common/utils/toast/toast.port";
import { ShortcutLevelBadge } from "@web/components/Sidebar/SidebarActions/ShortcutLevelBadge";
import {
  selectIsShortcutsOpen,
  useViewStore,
} from "@web/events/stores/view.store";
import { setLevelHidden } from "@web/shortcuts/level/shortcut-level-hidden.store";
import { SHORTCUTS_REGISTRY } from "@web/shortcuts/shortcuts.registry";
import { type ShortcutOverlaySection } from "@web/shortcuts/shortcuts-overlay.types";
import { writeShortcutUsageProfile } from "@web/shortcuts/tips/shortcut-personalization.storage";
import { afterEach, describe, expect, it, spyOn } from "bun:test";

// The level is computed over the real registry, not the sections a caller
// passes in (those only drive "try next"), so assertions on the count use
// the registry's own length rather than a hard-coded number.
const REGISTRY_TOTAL = SHORTCUTS_REGISTRY.length;

const SECTIONS: ShortcutOverlaySection[] = [
  {
    id: "edit",
    title: "Edit",
    shortcuts: [
      { id: "edit-delete", keys: ["Del"], label: "Delete", section: "edit" },
      {
        id: "edit-duplicate",
        keys: ["Mod", "D"],
        label: "Duplicate",
        section: "edit",
      },
      {
        id: "edit-copy",
        keys: ["Mod", "C"],
        label: "Copy",
        section: "edit",
        locked: true,
      },
    ],
  },
  {
    id: "navigate",
    title: "Navigate",
    shortcuts: [
      { id: "nav-today", keys: ["T"], label: "Today", section: "navigate" },
      { id: "nav-next", keys: ["J"], label: "Next", section: "navigate" },
    ],
  },
];

function renderBadge(sections: ShortcutOverlaySection[] = SECTIONS) {
  const { wrapper } = createStoreWrapper();
  return render(<ShortcutLevelBadge sections={sections} />, { wrapper });
}

function focusEventCard() {
  const card = document.createElement("div");
  card.setAttribute("tabindex", "0");
  card.setAttribute("data-week-interaction-event-id", "event-1");
  document.body.appendChild(card);
  card.focus();
  return card;
}

describe("ShortcutLevelBadge", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders Lv 1 on an empty usage profile", () => {
    renderBadge();

    expect(
      screen.getByRole("button", { name: /Shortcut level 1, Newcomer/ }),
    ).toHaveTextContent("Lv 1");
  });

  it("lists the first three unused, unlocked rows as try-next", async () => {
    const user = userEvent.setup({ skipHover: true });
    renderBadge();

    await user.hover(screen.getByRole("button", { name: /Shortcut level/ }));

    expect(await screen.findByText("Try next")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
    expect(screen.getByText("Duplicate")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.queryByText("Copy")).not.toBeInTheDocument();
    expect(screen.queryByText("Next")).not.toBeInTheDocument();
  });

  it("shows a long try-next label in full next to a four-key row", async () => {
    const user = userEvent.setup({ skipHover: true });
    const label = "Move the month picker by a week (Enter opens it)";
    renderBadge([
      {
        id: "navigate",
        title: "Navigate",
        shortcuts: [
          {
            id: "nav-picker-step",
            keys: ["ArrowLeft", "ArrowUp", "ArrowDown", "ArrowRight"],
            label,
            section: "navigate",
          },
        ],
      },
    ]);

    await user.hover(screen.getByRole("button", { name: /Shortcut level/ }));

    expect(await screen.findByText(label)).not.toHaveClass("truncate");
  });

  it("prefers edit rows in try-next when a calendar event is focused", async () => {
    const user = userEvent.setup({ skipHover: true });
    focusEventCard();
    writeShortcutUsageProfile({
      version: 2,
      actions: {},
      shortcuts: { "edit-delete": { invocations: 1, recentImpressions: 0 } },
    });
    renderBadge();

    await user.hover(screen.getByRole("button", { name: /Shortcut level/ }));

    expect(await screen.findByText("Try next")).toBeInTheDocument();
    expect(screen.getByText("Duplicate")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();
  });

  it("shows progress and updates it as the usage profile grows", async () => {
    const user = userEvent.setup({ skipHover: true });
    writeShortcutUsageProfile({
      version: 2,
      actions: {},
      shortcuts: {
        "edit-delete": { invocations: 1, recentImpressions: 0 },
        "nav-today": { invocations: 1, recentImpressions: 0 },
      },
    });
    renderBadge();

    await user.hover(screen.getByRole("button", { name: /Shortcut level/ }));

    expect(
      await screen.findByText(
        new RegExp(`2 of ${REGISTRY_TOTAL} shortcuts used`),
      ),
    ).toBeInTheDocument();
  });

  it("opens the legend on click", async () => {
    const user = userEvent.setup();
    renderBadge();

    await user.click(screen.getByRole("button", { name: /Shortcut level/ }));

    expect(selectIsShortcutsOpen(useViewStore.getState())).toBe(true);
  });

  it("hides itself via the tooltip's Hide level button", async () => {
    const user = userEvent.setup();
    renderBadge();

    await user.click(screen.getByRole("button", { name: /Shortcut level/ }));
    await user.click(await screen.findByRole("button", { name: "Hide level" }));

    expect(
      screen.queryByRole("button", { name: /Shortcut level/ }),
    ).not.toBeInTheDocument();
  });

  it("renders nothing while the level badge is hidden", () => {
    setLevelHidden(true);
    renderBadge();

    expect(
      screen.queryByRole("button", { name: /Shortcut level/ }),
    ).not.toBeInTheDocument();
  });
});

describe("ShortcutLevelBadge level-up celebration", () => {
  const { port, mocks } = createTestToastPort();

  afterEach(() => {
    document.body.innerHTML = "";
    persistentBrowserStore.remove(STORAGE_KEYS.SHORTCUT_LEVEL_CELEBRATED);
    mocks.toast.mockClear();
    resetToastPort();
  });

  it("seeds the celebrated level silently on first mount", () => {
    registerToastPort(port);
    writeShortcutUsageProfile({
      version: 2,
      actions: {},
      shortcuts: {
        "edit-delete": { invocations: 1, recentImpressions: 0 },
        "edit-duplicate": { invocations: 1, recentImpressions: 0 },
        "nav-today": { invocations: 1, recentImpressions: 0 },
        "nav-next": { invocations: 1, recentImpressions: 0 },
      },
    });

    renderBadge();

    expect(mocks.toast).not.toHaveBeenCalled();
    expect(
      persistentBrowserStore.get(STORAGE_KEYS.SHORTCUT_LEVEL_CELEBRATED),
    ).toBe("2");
  });

  it("pulses, toasts once, and tracks when a threshold is crossed", async () => {
    registerToastPort(port);
    const track = spyOn(Track, "track");
    persistentBrowserStore.set(STORAGE_KEYS.SHORTCUT_LEVEL_CELEBRATED, "1");
    renderBadge();
    const button = screen.getByRole("button", { name: /Shortcut level 1/ });
    expect(button.className).not.toContain("c-level-pulse");

    act(() => {
      writeShortcutUsageProfile({
        version: 2,
        actions: {},
        shortcuts: {
          "edit-delete": { invocations: 1, recentImpressions: 0 },
          "edit-duplicate": { invocations: 1, recentImpressions: 0 },
          "nav-today": { invocations: 1, recentImpressions: 0 },
          "nav-next": { invocations: 1, recentImpressions: 0 },
        },
      });
    });

    const leveledButton = await screen.findByRole("button", {
      name: /Shortcut level 2, Explorer/,
    });
    expect(leveledButton.className).toContain("c-level-pulse");
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    const [, toastOptions] = mocks.toast.mock.calls[0] as unknown as [
      unknown,
      { toastId?: unknown },
    ];
    expect(toastOptions).toMatchObject({ toastId: SHORTCUT_LEVEL_UP_TOAST_ID });
    expect(track).toHaveBeenCalledWith("shortcut_level_up", {
      level: 2,
      level_name: "Explorer",
      used: 4,
      total: REGISTRY_TOTAL,
    });

    await waitFor(() => {
      expect(leveledButton.className).not.toContain("c-level-pulse");
    });
    track.mockRestore();
  });

  it("does not re-celebrate the same level on a later write", () => {
    registerToastPort(port);
    persistentBrowserStore.set(STORAGE_KEYS.SHORTCUT_LEVEL_CELEBRATED, "2");
    writeShortcutUsageProfile({
      version: 2,
      actions: {},
      shortcuts: {
        "edit-delete": { invocations: 1, recentImpressions: 0 },
        "edit-duplicate": { invocations: 1, recentImpressions: 0 },
        "nav-today": { invocations: 1, recentImpressions: 0 },
        "nav-next": { invocations: 1, recentImpressions: 0 },
      },
    });

    renderBadge();

    expect(mocks.toast).not.toHaveBeenCalled();
  });
});
