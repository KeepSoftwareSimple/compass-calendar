import {
  type GraphEvent,
  normalizeMicrosoftEvent,
} from "@sync/providers/microsoft/microsoft-event.normalizer";
import {
  type ProviderEvent,
  type ProviderEventCancellation,
  ProviderEventError,
} from "@sync/providers/provider-event.port";

const mEvent = (overrides: Partial<GraphEvent> = {}): GraphEvent => ({
  id: "evt-id",
  "@odata.etag": 'W/"v1"',
  type: "singleInstance",
  subject: "Title",
  start: { dateTime: "2025-01-15T14:00:00.0000000", timeZone: "UTC" },
  end: { dateTime: "2025-01-15T15:00:00.0000000", timeZone: "UTC" },
  ...overrides,
});

const asProviderEvent = (read: ReturnType<typeof normalizeMicrosoftEvent>) => {
  if (read.kind !== "event")
    throw new Error(`expected event, got ${read.kind}`);
  return read as ProviderEvent;
};

const asCancellation = (read: ReturnType<typeof normalizeMicrosoftEvent>) => {
  if (read.kind !== "cancellation") {
    throw new Error(`expected cancellation, got ${read.kind}`);
  }
  return read as ProviderEventCancellation;
};

describe("normalizeMicrosoftEvent", () => {
  it("normalizes a timed event with content and identity", () => {
    const read = asProviderEvent(
      normalizeMicrosoftEvent(
        mEvent({
          id: "AAMkAGI2TG93AAA=",
          "@odata.etag": 'W/"abc123"',
          lastModifiedDateTime: "2025-01-10T12:00:00.0000000Z",
          subject: "Team sync",
          bodyPreview: "Agenda items",
          iCalUId:
            "040000008200E00074C5B7101A82E00800000000000000000000000000000000000000000000000000",
          location: { displayName: "Room 4" },
          organizer: {
            emailAddress: { name: "Organizer", address: "org@example.com" },
          },
          showAs: "busy",
        }),
      ),
    );

    expect(read.providerEventId).toBe("AAMkAGI2TG93AAA=");
    expect(read.providerVersion).toBe('W/"abc123"');
    expect(read.providerUpdatedAt).toBe("2025-01-10T12:00:00.0000000Z");
    expect(read.busy).toBe(true);
    expect(read.recurrence).toEqual({ kind: "single" });
    expect(read.content.title).toBe("Team sync");
    expect(read.content.description).toBe("Agenda items");
    expect(read.content.location).toBe("Room 4");
    expect(read.content.organizer).toEqual({
      email: "org@example.com",
      displayName: "Organizer",
    });
    expect(read.schedule.kind).toBe("timed");
    expect(read.icalUid).toBe(
      "040000008200E00074C5B7101A82E00800000000000000000000000000000000000000000000000000",
    );
    expect(read).not.toHaveProperty("providerManaged");
  });

  it("normalizes an all-day free event", () => {
    const read = asProviderEvent(
      normalizeMicrosoftEvent(
        mEvent({
          isAllDay: true,
          showAs: "free",
          start: { dateTime: "2022-02-22T00:00:00.0000000", timeZone: "UTC" },
          end: { dateTime: "2022-02-23T00:00:00.0000000", timeZone: "UTC" },
        }),
      ),
    );

    expect(read.busy).toBe(false);
    expect(read.schedule).toEqual({
      kind: "allDay",
      start: "2022-02-22",
      end: "2022-02-23",
    });
  });

  it("strips HTML from body content", () => {
    const read = asProviderEvent(
      normalizeMicrosoftEvent(
        mEvent({
          bodyPreview: "Preview only",
          body: {
            contentType: "html",
            content: "<p>Hello <b>world</b></p><br/>Line two",
          },
        }),
      ),
    );

    expect(read.content.description).toBe("Hello world\n\nLine two");
  });

  it("uses plain text body content when contentType is text", () => {
    const read = asProviderEvent(
      normalizeMicrosoftEvent(
        mEvent({
          body: { contentType: "text", content: "Plain description" },
        }),
      ),
    );

    expect(read.content.description).toBe("Plain description");
  });

  it("maps a series master to RRULE rules", () => {
    const read = asProviderEvent(
      normalizeMicrosoftEvent(
        mEvent({
          type: "seriesMaster",
          recurrence: {
            pattern: { type: "daily", interval: 1 },
            range: {
              type: "endDate",
              startDate: "2025-09-07",
              endDate: "2025-09-16",
            },
          },
        }),
      ),
    );

    expect(read.recurrence).toEqual({
      kind: "seriesMaster",
      rules: ["RRULE:FREQ=DAILY;UNTIL=20250916T235959Z"],
    });
  });

  it("maps an exception to its series link and recurrence id", () => {
    const read = asProviderEvent(
      normalizeMicrosoftEvent(
        mEvent({
          type: "exception",
          seriesMasterId: "series-master-id",
          originalStart: "2025-09-08T01:30:00.0000000Z",
          subject: "Moved occurrence",
        }),
      ),
    );

    expect(read.recurrence).toEqual({
      kind: "instance",
      seriesProviderId: "series-master-id",
      recurrenceId: "2025-09-08T01:30:00.000Z",
    });
  });

  it("maps a cancelled exception to a cancellation with its series link", () => {
    const read = asCancellation(
      normalizeMicrosoftEvent(
        mEvent({
          isCancelled: true,
          type: "exception",
          seriesMasterId: "series-master-id",
          originalStart: "2013-05-08T22:00:00.0000000Z",
        }),
      ),
    );

    expect(read.series).toEqual({
      seriesProviderId: "series-master-id",
      recurrenceId: "2013-05-08T22:00:00.000Z",
    });
  });

  it("keeps a cancelled event even when etag is absent", () => {
    const read = asCancellation(
      normalizeMicrosoftEvent(
        mEvent({
          isCancelled: true,
          "@odata.etag": undefined,
        }),
      ),
    );

    expect(read.providerVersion).toBe("");
  });

  it("throws unmappableContent for occurrence rows", () => {
    expect(() =>
      normalizeMicrosoftEvent(mEvent({ type: "occurrence" })),
    ).toThrow(ProviderEventError);

    try {
      normalizeMicrosoftEvent(mEvent({ type: "occurrence" }));
    } catch (error) {
      expect((error as ProviderEventError).reason).toBe("unmappableContent");
    }
  });

  it("maps every attendee response value and skips resource attendees", () => {
    const read = asProviderEvent(
      normalizeMicrosoftEvent(
        mEvent({
          attendees: [
            {
              type: "required",
              emailAddress: { address: "a@x.com", name: "A" },
              status: { response: "accepted" },
            },
            {
              type: "optional",
              emailAddress: { address: "b@x.com" },
              status: { response: "declined" },
            },
            {
              type: "required",
              emailAddress: { address: "c@x.com" },
              status: { response: "tentativelyAccepted" },
            },
            {
              type: "required",
              emailAddress: { address: "d@x.com" },
              status: { response: "none" },
            },
            {
              type: "required",
              emailAddress: { address: "e@x.com" },
              status: { response: "notResponded" },
            },
            {
              type: "required",
              emailAddress: { address: "f@x.com" },
              status: { response: "organizer" },
            },
            {
              type: "required",
              emailAddress: { address: "g@x.com" },
              status: { response: "bogus" },
            },
            {
              type: "resource",
              emailAddress: { address: "room@x.com", name: "Room" },
              status: { response: "accepted" },
            },
            { type: "required", emailAddress: { name: "No email" } },
          ],
        }),
      ),
    );

    expect(read.content.attendees).toEqual([
      { email: "a@x.com", displayName: "A", responseStatus: "accepted" },
      { email: "b@x.com", displayName: null, responseStatus: "declined" },
      { email: "c@x.com", displayName: null, responseStatus: "tentative" },
      { email: "d@x.com", displayName: null, responseStatus: "needsAction" },
      { email: "e@x.com", displayName: null, responseStatus: "needsAction" },
      { email: "f@x.com", displayName: null, responseStatus: "accepted" },
      { email: "g@x.com", displayName: null, responseStatus: "needsAction" },
    ]);
  });

  it("maps a Teams online meeting to conference url and label", () => {
    const read = asProviderEvent(
      normalizeMicrosoftEvent(
        mEvent({
          onlineMeeting: {
            joinUrl: "https://teams.microsoft.com/l/meetup-join/abc",
          },
          onlineMeetingProvider: "teamsForBusiness",
        }),
      ),
    );

    expect(read.content.conference).toEqual({
      url: "https://teams.microsoft.com/l/meetup-join/abc",
      label: "Microsoft Teams",
    });
  });

  it("drops a malformed conference url instead of failing the read", () => {
    const read = asProviderEvent(
      normalizeMicrosoftEvent(
        mEvent({
          onlineMeeting: { joinUrl: "not-a-url" },
          onlineMeetingProvider: "teamsForBusiness",
        }),
      ),
    );

    expect(read.content.conference).toBeNull();
  });

  it("resolves category color from masterCategories", () => {
    const masterCategories = new Map([["Blue category", "#0078D4"]]);
    const read = asProviderEvent(
      normalizeMicrosoftEvent(
        mEvent({ categories: ["Blue category"] }),
        masterCategories,
      ),
    );

    expect(read.content.colorHex).toBe("#0078D4");
  });

  it("omits colorHex when the category has no matching color", () => {
    const read = asProviderEvent(
      normalizeMicrosoftEvent(
        mEvent({ categories: ["Unknown"] }),
        new Map([["Other", "#123456"]]),
      ),
    );

    expect(read.content).not.toHaveProperty("colorHex");
  });

  it("throws missingIdentity when id or etag is absent on active events", () => {
    expect(() => normalizeMicrosoftEvent(mEvent({ id: undefined }))).toThrow(
      ProviderEventError,
    );
    expect(() =>
      normalizeMicrosoftEvent(mEvent({ "@odata.etag": undefined })),
    ).toThrow(ProviderEventError);
  });

  it("treats showAs values other than free as busy", () => {
    for (const showAs of [
      "tentative",
      "busy",
      "oof",
      "workingElsewhere",
      "unknown",
    ]) {
      const read = asProviderEvent(normalizeMicrosoftEvent(mEvent({ showAs })));
      expect(read.busy).toBe(true);
    }
  });

  it("throws a skippable ProviderEventError when content exceeds the contract", () => {
    const error = (() => {
      try {
        normalizeMicrosoftEvent(
          mEvent({
            attendees: [
              {
                type: "required",
                emailAddress: {
                  address: "guest@example.com",
                  name: "x".repeat(300),
                },
              },
            ],
          }),
        );
      } catch (e) {
        return e;
      }
      throw new Error("expected normalizeMicrosoftEvent to throw");
    })() as ProviderEventError;

    expect(error).toBeInstanceOf(ProviderEventError);
    expect(error.reason).toBe("unmappableContent");
  });
});
