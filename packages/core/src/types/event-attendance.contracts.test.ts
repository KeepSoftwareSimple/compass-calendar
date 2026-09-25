import {
  AttendeeInputSchema,
  RsvpResponseStatusSchema,
  uniqueAttendeeEmails,
} from "@core/types/event-attendance.contracts";

describe("Event attendance contracts", () => {
  describe("AttendeeInputSchema", () => {
    const base = { email: "ada@example.com", displayName: "Ada Lovelace" };

    it("accepts an email with a display name", () => {
      expect(AttendeeInputSchema.safeParse(base).success).toBe(true);
    });

    it("accepts a null display name", () => {
      const input = { ...base, displayName: null };

      expect(AttendeeInputSchema.safeParse(input).success).toBe(true);
    });

    it("trims surrounding whitespace", () => {
      const input = { email: " ada@example.com ", displayName: " Ada " };
      const parsed = AttendeeInputSchema.parse(input);

      expect(parsed).toStrictEqual({
        email: "ada@example.com",
        displayName: "Ada",
      });
    });

    it("rejects an empty email", () => {
      const input = { ...base, email: "  " };

      expect(AttendeeInputSchema.safeParse(input).success).toBe(false);
    });

    it("rejects an email over 320 characters", () => {
      const input = { ...base, email: `${"a".repeat(320)}@example.com` };

      expect(AttendeeInputSchema.safeParse(input).success).toBe(false);
    });

    it("rejects a responseStatus key — callers never set another person's RSVP", () => {
      const input = { ...base, responseStatus: "accepted" };

      expect(AttendeeInputSchema.safeParse(input).success).toBe(false);
    });

    it("rejects unknown keys", () => {
      const input = { ...base, optional: true };

      expect(AttendeeInputSchema.safeParse(input).success).toBe(false);
    });
  });

  describe("uniqueAttendeeEmails", () => {
    it("accepts an empty list", () => {
      expect(uniqueAttendeeEmails([])).toBe(true);
    });

    it("accepts distinct emails", () => {
      const attendees = [
        { email: "ada@example.com" },
        { email: "grace@example.com" },
      ];

      expect(uniqueAttendeeEmails(attendees)).toBe(true);
    });

    it("rejects exact duplicates", () => {
      const attendees = [
        { email: "ada@example.com" },
        { email: "ada@example.com" },
      ];

      expect(uniqueAttendeeEmails(attendees)).toBe(false);
    });

    it("rejects duplicates differing only by case", () => {
      const attendees = [
        { email: "ada@example.com" },
        { email: "Ada@Example.com" },
      ];

      expect(uniqueAttendeeEmails(attendees)).toBe(false);
    });
  });

  describe("RsvpResponseStatusSchema", () => {
    it.each(["accepted", "declined", "tentative"] as const)(
      "accepts %s",
      (status) => {
        expect(RsvpResponseStatusSchema.safeParse(status).success).toBe(true);
      },
    );

    it("rejects needsAction — a user answers, they don't un-answer", () => {
      expect(RsvpResponseStatusSchema.safeParse("needsAction").success).toBe(
        false,
      );
    });
  });
});
