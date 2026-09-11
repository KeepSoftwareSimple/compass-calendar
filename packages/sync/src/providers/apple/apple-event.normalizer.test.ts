import {
  type DateOnly,
  type DateTime,
  type TimeZone,
} from "@core/types/domain-primitives";
import {
  type AppleEventResourceInput,
  normalizeAppleEventResource,
} from "@sync/providers/apple/apple-event.normalizer";
import {
  type ProviderEvent,
  type ProviderEventCancellation,
  ProviderEventError,
} from "@sync/providers/provider-event.port";

const NY_TIMEZONE = `BEGIN:VTIMEZONE
TZID:America/New_York
BEGIN:STANDARD
DTSTART:20071104T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:20070311T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
END:DAYLIGHT
END:VTIMEZONE`;

const resource = (
  icsBody: string,
  overrides: Partial<AppleEventResourceInput> = {},
): AppleEventResourceInput => ({
  ics: `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Compass//Test//EN
${icsBody}
END:VCALENDAR`,
  href: "/calendars/home/abc.ics",
  etag: '"etag-1"',
  connectionTimeZone: "America/Los_Angeles",
  ...overrides,
});

const asEvent = (
  read: ReturnType<typeof normalizeAppleEventResource>[number],
) => {
  if (read.kind !== "event")
    throw new Error(`expected event, got ${read.kind}`);
  return read as ProviderEvent;
};

const asCancellation = (
  read: ReturnType<typeof normalizeAppleEventResource>[number],
) => {
  if (read.kind !== "cancellation") {
    throw new Error(`expected cancellation, got ${read.kind}`);
  }
  return read as ProviderEventCancellation;
};

