import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { parseDesktopAuthDeepLink } from "@core/desktop/desktop-oauth-state.util";
import { isDesktop } from "@web/desktop/isDesktop";
import {
  openDesktopEventDeepLink,
  parseDesktopEventDeepLink,
} from "@web/desktop/open-desktop-event-deep-link";

/**
 * Forwards compass:// OAuth callbacks into the existing provider callback route
 * so `complete-provider-authorization` runs inside the app web view.
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
      const parsed = parseDesktopAuthDeepLink(url);
      if (parsed) {
        router.history.replace(
          `/auth/${parsed.provider}/callback${parsed.query}`,
        );
        return;
      }

      const eventLink = parseDesktopEventDeepLink(url);
      if (eventLink) {
        void openDesktopEventDeepLink(router, eventLink.eventId);
      }
    });
  }, [router]);
}
