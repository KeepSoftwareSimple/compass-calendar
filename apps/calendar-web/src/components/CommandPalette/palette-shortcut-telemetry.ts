import { track } from "@web/auth/posthog/track";
import { readPointerHintDismissedPermanently } from "@web/shortcuts/keyboard-only/pointer-hint.storage";
import { pointerHintActions } from "@web/shortcuts/keyboard-only/pointer-hint.store";
import { type ShortcutRegistryId } from "@web/shortcuts/shortcuts.registry";
import { sectionForRegistryId } from "@web/shortcuts/tips/shortcut-telemetry";

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

/** Teach the row's keycaps after a palette selection, unless tips are off. */
export function pulsePaletteTaughtShortcut(
  shortcut: string | string[] | undefined,
): void {
  if (!shortcut || readPointerHintDismissedPermanently()) return;
  pointerHintActions.pulse({
    shortcutKey: shortcut,
    source: "palette",
  });
}
