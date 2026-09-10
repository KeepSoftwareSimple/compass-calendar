import { allday } from "@core/__mocks__/v1/events/gcal/gcal.allday";
import { cancelled } from "@core/__mocks__/v1/events/gcal/gcal.cancelled";
import { recurring } from "@core/__mocks__/v1/events/gcal/gcal.recurring";
import { timed } from "@core/__mocks__/v1/events/gcal/gcal.timed";
import { type gSchema$Event } from "@core/types/gcal";
import { normalizeGoogleEvent } from "@sync/providers/google/google-event.normalizer";
import {
  type ProviderEvent,
  type ProviderEventCancellation,
  ProviderEventError,
} from "@sync/providers/provider-event.port";

// The untyped fixtures carry a few fields outside Schema$Event; cast to the
// read type the normalizer accepts.
const asEvent = (raw: unknown) => raw as gSchema$Event;

// A minimal valid Google event to layer overrides onto for focused cases.
const gEvent = (overrides: Partial<gSchema$Event>): gSchema$Event => ({
  kind: "calendar#event",
  id: "evt-id",
  etag: '"v1"',
  status: "confirmed",
  summary: "Title",
  start: {
    dateTime: "2025-01-15T09:00:00-05:00",
    timeZone: "America/New_York",
  },
  end: { dateTime: "2025-01-15T10:00:00-05:00", timeZone: "America/New_York" },
  ...overrides,
});

const asProviderEvent = (read: ReturnType<typeof normalizeGoogleEvent>) => {
  if (read.kind !== "event")
    throw new Error(`expected event, got ${read.kind}`);
  return read as ProviderEvent;
};

const asCancellation = (read: ReturnType<typeof normalizeGoogleEvent>) => {
  if (read.kind !== "cancellation") {
    throw new Error(`expected cancellation, got ${read.kind}`);
  }
  return read as ProviderEventCancellation;
};

