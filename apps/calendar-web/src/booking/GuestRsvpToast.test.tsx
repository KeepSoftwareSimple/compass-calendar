import { guestRsvpToastCopy } from "@web/booking/GuestRsvpToast";
import { describe, expect, it } from "bun:test";

describe("guestRsvpToastCopy", () => {
  const latest = {
    guestName: "Jen",
    status: "accepted" as const,
    slotStart: "2026-11-23T18:00:00.000Z",
  };

  it("labels the when clause as the meeting", () => {
    expect(guestRsvpToastCopy(1, latest, "America/Denver", false)).toBe(
      "Jen accepted (meeting Mon, Nov 23, 11:00 AM)",
    );
  });

  it("prefixes while you were away on a single reply", () => {
    expect(guestRsvpToastCopy(1, latest, "America/Denver", true)).toBe(
      "While you were away: Jen accepted (meeting Mon, Nov 23, 11:00 AM)",
    );
  });

  it("uses plural since-you-last-looked copy", () => {
    expect(guestRsvpToastCopy(2, latest, "America/Denver", false)).toBe(
      "2 guests replied since you last looked. Latest: Jen accepted (meeting Mon, Nov 23, 11:00 AM)",
    );
  });
});
