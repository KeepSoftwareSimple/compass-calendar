import { useEffect } from "react";
import { isDesktop } from "@web/desktop/isDesktop";
import { selectTheme, useThemeStore } from "@web/settings/theme/theme.store";

/** Keeps native window chrome aligned with the in-app theme. */
export function useDesktopAppearance(): void {
  const theme = useThemeStore(selectTheme);

  useEffect(() => {
    if (!isDesktop()) {
      return;
    }
    window.compassDesktop?.setAppearance?.(theme);
  }, [theme]);
}
