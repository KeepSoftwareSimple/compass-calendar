import {
  AppleEventReaderAdapter,
  type AppleEventReaderApi,
  type AppleEventResource,
  type AppleSyncCollectionPage,
  MULTIGET_BATCH_SIZE,
} from "@sync/providers/apple/apple-event-reader.adapter";
import { ProviderEventReadError } from "@sync/providers/provider-event-reader.port";

class ScriptedAppleEventReaderApi implements AppleEventReaderApi {
  calls: Array<{ method: string; args: unknown[] }> = [];
  #handlers: Partial<
    Record<
      keyof AppleEventReaderApi,
      (...args: unknown[]) => Promise<unknown> | unknown
    >
  >;

  constructor(
    handlers: Partial<
      Record<
        keyof AppleEventReaderApi,
        (...args: unknown[]) => Promise<unknown> | unknown
      >
    >,
  ) {
    this.#handlers = handlers;
  }

  calendarQuery(
    calendarUrl: string,
    window: { timeMin: string; timeMax: string },
  ): Promise<readonly string[]> {
    this.calls.push({ method: "calendarQuery", args: [calendarUrl, window] });
    return Promise.resolve(
      (this.#handlers.calendarQuery?.(calendarUrl, window) as
        | readonly string[]
        | undefined) ?? [],
    );
  }

  calendarMultiget(
    calendarUrl: string,
    hrefs: readonly string[],
  ): Promise<readonly AppleEventResource[]> {
    this.calls.push({ method: "calendarMultiget", args: [calendarUrl, hrefs] });
    return Promise.resolve(
      (this.#handlers.calendarMultiget?.(calendarUrl, hrefs) as
        | readonly AppleEventResource[]
        | undefined) ?? [],
    );
  }

  syncCollection(
    calendarUrl: string,
    syncToken: string,
  ): Promise<AppleSyncCollectionPage> {
    this.calls.push({
      method: "syncCollection",
      args: [calendarUrl, syncToken],
    });
    const result = this.#handlers.syncCollection?.(calendarUrl, syncToken);
    if (!result) {
      throw new Error("syncCollection not scripted");
    }
    return Promise.resolve(result as AppleSyncCollectionPage);
  }

  fetchSyncToken(calendarUrl: string): Promise<string | null> {
    this.calls.push({ method: "fetchSyncToken", args: [calendarUrl] });
    return Promise.resolve(
      (this.#handlers.fetchSyncToken?.(calendarUrl) as
        | string
        | null
        | undefined) ?? null,
    );
  }
}

const timedIcs = (uid: string, summary: string) => `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:${uid}
DTSTAMP:20250101T120000Z
DTSTART:20250115T090000Z
DTEND:20250115T100000Z
SUMMARY:${summary}
END:VEVENT
END:VCALENDAR`;

const unusableIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
SUMMARY:No uid
END:VEVENT
END:VCALENDAR`;

function resource(
  href: string,
  uid: string,
  summary: string,
): AppleEventResource {
  return {
    href,
    etag: `"etag-${uid}"`,
    ics: timedIcs(uid, summary),
  };
}

function makeHrefs(count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) => `/123/calendars/home/event-${index}.ics`,
  );
}

function adapterWith(api: AppleEventReaderApi) {
  return new AppleEventReaderAdapter("user@icloud.com", {
    connectionTimeZone: "UTC",
    makeApi: () => api,
    log: { warn: () => {} },
  });
}

describe("AppleEventReaderAdapter", () => {
  it("replays initial calendar-query plus multiget in two batches", async () => {
    const hrefs = makeHrefs(MULTIGET_BATCH_SIZE + 3);
    const api = new ScriptedAppleEventReaderApi({
      calendarQuery: async () => hrefs,
      calendarMultiget: async (_calendarUrl, batch) =>
        (batch as string[]).map((href, index) =>
          resource(href, `uid-${index}`, `Event ${index}`),
        ),
      fetchSyncToken: async () => "sync-token-final",
    });
    const adapter = adapterWith(api);

    const first = await adapter.listEventPage({
      accessToken: "secret",
      calendarId: "/123/calendars/home/",
    });

    expect(first.events).toHaveLength(MULTIGET_BATCH_SIZE);
    expect(first.nextPageToken).toBe(String(MULTIGET_BATCH_SIZE));
    expect(first.nextSyncToken).toBeNull();

    const second = await adapter.listEventPage({
      accessToken: "secret",
      calendarId: "/123/calendars/home/",
      pageToken: first.nextPageToken,
    });

    expect(second.events).toHaveLength(3);
    expect(second.nextPageToken).toBeNull();
    expect(second.nextSyncToken).toBe("sync-token-final");
    expect(
      api.calls.filter((call) => call.method === "calendarQuery"),
    ).toHaveLength(1);
    expect(
      api.calls.filter((call) => call.method === "calendarMultiget"),
    ).toHaveLength(2);
  });

  it("replays sync-collection with one change and one deletion", async () => {
    const api = new ScriptedAppleEventReaderApi({
      syncCollection: async () => ({
        changedHrefs: ["/123/calendars/home/changed.ics"],
        deletedHrefs: ["/123/calendars/home/deleted.ics"],
        nextSyncToken: "sync-token-2",
        truncated: false,
      }),
      calendarMultiget: async () => [
        resource(
          "/123/calendars/home/changed.ics",
          "changed@icloud.com",
          "Changed",
        ),
      ],
    });
    const adapter = adapterWith(api);

    const page = await adapter.listEventPage({
      accessToken: "secret",
      calendarId: "/123/calendars/home/",
      cursor: "sync-token-1",
    });

    expect(page.events.map((event) => event.kind)).toEqual([
      "event",
      "cancellation",
    ]);
    expect(
      page.events[0]?.kind === "event" && page.events[0].resourceHref,
    ).toBe("/123/calendars/home/changed.ics");
    expect(
      page.events[1]?.kind === "cancellation" && page.events[1].providerEventId,
    ).toBe("/123/calendars/home/deleted.ics");
    expect(page.nextSyncToken).toBe("sync-token-2");
  });

  it("returns nextPageToken for a truncated sync-collection", async () => {
    const api = new ScriptedAppleEventReaderApi({
      syncCollection: async () => ({
        changedHrefs: ["/123/calendars/home/partial.ics"],
        deletedHrefs: [],
        nextSyncToken: "sync-token-partial",
        truncated: true,
      }),
      calendarMultiget: async () => [
        resource(
          "/123/calendars/home/partial.ics",
          "partial@icloud.com",
          "Partial",
        ),
      ],
    });
    const adapter = adapterWith(api);

    const page = await adapter.listEventPage({
      accessToken: "secret",
      calendarId: "/123/calendars/home/",
      cursor: "sync-token-1",
    });

    expect(page.nextPageToken).toBe("sync-token-partial");
    expect(page.nextSyncToken).toBeNull();
  });

  it("maps an invalid sync-token to cursorExpired", async () => {
    const api = new ScriptedAppleEventReaderApi({
      syncCollection: async () => {
        throw new ProviderEventReadError(
          "cursorExpired",
          "Apple sync token is no longer valid",
        );
      },
    });
    const adapter = adapterWith(api);

    await expect(
      adapter.listEventPage({
        accessToken: "secret",
        calendarId: "/123/calendars/home/",
        cursor: "stale-sync-token",
      }),
    ).rejects.toMatchObject({ reason: "cursorExpired" });
  });

  it("maps 503 to transient", async () => {
    const api = new ScriptedAppleEventReaderApi({
      syncCollection: async () => {
        throw new ProviderEventReadError(
          "transient",
          "Apple CalDAV throttled or unavailable (503)",
        );
      },
    });
    const adapter = adapterWith(api);

    await expect(
      adapter.listEventPage({
        accessToken: "secret",
        calendarId: "/123/calendars/home/",
        cursor: "sync-token-1",
      }),
    ).rejects.toMatchObject({ reason: "transient" });
  });

  it("counts skipped resources that fail normalization", async () => {
    const api = new ScriptedAppleEventReaderApi({
      calendarQuery: async () => ["/123/calendars/home/bad.ics"],
      calendarMultiget: async () => [
        {
          href: "/123/calendars/home/bad.ics",
          etag: '"bad"',
          ics: unusableIcs,
        },
      ],
      fetchSyncToken: async () => "sync-token-final",
    });
    const adapter = adapterWith(api);

    const page = await adapter.listEventPage({
      accessToken: "secret",
      calendarId: "/123/calendars/home/",
    });

    expect(page.skipped).toBe(1);
    expect(page.events).toHaveLength(0);
  });

  it("does not return a sync token for a windowed pass", async () => {
    const api = new ScriptedAppleEventReaderApi({
      calendarQuery: async () => ["/123/calendars/home/window.ics"],
      calendarMultiget: async () => [
        resource(
          "/123/calendars/home/window.ics",
          "window@icloud.com",
          "Window",
        ),
      ],
    });
    const adapter = adapterWith(api);

    const page = await adapter.listEventPage({
      accessToken: "secret",
      calendarId: "/123/calendars/home/",
      window: {
        timeMin: "2026-01-01T00:00:00Z",
        timeMax: "2026-06-01T00:00:00Z",
      },
    });

    expect(page.nextSyncToken).toBeNull();
    expect(api.calls.some((call) => call.method === "fetchSyncToken")).toBe(
      false,
    );
  });
});
