import { type CalendarConference } from "@core/types/calendar.contracts";

export const BOOKING_CONFERENCE_INVITE_COPY: Record<
  CalendarConference,
  string
> = {
  meet: "A Google Meet invite is on its way to your email.",
  teams: "A Microsoft Teams invite is on its way to your email.",
  none: "The calendar invite is on its way to your email.",
};

const BOOKING_CONFERENCE_DURATION_SUFFIX: Record<CalendarConference, string> = {
  meet: " Google Meet",
  teams: " Microsoft Teams",
  none: "",
};

export function formatBookingDurationWithConference(
  durationLabel: string,
  conference: CalendarConference,
): string {
  return `${durationLabel}${BOOKING_CONFERENCE_DURATION_SUFFIX[conference]}`;
}

export function resolveBookingConference(
  conference?: CalendarConference,
  createsGoogleMeet?: boolean,
): CalendarConference {
  if (conference !== undefined) {
    return conference;
  }
  return createsGoogleMeet === false ? "none" : "meet";
}
