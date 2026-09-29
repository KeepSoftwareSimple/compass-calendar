import { type Event } from "@core/types/event.contracts";
import { type AttendeeResponseStatus } from "@core/types/event-attendance.contracts";

/** Observer labels for someone else's RSVP — not the user's Going/Maybe/Decline. */
export const ATTENDEE_RSVP_LABEL: Record<AttendeeResponseStatus, string> = {
  accepted: "yes",
  declined: "no",
  tentative: "maybe",
  needsAction: "awaiting",
};

export const attendeeStatusByEmail = (
  attendees:
    | ReadonlyArray<{ email: string; responseStatus: AttendeeResponseStatus }>
    | undefined,
): ReadonlyMap<string, AttendeeResponseStatus> => {
  const map = new Map<string, AttendeeResponseStatus>();
  for (const attendee of attendees ?? []) {
    map.set(attendee.email.toLowerCase(), attendee.responseStatus);
  }
  return map;
};

export const statusForEmail = (
  statusByEmail: ReadonlyMap<string, AttendeeResponseStatus> | undefined,
  email: string,
): AttendeeResponseStatus =>
  statusByEmail?.get(email.toLowerCase()) ?? "needsAction";

/**
 * `{n} guest(s) ({yes} yes, {awaiting} awaiting)` plus `, {n} no` /
 * `, {n} maybe` only when those counts are greater than zero.
 */
export const formatAttendeeRsvpTally = (
  statuses: readonly AttendeeResponseStatus[],
): string => {
  const counts: Record<AttendeeResponseStatus, number> = {
    accepted: 0,
    declined: 0,
    tentative: 0,
    needsAction: 0,
  };
  for (const status of statuses) {
    counts[status] += 1;
  }

  const guestWord = statuses.length === 1 ? "guest" : "guests";
  const parts = [`${counts.accepted} yes`, `${counts.needsAction} awaiting`];
  if (counts.declined > 0) parts.push(`${counts.declined} no`);
  if (counts.tentative > 0) parts.push(`${counts.tentative} maybe`);

  return `${statuses.length} ${guestWord} (${parts.join(", ")})`;
};

export type GridGuestResponseState = "awaiting" | "tentative" | "declined";

/**
 * Roll-up of guest RSVP states for grid cards when the connected calendar
 * account organizes the event. Self is excluded from the guest list.
 */
export const hostOrganizesEvent = (
  event: { organizer?: { email: string } | null },
  accountEmail: string,
): boolean => {
  const organizerEmail = event.organizer?.email;
  return (
    organizerEmail === undefined ||
    organizerEmail.toLowerCase() === accountEmail.toLowerCase()
  );
};

/**
 * Per-guest RSVP statuses for host reply toasts: organized events only, every
 * connected account email excluded from the guest set.
 */
export const guestStatusMapForHostNotice = (
  event: Event,
  connectedAccountEmails: readonly string[],
): ReadonlyMap<string, AttendeeResponseStatus> | null => {
  if (connectedAccountEmails.length === 0) return null;
  if (event.content.kind !== "details") return null;

  const hostOrganizes = connectedAccountEmails.some((email) =>
    hostOrganizesEvent({ organizer: event.content.organizer ?? null }, email),
  );
  if (!hostOrganizes) return null;

  const excluded = new Set(
    connectedAccountEmails.map((email) => email.toLowerCase()),
  );
  const guests = (event.content.attendees ?? []).filter(
    (attendee) => !excluded.has(attendee.email.toLowerCase()),
  );
  if (guests.length === 0) return null;

  return attendeeStatusByEmail(guests);
};

export const guestResponseForEvent = (
  event: {
    organizer?: { email: string } | null;
    attendees?:
      | ReadonlyArray<{ email: string; responseStatus: AttendeeResponseStatus }>
      | undefined;
  },
  accountEmail: string | undefined,
): GridGuestResponseState | null => {
  if (accountEmail === undefined) return null;

  if (!hostOrganizesEvent(event, accountEmail)) return null;

  const accountLower = accountEmail.toLowerCase();
  const guests = (event.attendees ?? []).filter(
    (attendee) => attendee.email.toLowerCase() !== accountLower,
  );
  if (guests.length === 0) return null;

  if (guests.some((guest) => guest.responseStatus === "needsAction")) {
    return "awaiting";
  }
  if (guests.some((guest) => guest.responseStatus === "tentative")) {
    return "tentative";
  }
  if (guests.every((guest) => guest.responseStatus === "declined")) {
    return "declined";
  }
  return null;
};
