import {
  type DateOnly,
  type DateTime,
  type TimeZone,
} from "@core/types/domain-primitives";
import { type EventSchedule } from "@core/types/event.contracts";
import {
  type AppleEventResourceInput,
  normalizeAppleEventResource,
} from "@sync/providers/apple/apple-event.normalizer";
import {
  type AppleEventSerializeInput,
  escapeIcsText,
  foldIcsLine,
  serializeAppleEventCreate,
  serializeAppleEventInstance,
  serializeAppleEventPatch,
} from "@sync/providers/apple/apple-event.serializer";
import {
  type ProviderEvent,
  type ProviderEventRead,
  type ProviderEventRecurrence,
} from "@sync/providers/provider-event.port";
import { type ProviderWriteRecurrence } from "@sync/providers/provider-event-writer.port";

const resource = (
  icsBody: string,
  overrides: Partial<AppleEventResourceInput> = {},
): AppleEventResourceInput => ({
  ics: icsBody.startsWith("BEGIN:VCALENDAR")
    ? icsBody
    : `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Compass//Test//EN
${icsBody}
END:VCALENDAR`,
  href: "/calendars/home/event.ics",
  etag: '"etag-1"',
  connectionTimeZone: "UTC",
  ...overrides,
});

const asEvent = (read: ProviderEventRead): ProviderEvent => {
  if (read.kind !== "event")
    throw new Error(`expected event, got ${read.kind}`);
  return read;
};

function recurrenceToWrite(
  recurrence: ProviderEventRecurrence,
): ProviderWriteRecurrence {
  switch (recurrence.kind) {
    case "single":
      return { kind: "single" };
    case "seriesMaster":
      return { kind: "series", rules: recurrence.rules };
    case "instance":
      return { kind: "instance" };
  }
}

function eventToSerializeInput(event: ProviderEvent): AppleEventSerializeInput {
  return {
    providerEventId: event.providerEventId,
    content: event.content,
    schedule: event.schedule,
    recurrence: recurrenceToWrite(event.recurrence),
    busy: event.busy,
    attendees: event.content.attendees,
    dtstamp: event.providerUpdatedAt ?? undefined,
  };
}

function roundTripEvent(icsBody: string): ProviderEvent {
  const [read] = normalizeAppleEventResource(resource(icsBody));
  const event = asEvent(read!);
  const serialized = serializeAppleEventCreate(eventToSerializeInput(event));
  const [roundTripped] = normalizeAppleEventResource(
    resource(serialized, { etag: event.providerVersion }),
  );
  return asEvent(roundTripped!);
}

function expectEventsEqual(
  actual: ProviderEvent,
  expected: ProviderEvent,
): void {
  expect(actual).toEqual(expected);
}

describe("serializeAppleEventCreate", () => {
  it("emits Compass PRODID and VERSION 2.0", () => {
    const ics = serializeAppleEventCreate({
      providerEventId: "uid@icloud.com",
      content: {
        title: "Test",
        description: "",
        location: null,
        organizer: null,
        attendees: [],
        conference: null,
      },
      schedule: {
        kind: "timed",
        start: "2025-01-15T09:00:00Z" as DateTime,
        end: "2025-01-15T10:00:00Z" as DateTime,
        timeZone: "UTC" as TimeZone,
      },
      recurrence: { kind: "single" },
      busy: true,
      dtstamp: "2025-01-01T12:00:00Z",
    });

    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:-//Compass//NONSGML Compass Calendar//EN");
  });

  it.each([
    {
      name: "timed",
      body: `BEGIN:VEVENT
UID:timed-uid@icloud.com
DTSTAMP:20250101T120000Z
DTSTART:20250115T090000Z
DTEND:20250115T100000Z
SUMMARY:Standup
DESCRIPTION:Daily sync
LOCATION:Room A
END:VEVENT`,
    },
    {
      name: "all-day",
      body: `BEGIN:VEVENT
UID:allday-uid@icloud.com
DTSTAMP:20250101T120000Z
DTSTART;VALUE=DATE:20250222
DTEND;VALUE=DATE:20250223
SUMMARY:Holiday
TRANSP:TRANSPARENT
END:VEVENT`,
    },
    {
      name: "recurring",
      body: `BEGIN:VEVENT
UID:series-uid@icloud.com
DTSTAMP:20250101T120000Z
DTSTART:20250115T090000Z
DTEND:20250115T100000Z
RRULE:FREQ=WEEKLY;COUNT=4
EXDATE:20250122T090000Z
SUMMARY:Weekly
END:VEVENT`,
    },
    {
      name: "attendees",
      body: `BEGIN:VEVENT
UID:guests-uid@icloud.com
DTSTAMP:20250101T120000Z
DTSTART:20250115T090000Z
DTEND:20250115T100000Z
ORGANIZER;CN=Host:mailto:host@example.com
ATTENDEE;CN=Accepted;PARTSTAT=ACCEPTED:mailto:accepted@example.com
ATTENDEE;CN=Declined;PARTSTAT=DECLINED:mailto:declined@example.com
SUMMARY:Guests
END:VEVENT`,
    },
    {
      name: "conference",
      body: `BEGIN:VEVENT
UID:url-uid@icloud.com
DTSTAMP:20250101T120000Z
DTSTART:20250115T090000Z
DTEND:20250115T100000Z
URL:https://example.com/meet
SUMMARY:Call
END:VEVENT`,
    },
  ])("round-trips a $name event through normalize", ({ body }) => {
    const [read] = normalizeAppleEventResource(resource(body));
    const event = asEvent(read!);
    const roundTripped = roundTripEvent(body);
    expectEventsEqual(roundTripped, event);
  });
});

