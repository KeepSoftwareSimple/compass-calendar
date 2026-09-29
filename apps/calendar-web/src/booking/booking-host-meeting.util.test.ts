import { formatHostMeetingWhen } from "@web/booking/booking-host-meeting.util";
import { describe, expect, it } from "bun:test";

describe("formatHostMeetingWhen", () => {
  it("formats the slot in the host timezone", () => {
    expect(
      formatHostMeetingWhen("2026-09-24T17:00:00.000Z", "America/Chicago"),
    ).toBe("Thu, Sep 24, 12:00 PM");
  });
});
