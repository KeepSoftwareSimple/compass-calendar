import {
  type AttendeeResponseStatus,
  type RsvpResponseStatus,
  RsvpResponseStatusSchema,
} from "@core/types/event-attendance.contracts";

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
  status: RsvpResponseStatus;
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
    const reply = RsvpResponseStatusSchema.safeParse(attendee.responseStatus);
    if (attendee.responseStatus === previousStatus || !reply.success) {
      continue;
    }

    const guestName =
      attendee.displayName?.trim() || attendee.email.trim() || emailLower;
    replies.push({
      guestEmailLower: emailLower,
      guestName,
      status: reply.data,
      slotStart: after.slotStart,
    });
  }

  return replies;
};
