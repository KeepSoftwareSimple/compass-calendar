import { detectPlatform, resolveModifier } from "@tanstack/react-hotkeys";

// On compact Mac keyboards, Fn plus Backspace sends forward Delete.
export function isMacForwardDelete(token: string): boolean {
  return token === "Delete" && detectPlatform() === "mac";
}

export function getSpokenShortcutKey(token: string): string {
  if (isMacForwardDelete(token)) return "Fn plus Backspace";
  const expanded = expandModInShortcutDisplay(token);
  if (expanded === "Meta") return "Cmd";
  if (expanded === "Control") return "Ctrl";
  return expanded;
}

/** Resolves TanStack `Mod` tokens to `Meta` / `Control` for icons and labels. */
export function expandModInShortcutDisplay(k: string): string {
  const resolvedMod = resolveModifier("Mod");
  return k
    .split("+")
    .map((segment) => {
      const part = segment.trim();
      return part.toLowerCase() === "mod" ? resolvedMod : part;
    })
    .join("+");
}
