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
