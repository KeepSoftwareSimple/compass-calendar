import { type Attendee } from "@core/types/event-attendance.contracts";
import {
  mergeAttendees,
  mergeUpdateContent,
  omitNullColor,
  resolveUpdateContent,
  resolveUpdateSchedule,
} from "./merge-update-content";
import { describe, expect, it } from "bun:test";

describe("mergeUpdateContent", () => {
  it("updates title, description, and location without wiping richer fields", () => {
    const existing = {
      title: "Old",
      description: "Old desc",
      location: "Room A",
      organizer: { email: "a@example.com", displayName: "A" },
      attendees: [
        {
          email: "b@example.com",
          displayName: "B",
          responseStatus: "accepted" as const,
        },
      ],
      conference: { url: "https://meet.example/x", label: "Meet" },
    };
    const incoming = {
      title: "New",
      description: "New desc",
      location: "Room B",
      organizer: null,
      attendees: [],
      conference: null,
    };

    expect(mergeUpdateContent(existing, incoming)).toEqual({
      title: "New",
      description: "New desc",
      location: "Room B",
      organizer: existing.organizer,
      attendees: existing.attendees,
      conference: existing.conference,
    });
  });

  it("applies an incoming color and preserves existing color when omitted", () => {
    const existing = {
      title: "Old",
      description: "Old desc",
      location: null,
      organizer: null,
      attendees: [],
      conference: null,
      color: "blue" as const,
    };

    expect(
      mergeUpdateContent(existing, {
        title: "New",
        description: "New desc",
        location: null,
        organizer: null,
        attendees: [],
        conference: null,
        color: "coral",
      }),
    ).toEqual({
      ...existing,
      title: "New",
      description: "New desc",
      color: "coral",
    });

    expect(
      mergeUpdateContent(existing, {
        title: "New",
        description: "New desc",
        location: null,
        organizer: null,
        attendees: [],
        conference: null,
      }),
    ).toEqual({
      ...existing,
      title: "New",
      description: "New desc",
    });
  });

  it("drops colorHex when a slot color is applied", () => {
    const existing = {
      title: "Labeled",
      description: "",
      location: null,
      organizer: null,
      attendees: [],
      conference: null,
      colorHex: "#009688",
    };

    expect(
      mergeUpdateContent(existing, {
        title: "Labeled",
        description: "",
        location: null,
        organizer: null,
        attendees: [],
        conference: null,
        color: "blue",
      }),
    ).toEqual({
      title: "Labeled",
      description: "",
      location: null,
      organizer: null,
      attendees: [],
      conference: null,
      color: "blue",
    });
  });

  it("drops colorHex when clearing a prior slot color", () => {
    const existing = {
      title: "Slotted",
      description: "",
      location: null,
      organizer: null,
      attendees: [],
      conference: null,
      color: "blue" as const,
      colorHex: "#009688",
    };

    expect(
      mergeUpdateContent(existing, {
        title: "Slotted",
        description: "",
        location: null,
        organizer: null,
        attendees: [],
        conference: null,
        color: null,
      }),
    ).toEqual({
      title: "Slotted",
      description: "",
      location: null,
      organizer: null,
      attendees: [],
      conference: null,
    });
  });

  it("keeps colorHex when drafts send null color on a hex-only event", () => {
    const existing = {
      title: "Labeled",
      description: "",
      location: null,
      organizer: null,
      attendees: [],
      conference: null,
      colorHex: "#009688",
    };

    expect(
      mergeUpdateContent(existing, {
        title: "Labeled",
        description: "edited",
        location: null,
        organizer: null,
        attendees: [],
        conference: null,
        color: null,
      }),
    ).toEqual({
      title: "Labeled",
      description: "edited",
      location: null,
      organizer: null,
      attendees: [],
      conference: null,
      colorHex: "#009688",
    });
  });

  it("preserves colorHex when color is omitted", () => {
    const existing = {
      title: "Labeled",
      description: "",
      location: null,
      organizer: null,
      attendees: [],
      conference: null,
      colorHex: "#009688",
    };

    expect(
      mergeUpdateContent(existing, {
        title: "Renamed",
        description: "",
        location: null,
        organizer: null,
        attendees: [],
        conference: null,
      }),
    ).toEqual({
      ...existing,
      title: "Renamed",
    });
  });

  it("clears an existing color when the command sends null", () => {
    const existing = {
      title: "Old",
      description: "Old desc",
      location: null,
      organizer: null,
      attendees: [],
      conference: null,
      color: "blue" as const,
    };

    expect(
      mergeUpdateContent(existing, {
        title: "Old",
        description: "Old desc",
        location: null,
        organizer: null,
        attendees: [],
        conference: null,
        color: null,
      }),
    ).toEqual({
      title: "Old",
      description: "Old desc",
      location: null,
      organizer: null,
      attendees: [],
      conference: null,
    });
  });
});

