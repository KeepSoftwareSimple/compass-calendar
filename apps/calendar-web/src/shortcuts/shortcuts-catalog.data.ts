import { type ShortcutOverlaySection } from "@web/shortcuts/shortcuts-overlay.types";
import snapshot from "./shortcuts-catalog.json";
import meta from "./shortcuts-catalog.meta.json";

/** Checked-in snapshot of `getPublicShortcutCatalog()`. Import this from the
 * public page so the printable copy and `shortcuts.menu.test.ts` share one
 * artifact instead of a second inlined matrix. */
export const PUBLIC_SHORTCUT_CATALOG = snapshot as ShortcutOverlaySection[];

/** ISO calendar date (`YYYY-MM-DD`) when the public catalog last changed. */
export const PUBLIC_SHORTCUT_CATALOG_LAST_UPDATED = meta.lastUpdated;

export const PUBLIC_SHORTCUT_CATALOG_FINGERPRINT = meta.fingerprint;
