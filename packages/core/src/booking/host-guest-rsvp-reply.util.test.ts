import {
  detectHostGuestRsvpReplies,
  type HostGuestRsvpEventSlice,
} from "@core/booking/host-guest-rsvp-reply.util";
import { describe, expect, it } from "bun:test";

const slice = (
  attendees: HostGuestRsvpEventSlice["attendees"],
  organizerEmail = "host@example.com",
): HostGuestRsvpEventSlice => ({
  organizer: { email: organizerEmail },
  attendees,
  slotStart: "2026-11-23T18:00:00.000Z",
});

describe("detectHostGuestRsvpReplies", () => {
  it("detects a first guest accept", () => {
    const before = slice([
      {
        email: "host@example.com",
        displayName: "Host",
        responseStatus: "accepted",
      },
      {
        email: "jen@thesteeds.net",
        displayName: "Jen",
        responseStatus: "needsAction",
      },
    ]);
    const after = slice([
      ...before.attendees.slice(0, 1),
      {
        email: "jen@thesteeds.net",
        displayName: "Jen",
        responseStatus: "accepted",
      },
    ]);

    expect(
      detectHostGuestRsvpReplies(before, after, "host@example.com"),
    ).toEqual([
      {
        guestEmailLower: "jen@thesteeds.net",
        guestName: "Jen",
        status: "accepted",
        slotStart: before.slotStart,
      },
    ]);
  });

  it("returns nothing on first import without a before snapshot", () => {
    const after = slice([
      {
        email: "jen@thesteeds.net",
        displayName: null,
        responseStatus: "accepted",
      },
    ]);
    expect(detectHostGuestRsvpReplies(null, after, "host@example.com")).toEqual(
      [],
    );
  });

  it.each(["declined", "tentative"] as const)(
    "detects a first guest %s",
    (status) => {
      const before = slice([
        {
          email: "jen@thesteeds.net",
          displayName: "Jen",
          responseStatus: "needsAction",
        },
      ]);
      const after = slice([
        {
          email: "jen@thesteeds.net",
          displayName: "Jen",
          responseStatus: status,
        },
      ]);

      expect(
        detectHostGuestRsvpReplies(before, after, "host@example.com"),
      ).toEqual([
        {
          guestEmailLower: "jen@thesteeds.net",
          guestName: "Jen",
          status,
          slotStart: before.slotStart,
        },
      ]);
    },
  );

  it("ignores a guest who stays at needsAction", () => {
    const before = slice([
      {
        email: "jen@thesteeds.net",
        displayName: "Jen",
        responseStatus: "needsAction",
      },
    ]);
    expect(
      detectHostGuestRsvpReplies(before, before, "host@example.com"),
    ).toEqual([]);
  });

  it("ignores events another account organizes", () => {
    const before = slice(
      [
        {
          email: "jen@thesteeds.net",
          displayName: null,
          responseStatus: "needsAction",
        },
      ],
      "other@example.com",
    );
    const after = slice(
      [
        {
          email: "jen@thesteeds.net",
          displayName: null,
          responseStatus: "accepted",
        },
      ],
      "other@example.com",
    );
    expect(
      detectHostGuestRsvpReplies(before, after, "host@example.com"),
    ).toEqual([]);
  });
});
