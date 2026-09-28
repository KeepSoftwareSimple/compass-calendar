import { useMemo } from "react";
import { useShortcutWriteLocked } from "@web/billing/useBillingWriteLock";
import { type ShortcutOverlaySection } from "@web/shortcuts/shortcuts-overlay.types";

/** Marks write shortcuts locked while billing blocks writes, so the legend
 * and the level badge's "try next" list agree on what is usable. */
export function useLockedShortcutSections(
  shortcutSections: ShortcutOverlaySection[],
): ShortcutOverlaySection[] {
  const writeLocked = useShortcutWriteLocked();
  return useMemo(() => {
    if (!writeLocked) return shortcutSections;
    return shortcutSections.map((section) => ({
      ...section,
      shortcuts: section.shortcuts.map((shortcut) =>
        shortcut.requiresWrite ? { ...shortcut, locked: true } : shortcut,
      ),
    }));
  }, [shortcutSections, writeLocked]);
}
