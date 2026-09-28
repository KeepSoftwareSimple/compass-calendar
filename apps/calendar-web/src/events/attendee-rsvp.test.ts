import { type AttendeeResponseStatus } from "@core/types/event-attendance.contracts";
import {
  attendeeStatusByEmail,
  formatAttendeeRsvpTally,
  guestResponseForEvent,
  statusForEmail,
} from "@web/events/attendee-rsvp";
import { describe, expect, it } from "bun:test";

const organizer = (email: string) => ({ email, displayName: null });
const guest = (email: string, responseStatus: AttendeeResponseStatus) => ({
  email,
  displayName: null,
  responseStatus,
});

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

  it("returns null when account email is missing", () => {
    expect(
      guestResponseForEvent(
        {
          organizer: organizer(host),
          attendees: [guest("guest@example.com", "needsAction")],
        },
        undefined,
      ),
    ).toBeNull();
  });

  it("returns null when the host is not the organizer", () => {
    expect(
      guestResponseForEvent(
        {
          organizer: organizer("other@example.com"),
          attendees: [
            guest(host, "needsAction"),
            guest("guest@example.com", "needsAction"),
          ],
        },
        host,
      ),
    ).toBeNull();
  });

  it("returns null when there are no guests besides the account", () => {
    expect(
      guestResponseForEvent(
        {
          organizer: organizer(host),
          attendees: [guest(host, "accepted")],
        },
        host,
      ),
    ).toBeNull();
  });

  it("excludes the account email from the guest roll-up", () => {
    expect(
      guestResponseForEvent(
        {
          attendees: [
            guest(host, "needsAction"),
            guest("guest@example.com", "accepted"),
          ],
        },
        host,
      ),
    ).toBeNull();
  });

  it("returns awaiting when any guest has needsAction", () => {
    expect(
      guestResponseForEvent(
        {
          attendees: [
            guest("a@example.com", "accepted"),
            guest("b@example.com", "needsAction"),
          ],
        },
        host,
      ),
    ).toBe("awaiting");
  });

  it("returns tentative when no awaiting and any guest is tentative", () => {
    expect(
      guestResponseForEvent(
        {
          attendees: [
            guest("a@example.com", "accepted"),
            guest("b@example.com", "tentative"),
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
            guest("a@example.com", "declined"),
            guest("b@example.com", "declined"),
          ],
        },
        host,
      ),
    ).toBe("declined");
  });

  it("returns null when all guests accepted", () => {
    expect(
      guestResponseForEvent(
        {
          attendees: [guest("guest@example.com", "accepted")],
        },
        host,
      ),
    ).toBeNull();
  });
});
