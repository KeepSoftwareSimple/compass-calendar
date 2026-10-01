import { type AnyRouter } from "@tanstack/react-router";
import { queryClient } from "@web/api/query-client";
import { ROOT_ROUTES } from "@web/common/constants/routes";
import {
  eventSearchDateString,
  startFocusEventCard,
} from "@web/components/CommandPalette/event-search.util";
import { findEventInCache } from "@web/events/queries/event.query.cache";

const EVENT_DEEP_LINK = /^compass:\/\/event\/(?<eventId>.+)$/;

export function parseDesktopEventDeepLink(
  url: string,
): { eventId: string } | null {
  const match = EVENT_DEEP_LINK.exec(url);
  const eventId = match?.groups?.eventId?.trim();
  if (!eventId) {
    return null;
  }
  return { eventId };
}

/** Opens the calendar to an event after a native notification tap. */
export async function openDesktopEventDeepLink(
  router: AnyRouter,
  eventId: string,
): Promise<void> {
  if (eventId === "compass-notifications-enabled") {
    window.focus();
    return;
  }

  window.focus();

  const event = findEventInCache(queryClient, eventId);
  if (event) {
    await router.navigate({
      to: ROOT_ROUTES.WEEK_DATE,
      params: { dateString: eventSearchDateString(event) },
    });
  }

  startFocusEventCard(eventId);
}
