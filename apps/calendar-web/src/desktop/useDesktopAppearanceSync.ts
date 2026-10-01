import { useEffect } from "react";
import { type DesktopBridgeThemeName } from "@core/types/desktop-bridge.contracts";
import { isDesktop } from "@web/desktop/isDesktop";
import { selectTheme, useThemeStore } from "@web/settings/theme/theme.store";

function syncNativeAppearance(theme: DesktopBridgeThemeName): void {
  window.compassDesktop?.setAppearance?.(theme);
}

/** Keeps NSApp window chrome aligned with the web theme setting. */
export function useDesktopAppearanceSync(): void {
  const theme = useThemeStore(selectTheme);

  useEffect(() => {
    if (!isDesktop()) return;
    syncNativeAppearance(theme);
  }, [theme]);
}
