import { type EventSchedule } from "@core/types/event.contracts";
import { type SyncEventContent } from "@core/types/sync/event.contracts";
import {
  AppleEventWriter,
  type AppleEventWriterApi,
  appendExdateToMaster,
  eventResourceHref,
} from "@sync/providers/apple/apple-event-writer.adapter";
import { parseAppleInstanceId } from "@sync/providers/apple/apple-instance-id";
import { type CaldavResponse } from "@sync/providers/apple/caldav-client";

const CALENDAR = "https://caldav.icloud.com/123/calendars/home/";
const TOKEN = "secret";

function response(
  status: number,
  options: {
    body?: string;
    etag?: string;
    multistatus?: CaldavResponse["multistatus"];
  } = {},
): CaldavResponse {
  const headers: Record<string, string> = {};
  if (options.etag) headers.etag = options.etag;
  return {
    status,
    headers,
    body: options.body ?? "",
    multistatus: options.multistatus ?? null,
  };
}

const MASTER_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:series-1
DTSTAMP:20250101T120000Z
DTSTART:20250115T090000Z
DTEND:20250115T100000Z
RRULE:FREQ=DAILY;COUNT=3
SUMMARY:Series
END:VEVENT
END:VCALENDAR`;

class FakeWriterApi implements AppleEventWriterApi {
  calls = {
    put: [] as Array<{
      url: string;
      ics: string;
      ifMatch?: string;
      ifNoneMatch?: string;
    }>,
    get: [] as string[],
    delete: [] as Array<{ url: string; ifMatch?: string }>,
    propfind: [] as string[],
  };

  #store = new Map<string, { etag: string; ics: string }>();
  #etagCounter = 1;

  constructor(initial?: Record<string, { etag: string; ics: string }>) {
    for (const [url, value] of Object.entries(initial ?? {})) {
      this.#store.set(url, value);
    }
  }

  put(
    url: string,
    ics: string,
    options: { ifMatch?: string; ifNoneMatch?: string } = {},
  ): Promise<CaldavResponse> {
    this.calls.put.push({ url, ics, ...options });
    const existing = this.#store.get(url);

    if (options.ifNoneMatch === "*" && existing) {
      return Promise.resolve(response(412));
    }
    if (options.ifMatch && existing && options.ifMatch !== existing.etag) {
      return Promise.resolve(response(412));
    }

    const etag = `"v${this.#etagCounter++}"`;
    this.#store.set(url, { etag, ics });
    return Promise.resolve(response(201, { etag }));
  }

  get(url: string): Promise<CaldavResponse> {
    this.calls.get.push(url);
    const existing = this.#store.get(url);
    if (!existing) return Promise.resolve(response(404));
    return Promise.resolve(
      response(200, { body: existing.ics, etag: existing.etag }),
    );
  }

  delete(url: string, ifMatch?: string): Promise<CaldavResponse> {
    this.calls.delete.push({ url, ifMatch });
    const existing = this.#store.get(url);
    if (!existing) return Promise.resolve(response(404));
    if (ifMatch && ifMatch !== existing.etag) {
      return Promise.resolve(response(412));
    }
    this.#store.delete(url);
    return Promise.resolve(response(204));
  }

  propfind(url: string): Promise<CaldavResponse> {
    this.calls.propfind.push(url);
    const existing = this.#store.get(url);
    if (!existing) return Promise.resolve(response(404));
    return Promise.resolve(
      response(207, {
        multistatus: {
          responses: [
            {
              href: url,
              propstats: [
                {
                  status: 200,
                  props: { getetag: existing.etag },
                },
              ],
            },
          ],
        },
      }),
    );
  }
}

const writerWith = (api: AppleEventWriterApi) =>
  new AppleEventWriter({ makeApi: () => api });

const content = (
  overrides: Partial<SyncEventContent> = {},
): SyncEventContent => ({
  title: "Title",
  description: "Desc",
  location: null,
  organizer: null,
  attendees: [],
  conference: null,
  ...overrides,
});

const schedule: EventSchedule = {
  kind: "timed",
  start: "2025-01-15T09:00:00-05:00",
  end: "2025-01-15T10:00:00-05:00",
  timeZone: "America/New_York",
};

describe("AppleEventWriter createEvent", () => {
  it("PUTs a new resource with If-None-Match and returns etag from the response", async () => {
    const api = new FakeWriterApi();
    const writer = writerWith(api);

    const result = await writer.createEvent({
      accessToken: TOKEN,
      calendarId: CALENDAR,
      providerEventId: "abc12deadbeef00000000000",
      content: content(),
      schedule,
      recurrence: { kind: "single" },
      invitation: "none",
    });

    expect(result.providerEventId).toBe("abc12deadbeef00000000000");
    expect(result.providerVersion).toBe('"v1"');
    expect(result.resourceHref).toBe(
      eventResourceHref(CALENDAR, "abc12deadbeef00000000000"),
    );
    expect(api.calls.put[0]).toEqual({
      url: eventResourceHref(CALENDAR, "abc12deadbeef00000000000"),
      ics: expect.stringContaining("UID:abc12deadbeef00000000000"),
      ifNoneMatch: "*",
    });
  });

  it("follows PROPFIND when the PUT response omits an etag", async () => {
    class NoEtagPutApi implements AppleEventWriterApi {
      calls = { propfind: [] as string[] };
      #store = new Map<string, { etag: string; ics: string }>();

      put(url: string, ics: string): Promise<CaldavResponse> {
        const etag = '"propfind-etag"';
        this.#store.set(url, { etag, ics });
        return Promise.resolve(response(204));
      }

      get(url: string): Promise<CaldavResponse> {
        const existing = this.#store.get(url);
        if (!existing) return Promise.resolve(response(404));
        return Promise.resolve(
          response(200, { body: existing.ics, etag: existing.etag }),
        );
      }

      delete(): Promise<CaldavResponse> {
        return Promise.resolve(response(404));
      }

      propfind(url: string): Promise<CaldavResponse> {
        this.calls.propfind.push(url);
        return Promise.resolve(
          response(207, {
            multistatus: {
              responses: [
                {
                  href: url,
                  propstats: [
                    { status: 200, props: { getetag: '"propfind-etag"' } },
                  ],
                },
              ],
            },
          }),
        );
      }
    }

    const api = new NoEtagPutApi();
    const writer = writerWith(api);
    const result = await writer.createEvent({
      accessToken: TOKEN,
      calendarId: CALENDAR,
      providerEventId: "new-uid",
      content: content(),
      schedule,
      recurrence: { kind: "single" },
      invitation: "none",
    });

    expect(result.providerVersion).toBe('"propfind-etag"');
    expect(api.calls.propfind).toHaveLength(1);
  });

  it("reads back an existing resource when create hits a duplicate", async () => {
    const href = eventResourceHref(CALENDAR, "dup-uid");
    const api = new FakeWriterApi({
      [href]: { etag: '"existing"', ics: MASTER_ICS },
    });
    const writer = writerWith(api);

    const result = await writer.createEvent({
      accessToken: TOKEN,
      calendarId: CALENDAR,
      providerEventId: "dup-uid",
      content: content(),
      schedule,
      recurrence: { kind: "single" },
      invitation: "none",
    });

    expect(result.providerVersion).toBe('"existing"');
    expect(api.calls.get).toContain(href);
  });
});

describe("AppleEventWriter patchEvent", () => {
  it("returns versionConflict for a stale etag", async () => {
    const href = eventResourceHref(CALENDAR, "patch-uid");
    const api = new FakeWriterApi({
      [href]: {
        etag: '"current"',
        ics: `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:patch-uid
