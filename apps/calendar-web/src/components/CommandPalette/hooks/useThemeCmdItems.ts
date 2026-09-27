import { MoonStarsIcon } from "@phosphor-icons/react/dist/csr/MoonStars";
import { SunIcon } from "@phosphor-icons/react/dist/csr/Sun";
import { type CommandItem } from "@web/components/CommandPalette/command-palette.types";
import {
  selectTheme,
  themeActions,
  useThemeStore,
} from "@web/settings/theme/theme.store";

/**
 * A single toggle that switches to the other theme. Two themes exist today,
 * so "the other one" is a plain ternary — revisit if a third theme lands.
 */
export function useThemeCmdItems(): CommandItem[] {
  const activeTheme = useThemeStore(selectTheme);
  const isDark = activeTheme === "dark-abyss";

  return [
    {
      id: "toggle-theme",
      label: isDark ? "Switch to light theme" : "Switch to dark theme",
      icon: isDark ? SunIcon : MoonStarsIcon,
      keywords: ["theme", "dark mode", "light mode", "appearance"],
      onClick: () =>
        themeActions.setTheme(isDark ? "light-beach" : "dark-abyss"),
    },
  ];
}
