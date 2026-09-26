import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import { ShortcutLevelBadge } from "@web/components/Sidebar/SidebarActions/ShortcutLevelBadge";
import {
  selectIsShortcutsOpen,
  useViewStore,
} from "@web/events/stores/view.store";
import { setLevelHidden } from "@web/shortcuts/level/shortcut-level-hidden.store";
import { SHORTCUTS_REGISTRY } from "@web/shortcuts/shortcuts.registry";
import { type ShortcutOverlaySection } from "@web/shortcuts/shortcuts-overlay.types";
import { writeShortcutUsageProfile } from "@web/shortcuts/tips/shortcut-personalization.storage";
import { afterEach, describe, expect, it } from "bun:test";

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
