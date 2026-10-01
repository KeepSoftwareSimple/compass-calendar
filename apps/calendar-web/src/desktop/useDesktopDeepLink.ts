import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  parseDesktopAuthDeepLink,
  parseDesktopEventDeepLink,
} from "@core/desktop/desktop-deep-link.util";
import { isDesktop } from "@web/desktop/isDesktop";

/**
 * Forwards compass:// OAuth callbacks into the existing provider callback route
 * so `complete-provider-authorization` runs inside the app web view, and focuses
 * the event behind a tapped native notification.
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
        router.history.replace(`/auth/${auth.provider}/callback${auth.query}`);
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
