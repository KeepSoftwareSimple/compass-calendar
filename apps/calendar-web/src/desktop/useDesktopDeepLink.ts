import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { parseDesktopEventDeepLink } from "@core/desktop/desktop-event-deep-link.util";
import { parseDesktopAuthDeepLink } from "@core/desktop/desktop-oauth-state.util";
import { isDesktop } from "@web/desktop/isDesktop";
import { editGridEventDraft } from "@web/events/grid-event-draft.adapter";
import { findEventInCache } from "@web/events/queries/event.query.cache";
import { draftActions } from "@web/events/stores/draft.store";

/**
 * Forwards compass:// OAuth callbacks into the existing provider callback route
 * so `complete-provider-authorization` runs inside the app web view.
 */
export function useDesktopDeepLink(): void {
  const router = useRouter();
  const queryClient = useQueryClient();

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

      const eventLink = parseDesktopEventDeepLink(url);
      if (!eventLink) {
        return;
      }

      window.focus();
      const sourceEvent = findEventInCache(queryClient, eventLink.eventId);
      if (!sourceEvent) {
        return;
      }
      const draft = editGridEventDraft(sourceEvent);
      if (!draft) {
        return;
      }
      draftActions.startGridDraft({ activity: "keyboardEdit", draft });
      draftActions.setFormOpen(true);
    });
  }, [queryClient, router]);
}
