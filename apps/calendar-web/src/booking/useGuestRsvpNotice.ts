import {
  type QueryClient,
  type QueryKey,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { type Event } from "@core/types/event.contracts";
import { type AttendeeResponseStatus } from "@core/types/event-attendance.contracts";
import { useSession } from "@web/auth/compass/session/useSession";
import { showGuestRsvpToast } from "@web/booking/GuestRsvpToast";
import {
  type GuestRsvpNoticePayload,
  type GuestRsvpReplyChange,
  type GuestRsvpReplyStatus,
} from "@web/booking/guest-rsvp-notice.payload";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import {
  attendeeStatusByEmail,
  hostOrganizesEvent,
} from "@web/events/attendee-rsvp";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import { type NormalizedEventQueryData } from "@web/events/queries/event.query.types";

type GuestStatusSnapshot = Map<string, AttendeeResponseStatus>;

const eventGuestStatuses = new Map<string, GuestStatusSnapshot>();

let pendingChanges: GuestRsvpReplyChange[] = [];
let flushScheduled = false;

export function resetGuestRsvpNoticeForTests(): void {
  eventGuestStatuses.clear();
  pendingChanges = [];
  flushScheduled = false;
}

const REPLY_STATUSES: ReadonlySet<GuestRsvpReplyStatus> = new Set([
  "accepted",
  "declined",
  "tentative",
]);

function isGuestRsvpReplyStatus(
  status: AttendeeResponseStatus,
): status is GuestRsvpReplyStatus {
  return REPLY_STATUSES.has(status as GuestRsvpReplyStatus);
}

function isEventListQueryKey(
  queryKey: QueryKey,
): queryKey is readonly ["events", "day" | "week", ...unknown[]] {
  return (
    Array.isArray(queryKey) &&
    queryKey[0] === eventQueryKeys.all[0] &&
    (queryKey[1] === "day" || queryKey[1] === "week")
  );
}

function guestDisplayName(
  attendees: ReadonlyArray<{
    email: string;
    displayName?: string | null;
  }>,
  email: string,
): string {
  const match = attendees.find(
    (attendee) => attendee.email.toLowerCase() === email.toLowerCase(),
  );
  const trimmed = match?.displayName?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : email;
}

function whenAnchorForEvent(event: Event): string | null {
  if (event.schedule.kind === "timed") {
    return event.schedule.start;
  }
  if (event.schedule.kind === "allDay") {
    return event.schedule.start;
  }
  return null;
}

function guestStatusMapForOrganizerEvent(
  event: Event,
  accountEmail: string,
): GuestStatusSnapshot | null {
  if (event.content.kind !== "details") {
    return null;
  }
  const attendees = event.content.attendees ?? [];
  const accountLower = accountEmail.toLowerCase();
  const guests = attendees.filter(
    (attendee) => attendee.email.toLowerCase() !== accountLower,
  );
  return new Map(
    [...attendeeStatusByEmail(guests)].map(([email, status]) => [
      email,
      status,
    ]),
  );
}

function detectReplyChanges(
  event: Event,
  accountEmail: string,
  previous: GuestStatusSnapshot | undefined,
): GuestRsvpReplyChange[] {
  if (event.content.kind !== "details") {
    return [];
  }
  const current = guestStatusMapForOrganizerEvent(event, accountEmail);
  if (!current) {
    return [];
  }

  if (previous === undefined) {
    eventGuestStatuses.set(event.id, current);
    return [];
  }

  const changes: GuestRsvpReplyChange[] = [];
  const attendees = event.content.attendees ?? [];
  for (const [email, nextStatus] of current) {
    const priorStatus = previous.get(email) ?? "needsAction";
    if (isGuestRsvpReplyStatus(nextStatus) && nextStatus !== priorStatus) {
      const whenAnchor = whenAnchorForEvent(event);
      if (whenAnchor === null) {
        continue;
      }
      changes.push({
        guestDisplayName: guestDisplayName(attendees, email),
        responseStatus: nextStatus,
        whenAnchor,
      });
    }
  }

  eventGuestStatuses.set(event.id, current);
  return changes;
}

function scheduleFlush(): void {
  if (flushScheduled) {
    return;
  }
  flushScheduled = true;
  queueMicrotask(() => {
    flushScheduled = false;
    if (pendingChanges.length === 0) {
      return;
    }
    const changes = pendingChanges;
    pendingChanges = [];
    const latest = changes[changes.length - 1];
    if (!latest) {
      return;
    }
    const payload: GuestRsvpNoticePayload = {
      count: changes.length,
      latest,
    };
    showGuestRsvpToast(payload);
  });
}

function accountEmailForEvent(
  queryClient: QueryClient,
  event: Event,
): string | undefined {
  const calendars = queryClient.getQueryData<
    ReadonlyArray<{ id: string; accountEmail?: string | null }>
  >(calendarQueryKeys.all);
  return (
    calendars?.find((calendar) => calendar.id === event.calendarId)
      ?.accountEmail ?? undefined
  );
}

function processEventListData(
  queryClient: QueryClient,
  data: NormalizedEventQueryData,
): void {
  for (const id of data.ids) {
    const event = data.entities[id];
    if (!event) {
      continue;
    }
    const accountEmail = accountEmailForEvent(queryClient, event);
    if (accountEmail === undefined || event.content.kind !== "details") {
      continue;
    }
    if (!hostOrganizesEvent(event.content, accountEmail)) {
      continue;
    }
    const previous = eventGuestStatuses.get(event.id);
    const changes = detectReplyChanges(event, accountEmail, previous);
    if (changes.length > 0) {
      pendingChanges.push(...changes);
      scheduleFlush();
    }
  }
}

function handleQueryCacheUpdate(
  queryClient: QueryClient,
  queryKey: QueryKey,
  queryState: { status: string; data: unknown },
): void {
  if (queryState.status !== "success" || !isEventListQueryKey(queryKey)) {
    return;
  }
  processEventListData(
    queryClient,
    queryState.data as NormalizedEventQueryData,
  );
}

export function useGuestRsvpNotice(): void {
  const { authenticated } = useSession();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!authenticated) {
      return;
    }

    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated") {
        return;
      }
      handleQueryCacheUpdate(
        queryClient,
        event.query.queryKey,
        event.query.state,
      );
    });
  }, [authenticated, queryClient]);
}