describe("serializeAppleEventPatch", () => {
  it("preserves X-APPLE-* properties when patching title only", () => {
    const existing = resource(`BEGIN:VEVENT
UID:apple-uid@icloud.com
DTSTAMP:20250101T120000Z
DTSTART:20250115T090000Z
DTEND:20250115T100000Z
SUMMARY:Original
X-APPLE-TRAVEL-ADVISORY-BEHAVIOR:AUTOMATIC
SEQUENCE:2
END:VEVENT`);

    const patched = serializeAppleEventPatch({
      providerEventId: "apple-uid@icloud.com",
      existingIcs: existing.ics,
      patchFields: ["title"],
      scheduleChanged: false,
      attendeesChanged: false,
      content: {
        title: "Updated",
        description: "ignored",
        location: null,
        organizer: null,
        attendees: [],
        conference: null,
      },
      schedule: {
        kind: "timed",
        start: "2025-01-15T09:00:00Z" as DateTime,
        end: "2025-01-15T10:00:00Z" as DateTime,
        timeZone: "UTC" as TimeZone,
      },
      recurrence: { kind: "single" },
      busy: true,
    });

    expect(patched).toContain("SUMMARY:Updated");
    expect(patched).toContain("X-APPLE-TRAVEL-ADVISORY-BEHAVIOR:AUTOMATIC");
    expect(patched).not.toContain("DESCRIPTION:ignored");
    expect(patched).toContain("SEQUENCE:2");
  });

  it("increments SEQUENCE when schedule changes", () => {
    const existing = resource(`BEGIN:VEVENT
UID:seq-uid@icloud.com
DTSTAMP:20250101T120000Z
DTSTART:20250115T090000Z
DTEND:20250115T100000Z
SUMMARY:Move me
SEQUENCE:4
END:VEVENT`);

    const patched = serializeAppleEventPatch({
      providerEventId: "seq-uid@icloud.com",
      existingIcs: existing.ics,
      patchFields: ["schedule"],
      scheduleChanged: true,
      attendeesChanged: false,
      content: {
        title: "Move me",
        description: "",
        location: null,
        organizer: null,
        attendees: [],
        conference: null,
      },
      schedule: {
        kind: "timed",
        start: "2025-01-15T10:00:00Z" as DateTime,
        end: "2025-01-15T11:00:00Z" as DateTime,
        timeZone: "UTC" as TimeZone,
      },
      recurrence: { kind: "single" },
      busy: true,
    });

    expect(patched).toContain("DTSTART:20250115T100000Z");
    expect(patched).toContain("SEQUENCE:5");
  });
});