DTSTAMP:20250101T120000Z
DTSTART:20250115T090000Z
DTEND:20250115T100000Z
SUMMARY:Old
END:VEVENT
END:VCALENDAR`,
      },
    });
    const writer = writerWith(api);

    await expect(
      writer.patchEvent({
        accessToken: TOKEN,
        calendarId: CALENDAR,
        providerEventId: "patch-uid",
        expectedVersion: "stale-version-that-must-conflict",
        content: content({ title: "New" }),
        schedule,
        recurrence: { kind: "single" },
        invitation: "none",
      }),
    ).rejects.toMatchObject({ reason: "versionConflict" });
  });
});

describe("AppleEventWriter deleteEvent", () => {
  it("writes EXDATE on the master when deleting one instance", async () => {
    const href = eventResourceHref(CALENDAR, "series-1");
    const api = new FakeWriterApi({
      [href]: { etag: '"series"', ics: MASTER_ICS },
    });
    const writer = writerWith(api);
    const instanceId = "series-1_20250116T090000Z";

    await writer.deleteEvent({
      accessToken: TOKEN,
      calendarId: CALENDAR,
      providerEventId: instanceId,
      expectedVersion: '"series"',
      invitation: "none",
    });

    expect(api.calls.delete).toHaveLength(0);
    expect(api.calls.put).toHaveLength(1);
    expect(api.calls.put[0]?.ics).toContain("EXDATE:20250116T090000Z");
  });

  it("treats deleting an absent standalone event as success", async () => {
    const api = new FakeWriterApi();
    const writer = writerWith(api);

    await writer.deleteEvent({
      accessToken: TOKEN,
      calendarId: CALENDAR,
      providerEventId: "missing-uid",
      expectedVersion: null,
      invitation: "none",
    });

    expect(api.calls.delete[0]?.url).toBe(
      eventResourceHref(CALENDAR, "missing-uid"),
    );
  });
});

describe("AppleEventWriter invitation scheduling", () => {
  it("maps invitation none to SCHEDULE-AGENT=CLIENT on attendees", async () => {
    const api = new FakeWriterApi();
    const writer = writerWith(api);

    await writer.createEvent({
      accessToken: TOKEN,
      calendarId: CALENDAR,
      providerEventId: "guest-uid",
      content: content({
        attendees: [
          {
            email: "guest@example.com",
            displayName: "Guest",
            responseStatus: "needsAction",
          },
        ],
      }),
      schedule,
      recurrence: { kind: "single" },
      invitation: "none",
      attendees: [
        {
          email: "guest@example.com",
          displayName: "Guest",
          responseStatus: "needsAction",
        },
      ],
    });

    expect(api.calls.put[0]?.ics).toContain("SCHEDULE-AGENT=CLIENT");
  });

  it("maps invitation all to SCHEDULE-AGENT=SERVER on attendees", async () => {
    const api = new FakeWriterApi();
    const writer = writerWith(api);

    await writer.createEvent({
      accessToken: TOKEN,
      calendarId: CALENDAR,
      providerEventId: "guest-server",
      content: content(),
      schedule,
      recurrence: { kind: "single" },
      invitation: "all",
      attendees: [
        {
          email: "guest@example.com",
          displayName: null,
          responseStatus: "needsAction",
        },
      ],
    });

    expect(api.calls.put[0]?.ics).toContain("SCHEDULE-AGENT=SERVER");
  });
});

describe("AppleEventWriter error mapping", () => {
  it.each([
    [401, "authorizationRevoked"],
    [403, "readOnlyCalendar"],
    [429, "transient"],
    [503, "transient"],
    [507, "permanentProviderError"],
  ] as const)("maps HTTP %i to %s on create", async (status, reason) => {
    class StatusApi extends FakeWriterApi {
      put(): Promise<CaldavResponse> {
        return Promise.resolve(response(status));
      }
    }

    const writer = writerWith(new StatusApi());
    await expect(
      writer.createEvent({
        accessToken: TOKEN,
        calendarId: CALENDAR,
        providerEventId: "err-uid",
        content: content(),
        schedule,
        recurrence: { kind: "single" },
        invitation: "none",
      }),
    ).rejects.toMatchObject({ reason });
  });

  it("maps HTTP 412 to versionConflict on patch", async () => {
    const href = eventResourceHref(CALENDAR, "conflict-uid");
    const api = new FakeWriterApi({
      [href]: {
        etag: '"current"',
        ics: `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:conflict-uid
