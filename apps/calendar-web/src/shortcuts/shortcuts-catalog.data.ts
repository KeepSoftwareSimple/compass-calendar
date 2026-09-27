import { type ShortcutOverlaySection } from "@web/shortcuts/shortcuts-overlay.types";
import snapshot from "./shortcuts-catalog.json";

/** Checked-in snapshot of `getPublicShortcutCatalog()`. Import this from the
 * public page so the printable copy and `shortcuts.menu.test.ts` share one
 * artifact instead of a second inlined matrix. */
export const PUBLIC_SHORTCUT_CATALOG = snapshot as ShortcutOverlaySection[];
