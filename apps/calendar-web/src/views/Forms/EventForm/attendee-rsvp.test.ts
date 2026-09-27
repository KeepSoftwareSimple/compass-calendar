import {
  attendeeStatusByEmail,
  formatAttendeeRsvpTally,
  statusForEmail,
} from "@web/views/Forms/EventForm/attendee-rsvp";
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
