import { type AttendeeResponseStatus } from "@core/types/event-attendance.contracts";
import { type GridEvent } from "@web/common/types/web.event.types";

/** Observer labels for someone else's RSVP — not the user's Going/Maybe/Decline. */
export const ATTENDEE_RSVP_LABEL: Record<AttendeeResponseStatus, string> = {
  accepted: "yes",
  declined: "no",
  tentative: "maybe",
  needsAction: "awaiting",
};

export type GuestResponseRollup = "awaiting" | "tentative" | "declined";

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

/**
 * Grid roll-up when the connected account organizes the event: any guest
 * awaiting → awaiting; else any tentative → tentative; else all declined →
 * declined; otherwise null (all accepted or no guests).
 */
export const guestResponseForEvent = (
  event: Pick<GridEvent, "organizer" | "attendees">,
  accountEmail: string | undefined,
): GuestResponseRollup | null => {
  if (!accountEmail) return null;

  const organizesEvent =
    !event.organizer ||
    event.organizer.email.toLowerCase() === accountEmail.toLowerCase();
  if (!organizesEvent) return null;

  const guests = (event.attendees ?? []).filter(
    (attendee) => attendee.email.toLowerCase() !== accountEmail.toLowerCase(),
  );
  if (guests.length === 0) return null;

  const statuses = guests.map((guest) => guest.responseStatus);
  if (statuses.some((status) => status === "needsAction")) return "awaiting";
  if (statuses.some((status) => status === "tentative")) return "tentative";
  if (statuses.every((status) => status === "declined")) return "declined";
  return null;
};