describe("normalizeGoogleEvent", () => {
  it("normalizes a timed event with content and identity", () => {
    const read = asProviderEvent(normalizeGoogleEvent(asEvent(timed[0])));

    expect(read.providerEventId).toBe("kjatossbl8ctt7ub64363pibek");
    expect(read.providerVersion).toBe('"2702446420000000"');
    expect(read.providerUpdatedAt).toBe("2012-10-26T03:46:50.000Z");
    expect(read.busy).toBe(true);
    expect(read.recurrence).toEqual({ kind: "single" });
    expect(read.content.title).toBe("Meeting with Stan");
    expect(read.content.description).toBe("Sign Lease and pick apartment");
    expect(read.content.location).toBe("PH");
    expect(read.content.organizer).toEqual({
      email: "foo@gmail.com",
      displayName: "foo user",
    });
    expect(read.schedule.kind).toBe("timed");
  });

  it("preserves the exact instant of a timed event across offset normalization", () => {
    const read = asProviderEvent(normalizeGoogleEvent(asEvent(timed[0])));
    if (read.schedule.kind !== "timed") throw new Error("expected timed");

    // The fixture's stored offset disagrees with its zone; re-anchoring corrects
    // the offset while keeping the same absolute moment.
    expect(read.schedule.timeZone).toBe("America/Chicago");
    expect(Date.parse(read.schedule.start)).toBe(
      Date.parse("2012-10-26T13:00:00-06:00"),
    );
    expect(Date.parse(read.schedule.end)).toBe(
      Date.parse("2012-10-26T14:00:00-06:00"),
    );
  });

  it("emits the zone's correct offset on each side of a DST boundary", () => {
    const winter = asProviderEvent(
      normalizeGoogleEvent(
        gEvent({
          start: {
            dateTime: "2025-01-15T09:00:00-05:00",
            timeZone: "America/New_York",
          },
          end: {
            dateTime: "2025-01-15T10:00:00-05:00",
            timeZone: "America/New_York",
          },
        }),
      ),
    );
    const summer = asProviderEvent(
      normalizeGoogleEvent(
        gEvent({
          start: {
            dateTime: "2025-07-15T09:00:00-04:00",
            timeZone: "America/New_York",
          },
          end: {
            dateTime: "2025-07-15T10:00:00-04:00",
            timeZone: "America/New_York",
          },
        }),
      ),
    );
    if (winter.schedule.kind !== "timed" || summer.schedule.kind !== "timed") {
      throw new Error("expected timed");
    }

    expect(winter.schedule.start).toBe("2025-01-15T09:00:00-05:00");
    expect(summer.schedule.start).toBe("2025-07-15T09:00:00-04:00");
  });

  it("normalizes an all-day, free (transparent) event", () => {
    const read = asProviderEvent(normalizeGoogleEvent(asEvent(allday[0])));

    expect(read.busy).toBe(false);
    expect(read.schedule).toEqual({
      kind: "allDay",
      start: "2022-02-22",
      end: "2022-02-23",
    });
    // No description/location on this fixture; absence becomes empty string
    // for both, matching the editable-write side's "no location" convention.
    expect(read.content.description).toBe("");
    expect(read.content.location).toBe("");
    // Organizer without a display name normalizes to null, not "".
    expect(read.content.organizer).toEqual({
      email: "foo@gmail.com",
      displayName: null,
    });
  });

  it("maps a recurring master to its rules", () => {
    const read = asProviderEvent(normalizeGoogleEvent(recurring[0]));

    expect(read.recurrence).toEqual({
      kind: "seriesMaster",
      rules: ["RRULE:FREQ=DAILY;UNTIL=20250916T225959Z"],
    });
  });

  it("maps a recurring instance to its series link and occurrence id", () => {
    const read = asProviderEvent(normalizeGoogleEvent(recurring[1]));
    if (read.recurrence.kind !== "instance")
      throw new Error("expected instance");

    expect(read.recurrence.seriesProviderId).toBe("15chil19v5nskedvmo93ei4nl8");
    expect(read.recurrence.recurrenceId).toBe(
      new Date("2025-09-07T02:30:00+01:00").toISOString(),
    );
  });

  it("maps a cancelled series occurrence to a cancellation with its series link", () => {
    const read = asCancellation(normalizeGoogleEvent(asEvent(cancelled[0])));

    expect(read.providerEventId).toBe(
      "tlf9q8uk5vjl2i2868q36dpi28_20130508T220000Z",
    );
    expect(read.series?.seriesProviderId).toBe("tlf9q8uk5vjl2i2868q36dpi28");
    // originalStartTime has no timeZone: the id must be Compass's canonical
    // UTC recurrenceId (Date#toISOString), not an offset string — otherwise a
    // later scope-"this" command keyed on the projected form misses the row.
    expect(read.series?.recurrenceId).toBe("2013-05-08T22:00:00.000Z");
  });

  it("reconstructs the series link from a sparse cancelled instance id", () => {
    // Incremental syncToken pages often omit recurringEventId/originalStartTime.
    const read = asCancellation(normalizeGoogleEvent(asEvent(cancelled[1])));

    expect(read.providerEventId).toBe(
      "0cu25g99pfkhlfarupevcjc297_20211123T170000Z",
    );
    expect(read.series).toEqual({
      seriesProviderId: "0cu25g99pfkhlfarupevcjc297",
      recurrenceId: "2021-11-23T17:00:00.000Z",
    });
  });

  it("maps a cancelled series master with a plain id to a standalone cancellation", () => {
    const read = asCancellation(
      normalizeGoogleEvent(gEvent({ id: "master-only", status: "cancelled" })),
    );

    expect(read.series).toBeNull();
  });

  it("keeps a cancelled instance even when Google omits etag", () => {
    const read = asCancellation(
      normalizeGoogleEvent(
        gEvent({
          id: "0cu25g99pfkhlfarupevcjc297_20211123T170000Z",
          status: "cancelled",
          etag: undefined,
        }),
      ),
    );

    expect(read.providerVersion).toBe("");
    expect(read.series).toEqual({
      seriesProviderId: "0cu25g99pfkhlfarupevcjc297",
      recurrenceId: "2021-11-23T17:00:00.000Z",
    });
  });

  it("reconstructs an all-day sparse cancelled instance from its id suffix", () => {
    const read = asCancellation(
      normalizeGoogleEvent(
        gEvent({ id: "series-1_20260808", status: "cancelled" }),
      ),
    );

    expect(read.series).toEqual({
      seriesProviderId: "series-1",
      recurrenceId: "2026-08-08T00:00:00.000Z",
    });
  });

  it("maps attendees, defaulting unknown response status and dropping the email-less", () => {
    const read = asProviderEvent(
      normalizeGoogleEvent(
        gEvent({
          attendees: [
            { email: "a@x.com", displayName: "A", responseStatus: "accepted" },
            { email: "b@x.com", responseStatus: "bogus" },
            { displayName: "no email" },
          ],
        }),
      ),
    );

    expect(read.content.attendees).toEqual([
      { email: "a@x.com", displayName: "A", responseStatus: "accepted" },
      { email: "b@x.com", displayName: null, responseStatus: "needsAction" },
    ]);
  });

  it("treats a whitespace-only display name as absent", () => {
    const read = asProviderEvent(
      normalizeGoogleEvent(
        gEvent({
          organizer: { email: "org@x.com", displayName: "   " },
          attendees: [
            { email: "a@x.com", displayName: " ", responseStatus: "accepted" },
          ],
        }),
      ),
    );

    expect(read.content.organizer?.displayName).toBeNull();
    expect(read.content.attendees[0].displayName).toBeNull();
  });

  it("reads a conference url from hangoutLink and from conferenceData", () => {
    const hangout = asProviderEvent(
      normalizeGoogleEvent(
        gEvent({ hangoutLink: "https://meet.google.com/abc-defg-hij" }),
      ),
    );
    expect(hangout.content.conference).toEqual({
      url: "https://meet.google.com/abc-defg-hij",
      label: null,
    });

    const conferenceData = asProviderEvent(
      normalizeGoogleEvent(
        gEvent({
          conferenceData: {
            conferenceSolution: { name: "Google Meet" },
            entryPoints: [
              { entryPointType: "phone", uri: "tel:+1-555" },
              { entryPointType: "video", uri: "https://meet.google.com/xyz" },
            ],
          },
        }),
      ),
    );
    expect(conferenceData.content.conference).toEqual({
      url: "https://meet.google.com/xyz",
      label: "Google Meet",
    });
  });

  it("drops a malformed conference url instead of failing the read", () => {
    const read = asProviderEvent(
      normalizeGoogleEvent(gEvent({ hangoutLink: "not-a-url" })),
    );
    expect(read.content.conference).toBeNull();
  });

  it("throws when a non-cancelled event has no id or etag", () => {
    expect(() => normalizeGoogleEvent(gEvent({ id: undefined }))).toThrow(
      ProviderEventError,
    );
    expect(() => normalizeGoogleEvent(gEvent({ etag: undefined }))).toThrow(
      ProviderEventError,
    );
  });

  it("keeps an offset-only timed event instead of dropping it", () => {
    const read = asProviderEvent(
      normalizeGoogleEvent(
        gEvent({
          start: { dateTime: "2025-01-15T09:00:00-05:00" },
          end: { dateTime: "2025-01-15T10:00:00-05:00" },
        }),
      ),
    );
    if (read.schedule.kind !== "timed") throw new Error("expected timed");

    expect(read.schedule.timeZone).toBe("UTC");
    expect(Date.parse(read.schedule.start)).toBe(
      Date.parse("2025-01-15T09:00:00-05:00"),
    );
    expect(Date.parse(read.schedule.end)).toBe(
      Date.parse("2025-01-15T10:00:00-05:00"),
    );
  });

  it("falls back to UTC for a fixed-offset time zone instead of dropping the event", () => {
    const read = asProviderEvent(
      normalizeGoogleEvent(
        gEvent({
          start: {
            dateTime: "2025-01-15T09:00:00-07:00",
            timeZone: "GMT-07:00",
          },
          end: { dateTime: "2025-01-15T10:00:00-07:00", timeZone: "GMT-07:00" },
        }),
      ),
    );
    if (read.schedule.kind !== "timed") throw new Error("expected timed");

    expect(read.schedule.timeZone).toBe("UTC");
    expect(Date.parse(read.schedule.start)).toBe(
      Date.parse("2025-01-15T09:00:00-07:00"),
    );
  });

  it("normalizes a zero-duration timed event instead of dropping it", () => {
    // Medication-reminder and deadline-marker events legitimately have
    // start === end; Google, Outlook, and RFC 5545 all allow it.
    const read = asProviderEvent(
      normalizeGoogleEvent(
        gEvent({
          start: {
            dateTime: "2025-01-15T09:00:00-05:00",
            timeZone: "America/New_York",
          },
          end: {
            dateTime: "2025-01-15T09:00:00-05:00",
            timeZone: "America/New_York",
          },
        }),
      ),
    );
    if (read.schedule.kind !== "timed") throw new Error("expected timed");

    expect(Date.parse(read.schedule.end)).toBe(Date.parse(read.schedule.start));
  });

  it("throws a skippable ProviderEventError when content exceeds the contract", () => {
    // Google does not cap attendee display names; the neutral contract does. An
    // over-long one must surface as a skippable ProviderEventError, never a raw
    // ZodError that would escape a batch reader's per-event skip boundary.
    const error = (() => {
      try {
        normalizeGoogleEvent(
          gEvent({
            attendees: [
              { email: "guest@example.com", displayName: "x".repeat(300) },
            ],
          }),
        );
      } catch (e) {
        return e;
      }
      throw new Error("expected normalizeGoogleEvent to throw");
    })() as ProviderEventError;

    expect(error).toBeInstanceOf(ProviderEventError);
    expect(error.reason).toBe("unmappableContent");
  });

  it("maps iCalUID onto the read (the cross-account correlation key)", () => {
    const read = asProviderEvent(
      normalizeGoogleEvent(gEvent({ iCalUID: "abc123@google.com" })),
    );
    expect(read.icalUid).toBe("abc123@google.com");
  });

  it("omits icalUid when Google reports no iCalUID", () => {
    const read = asProviderEvent(normalizeGoogleEvent(gEvent({})));
    expect("icalUid" in read).toBe(false);
  });

  it("maps Google colorId 7 to content.color blue", () => {
    const read = asProviderEvent(
      normalizeGoogleEvent(gEvent({ colorId: "7" })),
    );

    expect(read.content.color).toBe("blue");
  });

  it("omits content.color when Google reports no colorId", () => {
    const read = asProviderEvent(normalizeGoogleEvent(gEvent({})));

    expect(read.content).not.toHaveProperty("color");
  });

  it("resolves an eventLabelId against the calendar's color labels to colorHex", () => {
    const colorLabels = new Map([["label-1", "#009688"]]);
    const read = asProviderEvent(
      normalizeGoogleEvent(gEvent({ eventLabelId: "label-1" }), colorLabels),
    );

    expect(read.content.colorHex).toBe("#009688");
    expect(read.content).not.toHaveProperty("color");
  });

  it("omits colorHex when the eventLabelId has no matching label (e.g. deleted)", () => {
    const read = asProviderEvent(
      normalizeGoogleEvent(
        gEvent({ eventLabelId: "gone" }),
        new Map([["other", "#123456"]]),
      ),
    );

    expect(read.content).not.toHaveProperty("colorHex");
  });

  it("omits colorHex when the event has no eventLabelId, even with labels available", () => {
    const read = asProviderEvent(
      normalizeGoogleEvent(gEvent({}), new Map([["label-1", "#009688"]])),
    );

    expect(read.content).not.toHaveProperty("colorHex");
  });

  it("defaults to no color labels when none are passed", () => {
    const read = asProviderEvent(
      normalizeGoogleEvent(gEvent({ eventLabelId: "label-1" })),
    );

    expect(read.content).not.toHaveProperty("colorHex");
  });

  it("sets providerManaged for a non-default eventType", () => {
    const read = asProviderEvent(
      normalizeGoogleEvent(gEvent({ eventType: "fromGmail" })),
    );

    expect(read.providerManaged).toBe(true);
  });

  it("omits providerManaged for eventType default", () => {
    const read = asProviderEvent(
      normalizeGoogleEvent(gEvent({ eventType: "default" })),
    );

    expect(read).not.toHaveProperty("providerManaged");
  });

  it("omits providerManaged when eventType is absent", () => {
    const read = asProviderEvent(normalizeGoogleEvent(gEvent({})));

    expect(read).not.toHaveProperty("providerManaged");
  });
});