describe("resolveUpdateContent", () => {
  const stored = {
    title: "Stored",
    description: "stored",
    location: "Room A",
    organizer: null,
    attendees: [],
    conference: null,
  };
  const incoming = {
    title: "Incoming",
    description: "incoming",
    location: null,
    organizer: null,
    attendees: [],
    conference: null,
  };
  const fallback = {
    title: "Fallback",
    description: "fallback",
    location: "Room B",
    organizer: null,
    attendees: [],
    conference: null,
  };

  it("merges incoming onto stored when content is present", () => {
    expect(resolveUpdateContent(stored, incoming, fallback)).toEqual({
      title: "Incoming",
      description: "incoming",
      location: null,
      organizer: null,
      attendees: [],
      conference: null,
    });
  });

  it("keeps the fallback when content is omitted", () => {
    expect(resolveUpdateContent(stored, undefined, fallback)).toEqual(fallback);
  });
});

describe("resolveUpdateSchedule", () => {
  it("keeps the fallback when the incoming schedule is omitted", () => {
    expect(resolveUpdateSchedule(undefined, "kept")).toBe("kept");
  });

  it("uses the incoming schedule when present", () => {
    expect(resolveUpdateSchedule("next", "kept")).toBe("next");
  });
});

describe("mergeAttendees", () => {
  const attendee = (
    email: string,
    responseStatus: Attendee["responseStatus"] = "needsAction",
    displayName: string | null = null,
  ): Attendee => ({ email, displayName, responseStatus });

  // Exhaustive table over the merge rules: retained entries keep the
  // provider's status/displayName in provider order, new entries append as
  // needsAction in intent order, dropped emails are removed, and email
  // matching is case-insensitive.
  const cases: Array<{
    name: string;
    intended: Array<Pick<Attendee, "email" | "displayName">>;
    provider: Attendee[];
    expected: Attendee[];
  }> = [
    {
      name: "keeps a retained guest's provider responseStatus and displayName",
      intended: [{ email: "a@x.com", displayName: "Renamed" }],
      provider: [attendee("a@x.com", "accepted", "Provider Name")],
      expected: [attendee("a@x.com", "accepted", "Provider Name")],
    },
    {
      name: "adds a new guest as needsAction",
      intended: [
        { email: "a@x.com", displayName: null },
        { email: "b@x.com", displayName: "B" },
      ],
      provider: [attendee("a@x.com", "declined")],
      expected: [
        attendee("a@x.com", "declined"),
        attendee("b@x.com", "needsAction", "B"),
      ],
    },
    {
      name: "removes a dropped guest",
      intended: [{ email: "a@x.com", displayName: null }],
      provider: [
        attendee("a@x.com", "accepted"),
        attendee("b@x.com", "tentative"),
      ],
      expected: [attendee("a@x.com", "accepted")],
    },
    {
      name: "matches emails case-insensitively in both directions",
      intended: [
        { email: "Alice@X.com", displayName: null },
        { email: "bob@x.com", displayName: null },
      ],
      provider: [
        attendee("alice@x.com", "accepted"),
        attendee("BOB@x.com", "declined"),
      ],
      expected: [
        attendee("alice@x.com", "accepted"),
        attendee("BOB@x.com", "declined"),
      ],
    },
    {
      name: "preserves provider order for retained guests and appends new ones in intent order",
      intended: [
        { email: "new1@x.com", displayName: null },
        { email: "c@x.com", displayName: null },
        { email: "a@x.com", displayName: null },
        { email: "new2@x.com", displayName: null },
      ],
      provider: [
        attendee("a@x.com", "accepted"),
        attendee("b@x.com", "tentative"),
        attendee("c@x.com", "declined"),
      ],
      expected: [
        attendee("a@x.com", "accepted"),
        attendee("c@x.com", "declined"),
        attendee("new1@x.com"),
        attendee("new2@x.com"),
      ],
    },
    {
      name: "an empty intent removes everyone",
      intended: [],
      provider: [attendee("a@x.com", "accepted")],
      expected: [],
    },
    {
      name: "merging into an empty provider list makes every guest needsAction",
      intended: [
        { email: "a@x.com", displayName: "A" },
        { email: "b@x.com", displayName: null },
      ],
      provider: [],
      expected: [attendee("a@x.com", "needsAction", "A"), attendee("b@x.com")],
    },
    {
      name: "an unchanged membership returns the provider list verbatim",
      intended: [
        { email: "b@x.com", displayName: null },
        { email: "a@x.com", displayName: null },
      ],
      provider: [
        attendee("a@x.com", "accepted", "A"),
        attendee("b@x.com", "declined"),
      ],
      expected: [
        attendee("a@x.com", "accepted", "A"),
        attendee("b@x.com", "declined"),
      ],
    },
    {
      name: "both lists empty stays empty",
      intended: [],
      provider: [],
      expected: [],
    },
  ];

  it.each(cases)("$name", ({ intended, provider, expected }) => {
    expect(mergeAttendees(intended, provider)).toEqual(expected);
  });

  it("does not mutate its inputs", () => {
    const intended = [{ email: "a@x.com", displayName: null }];
    const provider = [attendee("b@x.com", "accepted")];
    mergeAttendees(intended, provider);
    expect(intended).toEqual([{ email: "a@x.com", displayName: null }]);
    expect(provider).toEqual([attendee("b@x.com", "accepted")]);
  });
});

describe("omitNullColor", () => {
  it("drops null color before persist", () => {
    expect(
      omitNullColor({
        title: "Standup",
        description: "Daily",
        location: null,
        organizer: null,
        attendees: [],
        conference: null,
        color: null,
      }),
    ).not.toHaveProperty("color");
  });
});
