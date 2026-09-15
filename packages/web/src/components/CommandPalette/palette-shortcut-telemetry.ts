import { track } from "@web/auth/posthog/track";

/** Palette rows that run an action directly (not through a keyboard handler). */
export function reportPaletteShortcut(
  shortcutId: string,
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
