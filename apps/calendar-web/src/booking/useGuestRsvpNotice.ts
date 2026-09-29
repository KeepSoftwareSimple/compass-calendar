import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { type Event } from "@core/types/event.contracts";
import { type AttendeeResponseStatus } from "@core/types/event-attendance.contracts";
import { useSession } from "@web/auth/compass/session/useSession";
import {
  type GuestRsvpReplyNotice,
  showGuestRsvpToast,
} from "@web/booking/GuestRsvpToast";
import { useConnectedAccountEmails } from "@web/calendars/useDefaultTargetCalendar";
import { IS_BOOKING_ENABLED } from "@web/common/constants/env.constants";
import { guestStatusMapForHostNotice } from "@web/events/attendee-rsvp";
import { isEventQueryKey } from "@web/events/queries/event.query.cache";
import { type NormalizedEventQueryData } from "@web/events/queries/event.query.types";

const REPLY_STATUSES: ReadonlySet<AttendeeResponseStatus> = new Set([
  "accepted",
  "declined",
  "tentative",
]);

const cachedGuestStatusByEventId = new Map<
  string,
  Map<string, AttendeeResponseStatus>
>();

let pendingReplies: GuestRsvpReplyNotice[] = [];
let flushScheduled = false;

export function resetGuestRsvpNoticeForTests(): void {
  cachedGuestStatusByEventId.clear();
  pendingReplies = [];
  flushScheduled = false;
}

function scheduleToastFlush(): void {
  if (flushScheduled) {
    return;
  }
  flushScheduled = true;
  queueMicrotask(() => {
    flushScheduled = false;
    if (pendingReplies.length === 0) {
      return;
    }
    const batch = pendingReplies;
    pendingReplies = [];
    showGuestRsvpToast(batch);
  });
}

function guestDisplayName(event: Event, emailLower: string): string {
  if (event.content.kind !== "details") {
    return emailLower;
  }
  const attendee = event.content.attendees?.find(
    (entry) => entry.email.toLowerCase() === emailLower,
  );
  const name = attendee?.displayName?.trim();
  return name && name.length > 0 ? name : (attendee?.email ?? emailLower);
}

function processEvent(
  event: Event,
  connectedAccountEmails: readonly string[],
): void {
  const currentMap = guestStatusMapForHostNotice(event, connectedAccountEmails);
  if (!currentMap) {
    cachedGuestStatusByEventId.delete(event.id);
    return;
  }

  const previousMap = cachedGuestStatusByEventId.get(event.id);
  if (!previousMap) {
    cachedGuestStatusByEventId.set(
      event.id,
      new Map([...currentMap.entries()]),
    );
    return;
  }

  const slotStart = event.schedule.start;

  for (const [emailLower, status] of currentMap) {
    const previousStatus = previousMap.get(emailLower) ?? "needsAction";
    if (status !== previousStatus && REPLY_STATUSES.has(status)) {
      pendingReplies.push({
        guestName: guestDisplayName(event, emailLower),
        status,
        slotStart,
      });
    }
  }

  cachedGuestStatusByEventId.set(event.id, new Map([...currentMap.entries()]));
  if (pendingReplies.length > 0) {
    scheduleToastFlush();
  }
}

function processNormalizedEvents(
  entities: NormalizedEventQueryData["entities"],
  connectedAccountEmails: readonly string[],
): void {
  for (const event of Object.values(entities)) {
    processEvent(event, connectedAccountEmails);
  }
}

export function useGuestRsvpNotice(): void {
  const { authenticated } = useSession();
  const queryClient = useQueryClient();
  const connectedAccountEmails = useConnectedAccountEmails();

  useEffect(() => {
    if (!IS_BOOKING_ENABLED || !authenticated) {
      return;
    }

    return queryClient.getQueryCache().subscribe((notifyEvent) => {
      if (notifyEvent.type !== "updated") {
        return;
      }
      if (!isEventQueryKey(notifyEvent.query.queryKey)) {
        return;
      }
      const { status, data } = notifyEvent.query.state;
      if (status !== "success" || data === undefined) {
        return;
      }
      processNormalizedEvents(
        (data as NormalizedEventQueryData).entities,
        connectedAccountEmails,
      );
    });
  }, [authenticated, connectedAccountEmails, queryClient]);
}