describe("serializeAppleEventInstance", () => {
  it("adds a second VEVENT with the matching RECURRENCE-ID", () => {
    const masterOnly = resource(`BEGIN:VEVENT
UID:series-uid@icloud.com
DTSTAMP:20250101T120000Z
DTSTART:20250115T090000Z
DTEND:20250115T100000Z
RRULE:FREQ=DAILY;COUNT=3
SUMMARY:Series
END:VEVENT`);

    const serialized = serializeAppleEventInstance({
      providerEventId: "series-uid@icloud.com_20250116T090000Z",
      existingIcs: masterOnly.ics,
      instanceRecurrenceId: new Date("2025-01-16T09:00:00Z").toISOString(),
      scheduleChanged: true,
      attendeesChanged: false,
      content: {
        title: "Moved instance",
        description: "",
        location: null,
        organizer: null,
        attendees: [],
        conference: null,
      },
      schedule: {
        kind: "timed",
        start: "2025-01-16T10:00:00Z" as DateTime,
        end: "2025-01-16T11:00:00Z" as DateTime,
        timeZone: "UTC" as TimeZone,
      },
      recurrence: { kind: "instance" },
      busy: true,
      dtstamp: "2025-01-01T12:00:01.000Z",
    });

    const reads = normalizeAppleEventResource(
      resource(serialized, { etag: '"etag-2"' }),
    );
    expect(reads).toHaveLength(2);
    const exception = asEvent(reads[1]!);
    expect(exception.content.title).toBe("Moved instance");
    expect(exception.recurrence).toEqual({
      kind: "instance",
      seriesProviderId: "series-uid@icloud.com",
      recurrenceId: new Date("2025-01-16T09:00:00Z").toISOString(),
    });
    expect(serialized).toContain("RECURRENCE-ID:20250116T090000Z");
  });
});

describe("RFC 5545 text handling", () => {
  it("escapes commas, semicolons, backslashes, and newlines", () => {
    expect(escapeIcsText("Comma, semicolon; backslash\\ newline\nhere")).toBe(
      "Comma\\, semicolon\\; backslash\\\\ newline\\nhere",
    );
  });

  it("folds long lines at 75 octets", () => {
    const folded = foldIcsLine(`DESCRIPTION:${"A".repeat(90)}`);
    const lines = folded.split("\r\n ");
    expect(lines[0]?.length).toBeLessThanOrEqual(75);
    expect(lines[1]?.startsWith("A")).toBe(true);
    expect(new TextEncoder().encode(lines[0]!).length).toBeLessThanOrEqual(75);
  });

  it("folds multibyte characters without splitting code points", () => {
    const folded = foldIcsLine(`SUMMARY:${"😀".repeat(30)}`);
    expect(folded).toContain("\r\n ");
  });
});

describe("serializeAppleEventCreate schedule encoding", () => {
  it("writes timed events in UTC Z form without VTIMEZONE", () => {
    const ics = serializeAppleEventCreate({
      providerEventId: "utc-uid@icloud.com",
      content: {
        title: "UTC",
        description: "",
        location: null,
        organizer: null,
        attendees: [],
        conference: null,
      },
      schedule: {
        kind: "timed",
        start: "2025-01-15T09:00:00-05:00" as DateTime,
        end: "2025-01-15T10:00:00-05:00" as DateTime,
        timeZone: "America/New_York" as TimeZone,
      },
      recurrence: { kind: "single" },
      busy: true,
      dtstamp: "2025-01-01T12:00:00Z",
    });

    expect(ics).toContain("DTSTART:20250115T140000Z");
    expect(ics).toContain("DTEND:20250115T150000Z");
    expect(ics).not.toContain("VTIMEZONE");
  });

  it("writes all-day events with VALUE=DATE", () => {
    const ics = serializeAppleEventCreate({
      providerEventId: "day-uid@icloud.com",
      content: {
        title: "Day",
        description: "",
        location: null,
        organizer: null,
        attendees: [],
        conference: null,
      },
      schedule: {
        kind: "allDay",
        start: "2025-02-22" as DateOnly,
        end: "2025-02-23" as DateOnly,
      } satisfies EventSchedule,
      recurrence: { kind: "single" },
      busy: false,
      dtstamp: "2025-01-01T12:00:00Z",
    });

    expect(ics).toContain("DTSTART;VALUE=DATE:20250222");
    expect(ics).toContain("DTEND;VALUE=DATE:20250223");
    expect(ics).toContain("TRANSP:TRANSPARENT");
  });
});
