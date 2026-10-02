import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  parseDesktopAuthDeepLink,
  parseDesktopDayDeepLink,
  parseDesktopEventDeepLink,
} from "@core/desktop/desktop-oauth-state.util";
import { ROOT_ROUTES } from "@web/common/constants/routes";
import { isDesktop } from "@web/desktop/isDesktop";

function reportDesktopDeepLinkNavigation(path: string): void {
  window.compassDesktop?.reportDeepLinkNavigation?.(path);
}

/**
 * Forwards compass:// OAuth callbacks into the existing provider callback route
 * so `complete-provider-authorization` runs inside the app web view, focuses
 * the event behind a tapped native notification, and opens day view links.
 */
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

    return bridge.onDeepLink((url) => {
      const auth = parseDesktopAuthDeepLink(url);
      if (auth) {
        const path = `/auth/${auth.provider}/callback${auth.query}`;
        router.history.replace(path);
        reportDesktopDeepLinkNavigation(path);
        return;
      }

      const day = parseDesktopDayDeepLink(url);
      if (day) {
        window.focus();
        const path = `${ROOT_ROUTES.DAY}/${day}`;
        router.history.replace(path);
        reportDesktopDeepLinkNavigation(path);
        return;
      }

      const eventId = parseDesktopEventDeepLink(url);
      if (eventId) {
        window.focus();
        void import("@web/components/CommandPalette/event-search.util").then(
          (m) => m.startFocusEventCard(eventId),
        );
      }
    });
  }, [router]);
}
