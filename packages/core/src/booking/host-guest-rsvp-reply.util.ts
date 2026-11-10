import { type AttendeeResponseStatus } from "@core/types/event-attendance.contracts";

export const HOST_GUEST_RSVP_REPLY_STATUSES: ReadonlySet<AttendeeResponseStatus> =
  new Set(["accepted", "declined", "tentative"]);

export type HostGuestRsvpAttendeeSlice = {
  email: string;
  displayName: string | null;
  responseStatus: AttendeeResponseStatus;
};

export type HostGuestRsvpEventSlice = {
  organizer?: { email: string } | null;
  attendees: readonly HostGuestRsvpAttendeeSlice[];
  slotStart: string;
};

export type DetectedHostGuestRsvpReply = {
  guestEmailLower: string;
  guestName: string;
  status: AttendeeResponseStatus;
  slotStart: string;
};

const hostOrganizesEvent = (
  organizer: { email: string } | null | undefined,
  accountEmailLower: string,
): boolean => {
  const organizerEmail = organizer?.email.trim().toLowerCase();
  return organizerEmail === undefined || organizerEmail === accountEmailLower;
};

/**
 * Guest replies the host should be notified about: organized events only,
 * excluding the connection account email from the guest set.
 */
export const detectHostGuestRsvpReplies = (
  before: HostGuestRsvpEventSlice | null,
  after: HostGuestRsvpEventSlice,
  accountEmail: string,
): DetectedHostGuestRsvpReply[] => {
  if (!before) {
    return [];
  }
  const accountLower = accountEmail.trim().toLowerCase();
  if (!hostOrganizesEvent(after.organizer, accountLower)) {
    return [];
  }

  const beforeByEmail = new Map<string, AttendeeResponseStatus>();
  if (before && hostOrganizesEvent(before.organizer, accountLower)) {
    for (const attendee of before.attendees) {
      const emailLower = attendee.email.trim().toLowerCase();
      if (emailLower === accountLower) continue;
      beforeByEmail.set(emailLower, attendee.responseStatus);
    }
  }

  const replies: DetectedHostGuestRsvpReply[] = [];
  for (const attendee of after.attendees) {
    const emailLower = attendee.email.trim().toLowerCase();
    if (emailLower === accountLower) continue;

    const previousStatus = beforeByEmail.get(emailLower) ?? "needsAction";
    if (
      attendee.responseStatus === previousStatus ||
      !HOST_GUEST_RSVP_REPLY_STATUSES.has(attendee.responseStatus)
    ) {
      continue;
    }

    const guestName =
      attendee.displayName?.trim() || attendee.email.trim() || emailLower;
    replies.push({
      guestEmailLower: emailLower,
      guestName,
      status: attendee.responseStatus,
      slotStart: after.slotStart,
    });
  }

  return replies;
};
