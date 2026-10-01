import { type AnyRouter } from "@tanstack/react-router";

const AUTH_DEEP_LINK =
  /^compass:\/\/auth\/(?<provider>google|microsoft|apple)\/callback(?<query>\?.*)?$/;

const EVENT_DEEP_LINK = /^compass:\/\/event\/(?<eventId>.+)$/;

type DeepLinkBridge = {
  onDeepLink: (handler: (url: string) => void) => void;
};

export function attachDesktopDeepLink(
  router: AnyRouter,
  bridge: DeepLinkBridge,
): void {
  bridge.onDeepLink((url) => {
    const authMatch = AUTH_DEEP_LINK.exec(url);
    if (authMatch?.groups?.provider) {
      const query = authMatch.groups.query ?? "";
      router.history.replace(
        `/auth/${authMatch.groups.provider}/callback${query}`,
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
