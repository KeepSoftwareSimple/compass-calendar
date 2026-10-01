import { z } from "zod/v4";

/**
 * Shortcut registry ids the macOS main menu dispatches through
 * `window.compassDesktop.dispatchShortcut`. Key bindings mirror
 * {@link APP_SHORTCUT_BINDINGS} and {@link KEYMAP} in calendar-web.
 */
export const DesktopMenuShortcutNameSchema = z.enum([
  "create-timed",
  "nav-today",
  "nav-day-view",
  "nav-week-view",
  "other-palette",
  "other-settings",
  "other-shortcuts",
]);

export type DesktopMenuShortcutName = z.infer<
  typeof DesktopMenuShortcutNameSchema
>;

/** Tanstack-registerable hotkey plus the DOM event type the web handler uses. */
export type DesktopMenuShortcutBinding = {
  readonly hotkey: string;
  readonly eventType: "keydown" | "keyup";
};

export const DESKTOP_MENU_SHORTCUT_BINDINGS: Record<
  DesktopMenuShortcutName,
  DesktopMenuShortcutBinding
> = {
  "create-timed": { hotkey: "C", eventType: "keyup" },
  "nav-today": { hotkey: "T", eventType: "keyup" },
  "nav-day-view": { hotkey: "D", eventType: "keyup" },
  "nav-week-view": { hotkey: "W", eventType: "keyup" },
  "other-palette": { hotkey: "Mod+K", eventType: "keydown" },
  "other-settings": { hotkey: "Mod+,", eventType: "keydown" },
  "other-shortcuts": { hotkey: "Shift+/", eventType: "keyup" },
};

/**
 * macOS key equivalents shown in NSMenu. Modifiers use AppKit names
 * (`command`, `shift`) for parity checks in CompassKitTests.
 */
export type DesktopMenuMacKeyEquivalent = {
  readonly key: string;
  readonly modifiers: readonly ("command" | "shift" | "option" | "control")[];
};

export const DESKTOP_MENU_MAC_KEY_EQUIVALENTS: Record<
  DesktopMenuShortcutName,
  DesktopMenuMacKeyEquivalent
> = {
  "create-timed": { key: "c", modifiers: [] },
  "nav-today": { key: "t", modifiers: [] },
  "nav-day-view": { key: "d", modifiers: [] },
  "nav-week-view": { key: "w", modifiers: [] },
  "other-palette": { key: "k", modifiers: ["command"] },
  "other-settings": { key: ",", modifiers: ["command"] },
  "other-shortcuts": { key: "/", modifiers: ["command", "shift"] },
};