describe("normalizeAppleEventResource", () => {
  it("normalizes a timed event with VTIMEZONE", () => {
    const [read] = normalizeAppleEventResource(
      resource(`${NY_TIMEZONE}
BEGIN:VEVENT
UID:timed-uid@icloud.com
DTSTAMP:20250101T120000Z
LAST-MODIFIED:20250102T080000Z
DTSTART;TZID=America/New_York:20250115T090000
DTEND;TZID=America/New_York:20250115T100000
SUMMARY:Standup
DESCRIPTION:Daily sync
LOCATION:Room A
END:VEVENT`),
    );
    const event = asEvent(read!);

    expect(event.providerEventId).toBe("timed-uid@icloud.com");
    expect(event.providerVersion).toBe('"etag-1"');
    expect(event.providerUpdatedAt).toBe("2025-01-02T08:00:00.000Z");
    expect(event.icalUid).toBe("timed-uid@icloud.com");
    expect(event.busy).toBe(true);
    expect(event.recurrence).toEqual({ kind: "single" });
    expect(event.content.title).toBe("Standup");
    expect(event.content.description).toBe("Daily sync");
    expect(event.content.location).toBe("Room A");
    expect(event.schedule.kind).toBe("timed");
    if (event.schedule.kind !== "timed") throw new Error("expected timed");
    expect(event.schedule.timeZone).toBe("America/New_York" as TimeZone);
    expect(Date.parse(event.schedule.start)).toBe(
      Date.parse("2025-01-15T09:00:00-05:00"),
    );
    expect(event).not.toHaveProperty("providerManaged");
  });

  it("anchors floating times to the connection zone", () => {
    const [read] = normalizeAppleEventResource(
      resource(`BEGIN:VEVENT
UID:float-uid@icloud.com
DTSTAMP:20250101T120000Z
DTSTART:20250115T090000
DTEND:20250115T100000
SUMMARY:Floating
END:VEVENT`),
    );
    const event = asEvent(read!);
    if (event.schedule.kind !== "timed") throw new Error("expected timed");

    expect(event.schedule.timeZone).toBe("America/Los_Angeles" as TimeZone);
    expect(event.schedule.start).toBe("2025-01-15T09:00:00-08:00" as DateTime);
    expect(event.schedule.end).toBe("2025-01-15T10:00:00-08:00" as DateTime);
  });

  it("normalizes an all-day event", () => {
    const [read] = normalizeAppleEventResource(
      resource(`BEGIN:VEVENT
UID:allday-uid@icloud.com
DTSTAMP:20250101T120000Z
DTSTART;VALUE=DATE:20250222
DTEND;VALUE=DATE:20250223
SUMMARY:Holiday
TRANSP:TRANSPARENT
END:VEVENT`),
    );
    const event = asEvent(read!);

    expect(event.busy).toBe(false);
    expect(event.schedule).toEqual({
      kind: "allDay",
      start: "2025-02-22" as DateOnly,
      end: "2025-02-23" as DateOnly,
    });
  });

  it("maps RRULE with EXDATE onto the master", () => {
    const [read] = normalizeAppleEventResource(
      resource(`${NY_TIMEZONE}
BEGIN:VEVENT
UID:series-uid@icloud.com
DTSTAMP:20250101T120000Z
DTSTART;TZID=America/New_York:20250115T090000
DTEND;TZID=America/New_York:20250115T100000
RRULE:FREQ=WEEKLY;COUNT=4
EXDATE;TZID=America/New_York:20250122T090000
SUMMARY:Weekly
END:VEVENT`),
    );
    const event = asEvent(read!);

    expect(event.recurrence).toEqual({
      kind: "seriesMaster",
      rules: [
        "RRULE:FREQ=WEEKLY;COUNT=4",
        "EXDATE;TZID=America/New_York:20250122T090000",
      ],
    });
  });

  it("normalizes a master plus two exceptions in one resource", () => {
    const reads = normalizeAppleEventResource(
      resource(`${NY_TIMEZONE}
BEGIN:VEVENT
UID:series-uid@icloud.com
DTSTAMP:20250101T120000Z
DTSTART;TZID=America/New_York:20250115T090000
DTEND;TZID=America/New_York:20250115T100000
RRULE:FREQ=WEEKLY;COUNT=4
SUMMARY:Weekly
END:VEVENT
BEGIN:VEVENT
UID:series-uid@icloud.com
DTSTAMP:20250101T120001Z
DTSTART;TZID=America/New_York:20250122T103000
DTEND;TZID=America/New_York:20250122T113000
RECURRENCE-ID;TZID=America/New_York:20250122T090000
SUMMARY:Weekly moved
END:VEVENT
BEGIN:VEVENT
UID:series-uid@icloud.com
DTSTAMP:20250101T120002Z
DTSTART;TZID=America/New_York:20250129T090000
DTEND;TZID=America/New_York:20250129T100000
RECURRENCE-ID;TZID=America/New_York:20250129T090000
SUMMARY:Weekly note
END:VEVENT`),
    );

    expect(reads).toHaveLength(3);
    const master = asEvent(reads[0]!);
    expect(master.providerEventId).toBe("series-uid@icloud.com");
    expect(master.recurrence.kind).toBe("seriesMaster");

    const firstException = asEvent(reads[1]!);
    expect(firstException.providerEventId).toBe(
      "series-uid@icloud.com_20250122T140000Z",
    );
    if (firstException.recurrence.kind !== "instance") {
      throw new Error("expected instance");
    }
    expect(firstException.recurrence.seriesProviderId).toBe(
      "series-uid@icloud.com",
    );
    expect(firstException.recurrence.recurrenceId).toBe(
      new Date("2025-01-22T09:00:00-05:00").toISOString(),
    );
    expect(firstException.content.title).toBe("Weekly moved");

    const secondException = asEvent(reads[2]!);
    expect(secondException.content.title).toBe("Weekly note");
  });

  it("maps a cancelled exception to a cancellation with its series link", () => {
    const reads = normalizeAppleEventResource(
      resource(`${NY_TIMEZONE}
BEGIN:VEVENT
UID:series-uid@icloud.com
DTSTAMP:20250101T120000Z
DTSTART;TZID=America/New_York:20250115T090000
DTEND;TZID=America/New_York:20250115T100000
RRULE:FREQ=WEEKLY;COUNT=4
SUMMARY:Weekly
END:VEVENT
BEGIN:VEVENT
UID:series-uid@icloud.com
DTSTAMP:20250101T120001Z
RECURRENCE-ID;TZID=America/New_York:20250122T090000
STATUS:CANCELLED
END:VEVENT`),
    );

    const cancelled = asCancellation(reads[1]!);
    expect(cancelled.providerEventId).toBe(
      "series-uid@icloud.com_20250122T140000Z",
    );
    expect(cancelled.series).toEqual({
      seriesProviderId: "series-uid@icloud.com",
      recurrenceId: new Date("2025-01-22T09:00:00-05:00").toISOString(),
    });
  });

  it("throws unmappableSchedule for RECURRENCE-ID RANGE=THISANDFUTURE", () => {
    expect(() =>
      normalizeAppleEventResource(
        resource(`BEGIN:VEVENT
UID:future-uid@icloud.com
DTSTAMP:20250101T120000Z
DTSTART:20250115T090000Z
DTEND:20250115T100000Z
RECURRENCE-ID;RANGE=THISANDFUTURE:20250115T090000Z
END:VEVENT`),
      ),
    ).toThrow(ProviderEventError);
  });

  it("maps attendees with every PARTSTAT and strips mailto", () => {
    const [read] = normalizeAppleEventResource(
      resource(`BEGIN:VEVENT
UID:guests-uid@icloud.com
DTSTAMP:20250101T120000Z
DTSTART:20250115T090000Z
DTEND:20250115T100000Z
ORGANIZER;CN=Host:mailto:host@example.com
ATTENDEE;CN=Accepted;PARTSTAT=ACCEPTED:mailto:accepted@example.com
ATTENDEE;CN=Declined;PARTSTAT=DECLINED:mailto:declined@example.com
ATTENDEE;CN=Tentative;PARTSTAT=TENTATIVE:mailto:tentative@example.com
ATTENDEE;CN=Pending;PARTSTAT=NEEDS-ACTION:mailto:pending@example.com
ATTENDEE;CN=Delegated;PARTSTAT=DELEGATED:mailto:delegated@example.com
ATTENDEE;CN=No Email:mailto:
END:VEVENT`),
    );
    const event = asEvent(read!);

    expect(event.content.organizer).toEqual({
      email: "host@example.com",
      displayName: "Host",
    });
    expect(event.content.attendees).toEqual([
      {
        email: "accepted@example.com",
        displayName: "Accepted",
        responseStatus: "accepted",
      },
      {
        email: "declined@example.com",
        displayName: "Declined",
        responseStatus: "declined",
      },
      {
        email: "tentative@example.com",
        displayName: "Tentative",
        responseStatus: "tentative",
      },
      {
        email: "pending@example.com",
        displayName: "Pending",
        responseStatus: "needsAction",
      },
      {
        email: "delegated@example.com",
        displayName: "Delegated",
        responseStatus: "needsAction",
      },
    ]);
  });

  it("maps an https URL to a conference link", () => {
    const [read] = normalizeAppleEventResource(
      resource(`BEGIN:VEVENT
UID:url-uid@icloud.com
DTSTAMP:20250101T120000Z
DTSTART:20250115T090000Z
DTEND:20250115T100000Z
URL:https://example.com/meet
END:VEVENT`),
    );

    expect(asEvent(read!).content.conference).toEqual({
      url: "https://example.com/meet",
      label: "Link",
    });
  });

  it("skips malformed ICS with a ProviderEventError", () => {
    expect(() =>
      normalizeAppleEventResource({
        ics: "not valid ics",
        href: "/bad.ics",
        etag: '"etag-1"',
        connectionTimeZone: "UTC",
      }),
    ).toThrow(ProviderEventError);
  });

  it("uses DTSTAMP when LAST-MODIFIED is absent", () => {
    const [read] = normalizeAppleEventResource(
      resource(`BEGIN:VEVENT
UID:stamp-uid@icloud.com
DTSTAMP:20250103T101010Z
DTSTART:20250115T090000Z
DTEND:20250115T100000Z
END:VEVENT`),
    );

    expect(asEvent(read!).providerUpdatedAt).toBe("2025-01-03T10:10:10.000Z");
  });

  it("derives timed end from DURATION when DTEND is absent", () => {
    const [read] = normalizeAppleEventResource(
      resource(`BEGIN:VEVENT
UID:duration-uid@icloud.com
DTSTAMP:20250101T120000Z
DTSTART:20250115T090000Z
DURATION:PT1H30M
END:VEVENT`),
    );
    const event = asEvent(read!);
    if (event.schedule.kind !== "timed") throw new Error("expected timed");

    expect(
      Date.parse(event.schedule.end) - Date.parse(event.schedule.start),
    ).toBe(90 * 60 * 1000);
  });
});
