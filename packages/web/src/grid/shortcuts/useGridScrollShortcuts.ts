import {
  scrollTimedGrid,
  type TimedGridScrollUnit,
} from "@web/grid/shortcuts/scroll-timed-grid";
import { APP_SHORTCUT_BINDINGS } from "@web/shortcuts/app-shortcut-bindings";
import { useAppShortcut } from "@web/shortcuts/useAppShortcut";

const scrollGridFromShortcut = (
  direction: "up" | "down",
  unit: TimedGridScrollUnit,
  event: KeyboardEvent,
) => {
  if (!scrollTimedGrid(direction, unit)) return;

  event.preventDefault();
  event.stopPropagation();
};

/**
 * PageUp / PageDown page the timed grid by one viewport; Alt+ArrowUp /
 * Alt+ArrowDown pan it by one hour. Both fire even when focus is on an
 * event card or another non-grid control. Bare arrows stay reserved for
 * event focus; J/K stay reserved for day/week navigation.
 */
export function useGridScrollShortcuts() {
  const scroll = APP_SHORTCUT_BINDINGS;
  useAppShortcut(
    scroll.navScrollUp.hotkey,
    (event) => {
      scrollGridFromShortcut("up", "page", event);
    },
    { shortcutId: "nav-scroll-up" },
  );
  useAppShortcut(
    scroll.navScrollDown.hotkey,
    (event) => {
      scrollGridFromShortcut("down", "page", event);
    },
    { shortcutId: "nav-scroll-down" },
  );
  useAppShortcut(
    scroll.navScrollHourUp.hotkey,
    (event) => {
      scrollGridFromShortcut("up", "hour", event);
    },
    { shortcutId: "nav-scroll-hour-up" },
  );
  useAppShortcut(
    scroll.navScrollHourDown.hotkey,
    (event) => {
      scrollGridFromShortcut("down", "hour", event);
    },
    { shortcutId: "nav-scroll-hour-down" },
  );
}
