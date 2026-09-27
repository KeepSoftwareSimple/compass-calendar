import { resolveModifier } from "@tanstack/react-hotkeys";

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
