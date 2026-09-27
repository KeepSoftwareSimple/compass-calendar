import { type Calendar } from "@core/types/calendar.contracts";
import {
  BOOKING_APPLE_DESTINATION_HINT,
  BOOKING_CONFERENCE_INVITE_COPY,
  bookingDestinationConferenceHint,
  formatBookingDestinationOptionLabel,
  formatBookingDurationWithConference,
  resolveBookingConference,
} from "@web/booking/booking-conference.copy";
import { describe, expect, it } from "bun:test";

const calendar = (overrides: Partial<Calendar> = {}): Calendar =>
  ({
    id: "000000000000000000000001",
    name: "Personal",
    description: "",
    timeZone: "UTC",
    foregroundColor: "#000000",
    backgroundColor: "#9e9e9e",
    provider: "google",
    access: "owner",
    capabilities: {
      canReadAvailability: true,
      canReadDetails: true,
      canWrite: true,
      canManage: true,
      canWatchEvents: true,
      canInviteAttendees: true,
      conferenceKinds: [],
    },
    isPrimary: false,
    isVisible: true,
    isActive: true,
    ...overrides,
  }) as Calendar;

describe("booking conference copy", () => {
  it("formats duration without a conference suffix for none", () => {
    expect(formatBookingDurationWithConference("30 minutes", "none")).toBe(
      "30 minutes",
    );
  });

  it("formats duration with the product name for Meet and Teams", () => {
    expect(formatBookingDurationWithConference("30 minutes", "meet")).toBe(
      "30 minutes Google Meet",
    );
    expect(formatBookingDurationWithConference("30 minutes", "teams")).toBe(
      "30 minutes Microsoft Teams",
    );
  });

  it("labels an Apple destination with No video link in the chooser", () => {
    expect(
      formatBookingDestinationOptionLabel(
        calendar({ provider: "apple", conference: "none" }),
      ),
    ).toBe("Personal (No video link)");
  });

  it("labels a Google destination with Google Meet in the chooser", () => {
    expect(formatBookingDestinationOptionLabel(calendar())).toBe(
      "Personal (Google Meet)",
    );
  });

  it("labels a Microsoft destination with Microsoft Teams in the chooser", () => {
    expect(
      formatBookingDestinationOptionLabel(
        calendar({ provider: "microsoft", conference: "teams" }),
      ),
    ).toBe("Personal (Microsoft Teams)");
  });

  it("shows the iCloud hint for an Apple destination without video", () => {
    expect(
      bookingDestinationConferenceHint(
        calendar({ provider: "apple", conference: "none" }),
      ),
    ).toBe(BOOKING_APPLE_DESTINATION_HINT);
  });

  it("uses guest none-branch invite copy on confirmation", () => {
    expect(BOOKING_CONFERENCE_INVITE_COPY.none).toBe(
      "The calendar invite is on its way to your email.",
    );
  });

  it("resolves legacy createsGoogleMeet false to none", () => {
    expect(resolveBookingConference(undefined, false)).toBe("none");
  });
});
