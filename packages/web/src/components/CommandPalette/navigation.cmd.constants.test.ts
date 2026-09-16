import dayjs from "@core/util/date/dayjs";
import * as Track from "@web/auth/posthog/track";
import {
  getGoToDateCommandItem,
  getLegendNavigationCommandItems,
  getNavigationCommandItems,
} from "@web/components/CommandPalette/navigation.cmd.constants";
import { APP_SHORTCUT_BINDINGS } from "@web/shortcuts/app-shortcut-bindings";
import { type ViewName } from "@web/shortcuts/shortcuts.constants";
import { describe, expect, it, spyOn } from "bun:test";

describe("getNavigationCommandItems", () => {
  const noopHandlers = {
    onGoToToday: () => {},
    onNavigateToView: () => {},
    onShowShortcuts: () => {},
  };

  it("lists Today first, then Day, Week, Life, then shortcuts", () => {
    const labels = getNavigationCommandItems(noopHandlers).map(
      (item) => item.label,
    );
    expect(labels).toEqual([
      "Go to Today",
      "Go to Day",
      "Go to Week",
      "Go to Life",
      "Show shortcuts",
    ]);
  });

  it("lists the shortcut practice replay next to the welcome guide", () => {
    const labels = getNavigationCommandItems({
      ...noopHandlers,
      onPracticeShortcuts: () => {},
      onShowWelcomeGuide: () => {},
    }).map((item) => item.label);

    expect(labels).toContain("Play Block Party (practice shortcuts)");
    expect(labels).toContain("Show welcome guide");
    expect(
      labels.indexOf("Play Block Party (practice shortcuts)"),
    ).toBeLessThan(labels.indexOf("Show welcome guide"));
  });

  it("can list only view navigation for non-calendar surfaces", () => {
    const labels = getNavigationCommandItems({
      onNavigateToView: () => {},
    }).map((item) => item.label);

    expect(labels).toEqual(["Go to Day", "Go to Week", "Go to Life"]);
  });

  it("advertises every view shortcut in the command palette", () => {
    const shortcuts = Object.fromEntries(
      getNavigationCommandItems(noopHandlers).map((item) => [
        item.id,
        item.shortcut,
      ]),
    );

    expect(shortcuts).toMatchObject({
      "go-to-day": "d",
      "go-to-week": "w",
      "go-to-life": "l",
    });
  });

  it("omits the current view from navigation", () => {
    const labels = getNavigationCommandItems({
      currentView: "life",
      onNavigateToView: () => {},
    }).map((item) => item.label);

    expect(labels).toEqual(["Go to Day", "Go to Week"]);
  });

  it("runs the matching navigation callbacks", () => {
    const navigatedViews: ViewName[] = [];
    let didGoToToday = false;
    let didShowShortcuts = false;
    const items = getNavigationCommandItems({
      onGoToToday: () => {
        didGoToToday = true;
      },
      onNavigateToView: (viewName) => {
        navigatedViews.push(viewName);
      },
      onShowShortcuts: () => {
        didShowShortcuts = true;
      },
    });

    items.find((item) => item.id === "go-to-day")?.onClick?.();
    items.find((item) => item.id === "go-to-week")?.onClick?.();
    items.find((item) => item.id === "go-to-life")?.onClick?.();
    items.find((item) => item.id === "today")?.onClick?.();
    items.find((item) => item.id === "show-shortcuts")?.onClick?.();

    expect(navigatedViews).toEqual(["day", "week", "life"]);
    expect(didGoToToday).toBe(true);
    expect(didShowShortcuts).toBe(true);
  });

  it("returns a pinned Go to date row only while the query parses", () => {
    const now = dayjs("2026-09-15T12:00:00.000Z");
    const selected: string[] = [];
    const item = getGoToDateCommandItem("oct 3", now, (date) => {
      selected.push(date.format("YYYY-MM-DD"));
    });

    expect(item?.id).toBe("go-to-date");
    expect(item?.label).toBe("Go to Sat, Oct 3, 2026");
    item?.onClick?.();
    expect(selected).toEqual(["2026-10-03"]);
    expect(getGoToDateCommandItem("hello", now, () => {})).toBeNull();
  });
});

describe("getLegendNavigationCommandItems", () => {
  const handlers = {
    onToggleSidebar: () => {},
    onFocusMonthPicker: () => {},
    onOpenUpNext: () => {},
    onJoinMeeting: () => {},
  };

  it("lists sidebar, month picker, and Up Next rows with registry keycaps", () => {
    const items = getLegendNavigationCommandItems({
      isSidebarOpen: true,
      hasUpNext: true,
      hasConference: true,
      ...handlers,
    });

    expect(
      Object.fromEntries(items.map((item) => [item.id, item.shortcut])),
    ).toEqual({
      "toggle-sidebar": [...APP_SHORTCUT_BINDINGS.otherSidebar.keycaps],
      "focus-month-picker": [...APP_SHORTCUT_BINDINGS.focusSidebar.keycaps],
      "open-up-next": [...APP_SHORTCUT_BINDINGS.navUpNext.keycaps],
      "join-up-next-meeting": [...APP_SHORTCUT_BINDINGS.navJoinMeeting.keycaps],
    });
  });

  it("disables month picker and Up Next rows when preconditions are missing", () => {
    const items = getLegendNavigationCommandItems({
      isSidebarOpen: false,
      hasUpNext: false,
      hasConference: false,
      ...handlers,
    });

    expect(
      Object.fromEntries(items.map((item) => [item.id, item.disabled])),
    ).toEqual({
      "toggle-sidebar": undefined,
      "focus-month-picker": true,
      "open-up-next": true,
      "join-up-next-meeting": true,
    });
  });

  it("reports palette shortcut telemetry when a row runs", () => {
    const track = spyOn(Track, "track");
    let toggled = false;
    const items = getLegendNavigationCommandItems({
      isSidebarOpen: true,
      hasUpNext: false,
      hasConference: false,
      ...handlers,
      onToggleSidebar: () => {
        toggled = true;
      },
    });

    items.find((item) => item.id === "toggle-sidebar")?.onClick?.();

    expect(toggled).toBe(true);
    expect(track).toHaveBeenCalledWith(
      "shortcut_invoked",
      expect.objectContaining({
        invocation_method: "click",
        source: "palette",
        shortcut_id: "other-sidebar",
        section: "other",
      }),
    );
    track.mockRestore();
  });
});
