import { track } from "@web/auth/posthog/track";
import { readPointerHintDismissedPermanently } from "@web/shortcuts/keyboard-only/pointer-hint.storage";
import { pointerHintActions } from "@web/shortcuts/keyboard-only/pointer-hint.store";
import {
  SHORTCUTS_REGISTRY,
  type ShortcutRegistryId,
} from "@web/shortcuts/shortcuts.registry";
import { sectionForRegistryId } from "@web/shortcuts/tips/shortcut-telemetry";
import { readTipsMuted } from "@web/shortcuts/tips/shortcut-tips-muted.store";

/** Palette rows that run an action directly (not through a keyboard handler). */
export function reportPaletteShortcut(shortcutId: ShortcutRegistryId): void {
  const section = sectionForRegistryId(shortcutId);
  if (!section) return;

  track("shortcut_invoked", {
    invocation_method: "click",
    outcome: "handled",
    section,
    shortcut_id: shortcutId,
    source: "palette",
  });
}

export function withPaletteShortcut(
  shortcutId: ShortcutRegistryId,
  action: () => void,
): () => void {
  return () => {
    reportPaletteShortcut(shortcutId);
    action();
  };
}

const normalizePaletteKeys = (shortcut: string | string[]): string => {
  const parts =
    typeof shortcut === "string" ? shortcut.split("+") : [...shortcut];
  return parts.map((part) => part.trim().toLowerCase()).join("+");
};

const registryIdForPaletteShortcut = (
  shortcut: string | string[],
): ShortcutRegistryId | undefined => {
  const target = normalizePaletteKeys(shortcut);
  for (const entry of SHORTCUTS_REGISTRY) {
    const entryKeys = entry.keys.map((key) => key.toLowerCase()).join("+");
    if (entryKeys === target) return entry.id;
  }
  return undefined;
};

/** Teach the row's keycaps after a palette selection, unless tips are off. */
export function pulsePaletteTaughtShortcut(
  shortcut: string | string[] | undefined,
): void {
  if (!shortcut || readPointerHintDismissedPermanently() || readTipsMuted()) {
    return;
  }

  const shortcutId = registryIdForPaletteShortcut(shortcut);
  if (shortcutId) {
    track("pointer_hint_shown", {
      shortcut_id: shortcutId,
      source: "palette",
    });
  }

  pointerHintActions.pulse({
    shortcutKey: shortcut,
    source: "palette",
  });
}
