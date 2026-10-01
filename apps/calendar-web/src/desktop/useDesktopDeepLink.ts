import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { isDesktop } from "@web/desktop/isDesktop";

export function useDesktopDeepLink(): void {
  const router = useRouter();

  useEffect(() => {
    if (!isDesktop()) {
      return;
    }

    const bridge = window.compassDesktop;
    if (!bridge) {
      return;
    }

    let cancelled = false;
    void import("./desktop-deep-link").then((module) => {
      if (cancelled) return;
      module.attachDesktopDeepLink(router, bridge);
    });

    return () => {
      cancelled = true;
    };
  }, [router]);
}
