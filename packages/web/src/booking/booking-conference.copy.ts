import {
  type Calendar,
  type CalendarConference,
  type CalendarProvider,
  CONFERENCE_KIND_LABEL,
} from "@core/types/calendar.contracts";

export const BOOKING_CONFERENCE_INVITE_COPY: Record<
  CalendarConference,
  string
> = {
  meet: "A Google Meet invite is on its way to your email.",
  teams: "A Microsoft Teams invite is on its way to your email.",
  none: "The calendar invite is on its way to your email.",
};

export const BOOKING_DESTINATION_NO_VIDEO_SUFFIX = "No video link";

export const BOOKING_APPLE_DESTINATION_HINT =
  "Meetings on an iCloud calendar are created without a video link. Add one in the meeting notes if you need it.";

const BOOKING_NO_VIDEO_LINK_WARNING =
  "This calendar cannot create a video meeting link. Guests will get a calendar invite without a meeting URL.";

export const BOOKING_NO_CONFERENCE_WARNING: Record<CalendarProvider, string> = {
  local: BOOKING_NO_VIDEO_LINK_WARNING,
  google:
    "This calendar cannot create a Google Meet link. Guests will get a calendar invite without a Meet URL.",
  microsoft:
    "This calendar cannot create a Microsoft Teams link. Guests will get a calendar invite without a Teams URL.",
  apple: BOOKING_NO_VIDEO_LINK_WARNING,
};

const conferenceDurationSuffix = (conference: CalendarConference): string =>
  conference === "none" ? "" : ` ${CONFERENCE_KIND_LABEL[conference]}`;

export function formatBookingDurationWithConference(
  durationLabel: string,
  conference: CalendarConference,
): string {
  return `${durationLabel}${conferenceDurationSuffix(conference)}`;
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

const bookingCalendarConference = (calendar: Calendar): CalendarConference =>
  resolveBookingConference(calendar.conference, calendar.createsGoogleMeet);

export function formatBookingDestinationOptionLabel(
  calendar: Calendar,
): string {
  const conference = bookingCalendarConference(calendar);
  if (conference === "none") {
    if (calendar.provider === "apple") {
      return `${calendar.name} (${BOOKING_DESTINATION_NO_VIDEO_SUFFIX})`;
    }
    return calendar.name;
  }
  return `${calendar.name} (${CONFERENCE_KIND_LABEL[conference]})`;
}

export function bookingDestinationConferenceHint(
  calendar: Calendar,
): string | null {
  const conference = bookingCalendarConference(calendar);
  if (conference === "none") {
    return calendar.provider === "apple"
      ? BOOKING_APPLE_DESTINATION_HINT
      : BOOKING_NO_CONFERENCE_WARNING[calendar.provider];
  }
  return null;
}
