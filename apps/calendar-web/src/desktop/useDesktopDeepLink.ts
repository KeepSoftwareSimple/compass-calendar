import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { isDesktop } from "@web/desktop/isDesktop";
import {
  openDesktopEventDeepLink,
  parseDesktopEventDeepLink,
} from "@web/desktop/open-desktop-event-deep-link";

const AUTH_DEEP_LINK =
  /^compass:\/\/auth\/(?<provider>google|microsoft|apple)\/callback(?<query>\?.*)?$/;

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
      const authMatch = AUTH_DEEP_LINK.exec(url);
      if (authMatch?.groups?.provider) {
        const query = authMatch.groups.query ?? "";
        router.history.replace(
          `/auth/${authMatch.groups.provider}/callback${query}`,
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