DTSTAMP:20250101T120000Z
DTSTART:20250115T090000Z
DTEND:20250115T100000Z
SUMMARY:Old
END:VEVENT
END:VCALENDAR`,
      },
    });
    const writer = writerWith(api);

    await expect(
      writer.patchEvent({
        accessToken: TOKEN,
        calendarId: CALENDAR,
        providerEventId: "conflict-uid",
        expectedVersion: "stale-version-that-must-conflict",
        content: content({ title: "New" }),
        schedule,
        recurrence: { kind: "single" },
        invitation: "none",
      }),
    ).rejects.toMatchObject({ reason: "versionConflict" });
  });
});

describe("AppleEventWriter fetchInstanceAt", () => {
  it("returns a synthesized instance from the series master", async () => {
    const href = eventResourceHref(CALENDAR, "series-1");
    const api = new FakeWriterApi({
      [href]: { etag: '"series"', ics: MASTER_ICS },
    });
    const writer = writerWith(api);

    const instance = await writer.fetchInstanceAt({
      accessToken: TOKEN,
      calendarId: CALENDAR,
      seriesProviderEventId: "series-1",
      originalStartAt: "2025-01-15T14:00:00.000Z",
      scheduleKind: "timed",
    });

    expect(instance?.providerEventId).toBe("series-1_20250115T140000Z");
    expect(instance?.providerVersion).toBe('"series"');
  });
});

describe("parseAppleInstanceId", () => {
  it("parses timed instance ids", () => {
    expect(parseAppleInstanceId("series-1_20250116T090000Z")).toEqual({
      seriesUid: "series-1",
      originalStartAt: new Date("2025-01-16T09:00:00.000Z").toISOString(),
      scheduleKind: "timed",
    });
  });
});

describe("appendExdateToMaster", () => {
  it("adds EXDATE and removes a matching exception VEVENT", () => {
    const withException = `${MASTER_ICS.replace(
      "END:VCALENDAR",
      `BEGIN:VEVENT
UID:series-1
RECURRENCE-ID:20250116T090000Z
DTSTART:20250116T100000Z
DTEND:20250116T110000Z
SUMMARY:Moved
END:VEVENT
END:VCALENDAR`,
    )}`;

    const patched = appendExdateToMaster(
      withException,
      "2025-01-16T09:00:00.000Z",
      "timed",
    );

    expect(patched).toContain("EXDATE:20250116T090000Z");
    expect(patched).not.toContain("SUMMARY:Moved");
  });
});
