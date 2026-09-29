import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import {
  attendeeStatusByEmail,
  formatAttendeeRsvpTally,
  guestResponseForEvent,
  guestStatusMapForHostNotice,
  statusForEmail,
} from "@web/events/attendee-rsvp";
import { describe, expect, it } from "bun:test";

describe("formatAttendeeRsvpTally", () => {
  it("always includes yes and awaiting, matching the host summary", () => {
    expect(formatAttendeeRsvpTally(["needsAction"])).toBe(
      "1 guest (0 yes, 1 awaiting)",
    );
  });

  it("pluralizes and omits zero no/maybe counts", () => {
    expect(formatAttendeeRsvpTally(["accepted", "accepted"])).toBe(
      "2 guests (2 yes, 0 awaiting)",
    );
  });

  it("appends no and maybe only when those counts are greater than zero", () => {
    expect(
      formatAttendeeRsvpTally([
        "accepted",
        "declined",
        "tentative",
        "needsAction",
      ]),
    ).toBe("4 guests (1 yes, 1 awaiting, 1 no, 1 maybe)");
  });
});

describe("attendeeStatusByEmail", () => {
  it("indexes by lower-cased email and defaults missing lookups to awaiting", () => {
    const map = attendeeStatusByEmail([
      { email: "Alex@Example.com", responseStatus: "accepted" },
    ]);

    expect(statusForEmail(map, "alex@example.com")).toBe("accepted");
    expect(statusForEmail(map, "new@example.com")).toBe("needsAction");
    expect(statusForEmail(undefined, "anyone@example.com")).toBe("needsAction");
  });
});

describe("guestResponseForEvent", () => {
  const host = "host@example.com";

  it("returns awaiting when any guest has needsAction", () => {
    expect(
      guestResponseForEvent(
        {
          attendees: [
            { email: host, responseStatus: "accepted" },
            { email: "guest@example.com", responseStatus: "needsAction" },
          ],
        },
        host,
      ),
    ).toBe("awaiting");
  });

  it("returns tentative when no awaiting guest and any guest is tentative", () => {
    expect(
      guestResponseForEvent(
        {
          attendees: [
            { email: host, responseStatus: "accepted" },
            { email: "a@example.com", responseStatus: "accepted" },
            { email: "b@example.com", responseStatus: "tentative" },
          ],
        },
        host,
      ),
    ).toBe("tentative");
  });

  it("returns declined when every guest declined", () => {
    expect(
      guestResponseForEvent(
        {
          attendees: [
            { email: host, responseStatus: "accepted" },
            { email: "a@example.com", responseStatus: "declined" },
            { email: "b@example.com", responseStatus: "declined" },
          ],
        },
        host,
      ),
    ).toBe("declined");
  });

  it("returns null when guests are all accepted", () => {
    expect(
      guestResponseForEvent(
        {
          attendees: [
            { email: host, responseStatus: "accepted" },
            { email: "guest@example.com", responseStatus: "accepted" },
          ],
        },
        host,
      ),
    ).toBeNull();
  });

  it("returns null when the host is not the organizer", () => {
    expect(
      guestResponseForEvent(
        {
          organizer: { email: "other@example.com" },
          attendees: [
            { email: host, responseStatus: "needsAction" },
            { email: "guest@example.com", responseStatus: "needsAction" },
          ],
        },
        host,
      ),
    ).toBeNull();
  });

  it("treats a missing organizer as host-organized and excludes self from guests", () => {
    expect(
      guestResponseForEvent(
        {
          attendees: [{ email: host, responseStatus: "needsAction" }],
        },
        host,
      ),
    ).toBeNull();
  });

  it("matches organizer email to account email case-insensitively", () => {
    expect(
      guestResponseForEvent(
        {
          organizer: { email: "Host@Example.com" },
          attendees: [
            { email: "guest@example.com", responseStatus: "needsAction" },
          ],
        },
        "host@example.com",
      ),
    ).toBe("awaiting");
  });
});

describe("guestStatusMapForHostNotice", () => {
  const host = "host@example.com";
  const guest = {
    email: "guest@example.com",
    displayName: "Guest",
    responseStatus: "accepted" as const,
  };

  it("returns guest statuses when a connected account organizes the event", () => {
    const event = createMockEvent({
      content: {
        kind: "details",
        title: "Planning",
        description: "",
        organizer: { email: host, displayName: null },
        attendees: [
          {
            email: host,
            displayName: "Host",
            responseStatus: "accepted",
          },
          guest,
        ],
      },
    });

    expect(guestStatusMapForHostNotice(event, [host])?.get(guest.email)).toBe(
      "accepted",
    );
  });

  it("returns null when no connected account organizes the event", () => {
    const event = createMockEvent({
      content: {
        kind: "details",
        title: "Planning",
        description: "",
        organizer: { email: "other@example.com", displayName: null },
        attendees: [guest],
      },
    });

    expect(guestStatusMapForHostNotice(event, [host])).toBeNull();
  });
});
