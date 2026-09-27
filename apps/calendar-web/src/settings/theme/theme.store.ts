import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { IS_DEV } from "@web/common/constants/env.constants";
import { type ThemeName } from "./theme.constants";
import { applyTheme, persistTheme, readStoredTheme } from "./theme.util";

interface ThemeState {
  theme: ThemeName;
}

// Seed from localStorage so the store agrees with the data-theme the no-flash
// script in index.html already applied to <html>.
export const useThemeStore = create<ThemeState>()(
  devtools(() => ({ theme: readStoredTheme() }), {
    name: "compass/theme",
    enabled: IS_DEV,
  }),
);

export const themeActions = {
  setTheme: (theme: ThemeName) => {
    applyTheme(theme);
    persistTheme(theme);
    useThemeStore.setState({ theme }, false, { type: "setTheme" });
  },
};

export const selectTheme = (state: ThemeState) => state.theme;
