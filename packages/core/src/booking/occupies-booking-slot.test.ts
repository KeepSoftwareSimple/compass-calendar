import { occupiesBookingSlot } from "@core/booking/occupies-booking-slot";
import { describe, expect, it } from "bun:test";

describe("occupiesBookingSlot", () => {
  it("treats a host-organized interval as occupying", () => {
    expect(
      occupiesBookingSlot({
        hostIsOrganizer: true,
        hostResponseStatus: null,
      }),
    ).toBe(true);
  });

  it("treats an accepted invite as occupying", () => {
    expect(
      occupiesBookingSlot({
        hostIsOrganizer: false,
        hostResponseStatus: "accepted",
      }),
    ).toBe(true);
  });

  it.each(["needsAction", "declined", "tentative"] as const)(
    "does not occupy a %s invite",
    (hostResponseStatus) => {
      expect(
        occupiesBookingSlot({
          hostIsOrganizer: false,
          hostResponseStatus,
        }),
      ).toBe(false);
    },
  );

  it("occupies a legacy interval that has no RSVP facts", () => {
    expect(occupiesBookingSlot({})).toBe(true);
  });
});
