import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  THEMES,
  type ThemeName,
} from "./theme.constants";

export const isThemeName = (value: string | null): value is ThemeName =>
  value !== null && value in THEMES;

/**
 * The persisted theme. An explicit stored choice always wins. When the key is
 * missing or unknown, use the light default.
 */
export const readStoredTheme = (): ThemeName => {
  const stored = persistentBrowserStore.get(THEME_STORAGE_KEY);
  return isThemeName(stored) ? stored : DEFAULT_THEME;
};

export const persistTheme = (theme: ThemeName): void => {
  persistentBrowserStore.set(THEME_STORAGE_KEY, theme);
};

/**
 * Point the DOM at a theme: set the `data-theme` attribute index.css keys off,
 * and match the browser-chrome color to its background. The no-flash script in
 * index.html does the same before first paint; this keeps them aligned on a
 * runtime switch.
 */
export const applyTheme = (theme: ThemeName): void => {
  document.documentElement.setAttribute("data-theme", theme);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEMES[theme].metaColor);
};
