import { track } from "@web/auth/posthog/track";
import { readPointerHintDismissedPermanently } from "@web/shortcuts/keyboard-only/pointer-hint.storage";
import { pointerHintActions } from "@web/shortcuts/keyboard-only/pointer-hint.store";
import { type ShortcutRegistryId } from "@web/shortcuts/shortcuts.registry";

/** Palette rows that run an action directly (not through a keyboard handler). */
export function reportPaletteShortcut(
  shortcutId: ShortcutRegistryId,
  section: string,
): void {
  track("shortcut_invoked", {
    invocation_method: "click",
    outcome: "handled",
    section,
    shortcut_id: shortcutId,
    source: "palette",
  });
}

/** Teach the row's keycaps after a palette selection, unless tips are off. */
export function pulsePaletteTaughtShortcut(
  shortcut: string | string[] | undefined,
): void {
  if (!shortcut || readPointerHintDismissedPermanently()) return;
  pointerHintActions.pulse({
    actionId: "unknown",
    shortcutKey: shortcut,
    performed: true,
    source: "palette",
  });
}
