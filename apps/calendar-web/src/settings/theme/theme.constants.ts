import { STORAGE_KEYS } from "@web/common/constants/storage.constants";

/**
 * The app's themes, keyed by the `data-theme` value they set on <html>. Each
 * key must match a `[data-theme="…"]` block in index.css. `metaColor` mirrors
 * that theme's --background and drives the <meta name="theme-color"> chrome.
 */
export const THEMES = {
  "dark-abyss": { metaColor: "#06090f" },
  "light-beach": { metaColor: "#f3eee2" },
} satisfies Record<string, { metaColor: string }>;

export type ThemeName = keyof typeof THEMES;

/**
 * Light is the CSS :root fallback and the value used when nothing is stored
 * or the stored value is unknown. Dark is applied only when the visitor
 * stored `dark-abyss`.
 */
export const DEFAULT_THEME: ThemeName = "light-beach";

/**
 * localStorage key for the persisted choice, registered in the app-wide
 * STORAGE_KEYS enum like every other persistent key. The no-flash inline
 * script in index.html hard-codes the same string (it runs before any JS
 * module loads, so it can't import it) — keep the two in sync.
 */
export const THEME_STORAGE_KEY = STORAGE_KEYS.THEME;
