import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { isDesktop } from "@web/desktop/isDesktop";

/**
 * Forwards compass:// OAuth callbacks into the existing provider callback route
 * so `complete-provider-authorization` runs inside the app web view.
 */
export function useDesktopDeepLink(): void {
  const router = useRouter();

  useEffect(() => {
    if (!isDesktop()) return;

    const bridge = window.compassDesktop;
    if (!bridge) return;

    let cancelled = false;
    void import("./desktop-deep-link").then((m) => {
      if (!cancelled) m.attachDesktopDeepLink(router, bridge);
    });

    return () => {
      cancelled = true;
    };
  }, [router]);
}
