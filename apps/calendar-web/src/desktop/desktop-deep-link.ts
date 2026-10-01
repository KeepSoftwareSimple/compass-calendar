import { type AnyRouter } from "@tanstack/react-router";
import { parseDesktopAuthDeepLink } from "@core/desktop/desktop-oauth-state.util";

const EVENT_DEEP_LINK = /^compass:\/\/event\/(?<eventId>.+)$/;

type DeepLinkBridge = {
  onDeepLink: (handler: (url: string) => void) => void;
};

export function attachDesktopDeepLink(
  router: AnyRouter,
  bridge: DeepLinkBridge,
): void {
  bridge.onDeepLink((url) => {
    const parsed = parseDesktopAuthDeepLink(url);
    if (parsed) {
      router.history.replace(
        `/auth/${parsed.provider}/callback${parsed.query}`,
      );
      return;
    }

    const eventMatch = EVENT_DEEP_LINK.exec(url);
    const eventId = eventMatch?.groups?.eventId?.trim();
    if (eventId) {
      window.focus();
      void import("@web/components/CommandPalette/event-search.util").then(
        (m) => m.startFocusEventCard(eventId),
      );
    }
  });
}
