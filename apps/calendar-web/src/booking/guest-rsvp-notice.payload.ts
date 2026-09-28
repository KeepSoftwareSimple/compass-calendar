import { type AttendeeResponseStatus } from "@core/types/event-attendance.contracts";

export type GuestRsvpReplyStatus = Extract<
  AttendeeResponseStatus,
  "accepted" | "declined" | "tentative"
>;

export type GuestRsvpReplyChange = {
  guestDisplayName: string;
  responseStatus: GuestRsvpReplyStatus;
  /** ISO instant or date-only anchor for when copy and Show navigation. */
  whenAnchor: string;
};

export type GuestRsvpNoticePayload = {
  count: number;
  latest: GuestRsvpReplyChange;
};
