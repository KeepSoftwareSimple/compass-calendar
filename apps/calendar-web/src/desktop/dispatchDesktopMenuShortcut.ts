import {
  DESKTOP_MENU_SHORTCUT_BINDINGS,
  type DesktopMenuShortcutName,
  DesktopMenuShortcutNameSchema,
} from "@core/desktop/desktop-menu-shortcuts.contract";

declare global {
  interface Window {
    /** Set synchronously when a desktop menu dispatch runs (XCUITest probe). */
    __compassDesktopDispatchProbe?: string;
  }
}

function modifierFlags(part: string): Partial<KeyboardEventInit> {
  switch (part) {
    case "Mod":
      return { metaKey: true };
    case "Shift":
      return { shiftKey: true };
    case "Alt":
      return { altKey: true };
    case "Ctrl":
      return { ctrlKey: true };
    default:
      return {};
  }
}

function keyInitForHotkey(hotkey: string): KeyboardEventInit {
  const parts = hotkey.split("+");
  const keyToken = parts[parts.length - 1] ?? hotkey;
  const mods = parts.slice(0, -1);
  const init: KeyboardEventInit = {
    bubbles: true,
    cancelable: true,
  };
  for (const part of mods) {
    Object.assign(init, modifierFlags(part));
  }

  if (keyToken === "ArrowUp") {
    init.key = "ArrowUp";
    init.code = "ArrowUp";
  } else if (keyToken === "ArrowDown") {
    init.key = "ArrowDown";
    init.code = "ArrowDown";
  } else if (keyToken === "ArrowLeft") {
    init.key = "ArrowLeft";
    init.code = "ArrowLeft";
  } else if (keyToken === "ArrowRight") {
    init.key = "ArrowRight";
    init.code = "ArrowRight";
  } else if (keyToken === ",") {
    init.key = ",";
    init.code = "Comma";
  } else if (keyToken === "/") {
    init.key = "/";
    init.code = "Slash";
  } else if (keyToken.length === 1) {
    init.key = keyToken;
    init.code = `Key${keyToken.toUpperCase()}`;
  } else {
    init.key = keyToken;
    init.code = keyToken;
  }

  return init;
}

/**
 * Replays the keyboard binding for a desktop menu shortcut id. Returns false
 * when the name is unknown.
 */
export function dispatchDesktopMenuShortcut(name: string): boolean {
  const parsed = DesktopMenuShortcutNameSchema.safeParse(name);
  if (!parsed.success) {
    return false;
  }
  const shortcutName: DesktopMenuShortcutName = parsed.data;
  const binding = DESKTOP_MENU_SHORTCUT_BINDINGS[shortcutName];
  const init = keyInitForHotkey(binding.hotkey);
  const target = document.body ?? document.documentElement;
  target.dispatchEvent(new KeyboardEvent(binding.eventType, init));
  window.__compassDesktopDispatchProbe = shortcutName;
  return true;
}
