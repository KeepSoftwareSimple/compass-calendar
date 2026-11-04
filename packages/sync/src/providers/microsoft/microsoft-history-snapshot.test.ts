import { MicrosoftEventReaderAdapter } from "@sync/providers/microsoft/microsoft-event-reader.adapter";
import { afterEach, describe, expect, it, mock } from "bun:test";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
});
const single = {
  id: "single",
  "@odata.etag": "single-v1",
  type: "singleInstance",
  subject: "Old trip",
  start: { dateTime: "2010-04-01T10:00:00", timeZone: "UTC" },
  end: { dateTime: "2010-04-01T11:00:00", timeZone: "UTC" },
};
const master = {
  ...single,
  id: "master",
  "@odata.etag": "master-v1",
  type: "seriesMaster",
  subject: "Morning walk",
  originalStartTimeZone: "Mountain Standard Time",
  start: { dateTime: "2018-01-01T16:00:00", timeZone: "UTC" },
  end: { dateTime: "2018-01-01T17:00:00", timeZone: "UTC" },
  recurrence: {
    pattern: { type: "daily", interval: 1 },
    range: {
      type: "noEnd",
      startDate: "2018-01-01",
      recurrenceTimeZone: "Mountain Standard Time",
    },
  },
  exceptionOccurrences: [{ id: "exception" }],
  cancelledOccurrences: ["OID.master.2026-11-01"],
};
const exception = {
  ...single,
  id: "exception",
  "@odata.etag": "exception-v1",
  type: "exception",
  seriesMasterId: "master",
  originalStart: "2020-06-01T15:00:00Z",
  originalStartTimeZone: "Mountain Standard Time",
  start: { dateTime: "2020-06-01T18:00:00", timeZone: "UTC" },
  end: { dateTime: "2020-06-01T19:00:00", timeZone: "UTC" },
};

describe("Microsoft production history snapshots", () => {
  it("reads unbounded singles, hydrates series exceptions, and preserves cancellation instants across DST", async () => {
    const calls: URL[] = [];
    globalThis.fetch = mock(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      calls.push(url);
      const body = url.pathname.endsWith("/events/master")
        ? master
        : url.pathname.endsWith("/events/exception")
          ? exception
          : { value: [single, master] };
      return Response.json(body);
    }) as typeof fetch;
    const adapter = new MicrosoftEventReaderAdapter();
    const page = await adapter.listEventPage({
      accessToken: "secret",
      calendarId: "calendar",
    });
    expect(adapter.supportsFullHistory).toBe(true);
    expect(adapter.fullSnapshotOnly).toBe(true);
    expect(calls[0]?.pathname).toBe("/v1.0/me/calendars/calendar/events");
    expect(calls[0]?.searchParams.has("startDateTime")).toBe(false);
    expect(
      calls.every(
        (url) =>
          !url.pathname.includes("/delta") && !url.pathname.includes("/beta"),
      ),
    ).toBe(true);
    expect(page.skipped).toBe(0);
    expect(page.nextSyncToken).toBe("full-snapshot:v1");
    expect(page.events).toHaveLength(4);
    const series = page.events.find(
      (event) => event.providerEventId === "master",
    );
    expect(
      series?.kind === "event" &&
        series.schedule.kind === "timed" &&
        series.schedule.timeZone,
    ).toBe("America/Denver");
    const moved = page.events.find(
      (event) => event.providerEventId === "exception",
    );
    expect(moved?.kind === "event" && moved.recurrence).toEqual({
      kind: "instance",
      seriesProviderId: "master",
      recurrenceId: "2020-06-01T15:00:00.000Z",
    });
    const cancelled = page.events.find(
      (event) => event.kind === "cancellation",
    );
    expect(cancelled?.kind === "cancellation" && cancelled.series).toEqual({
      seriesProviderId: "master",
      recurrenceId: "2026-11-01T16:00:00.000Z",
    });
  });

  it("checkpoints provider pages and only marks completion on the final page", async () => {
    const next =
      "https://graph.microsoft.com/v1.0/me/calendars/calendar/events?$skiptoken=next";
    globalThis.fetch = mock(async (input: string | URL | Request) =>
      Response.json(
        String(input) === next
          ? { value: [single] }
          : { value: [], "@odata.nextLink": next },
      ),
    ) as typeof fetch;
    const adapter = new MicrosoftEventReaderAdapter();
    const first = await adapter.listEventPage({
      accessToken: "secret",
      calendarId: "calendar",
    });
    expect(first.nextSyncToken).toBeNull();
    const final = await adapter.listEventPage({
      accessToken: "secret",
      calendarId: "calendar",
      pageToken: first.nextPageToken,
    });
    expect(final.events).toHaveLength(1);
    expect(final.nextPageToken).toBeNull();
    expect(final.nextSyncToken).toBe("full-snapshot:v1");
  });

  it("refuses incomplete series expansion and foreign pagination rather than certifying partial history", async () => {
    // The first response must be a list before the master can be hydrated.
    let first = true;
    globalThis.fetch = mock(async () => {
      if (first) {
        first = false;
        return Response.json({ value: [master] });
      }
      return Response.json({ ...master, exceptionOccurrences: undefined });
    }) as typeof fetch;
    const adapter = new MicrosoftEventReaderAdapter();
    await expect(
      adapter.listEventPage({ accessToken: "secret", calendarId: "calendar" }),
    ).rejects.toBeDefined();
    const send = mock(async () => Response.json({ value: [] }));
    globalThis.fetch = send as typeof fetch;
    await expect(
      adapter.listEventPage({
        accessToken: "secret",
        calendarId: "calendar",
        pageToken: "https://untrusted.example/events",
      }),
    ).rejects.toBeDefined();
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses cyclic exception pagination instead of hanging a background import", async () => {
    const next =
      "https://graph.microsoft.com/v1.0/me/events/master/exceptionOccurrences?page=2";
    const send = mock(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/events/master"))
        return Response.json({
          ...master,
          exceptionOccurrences: [],
          "exceptionOccurrences@odata.nextLink": next,
        });
      if (String(input) === next)
        return Response.json({ value: [], "@odata.nextLink": next });
      return Response.json({ value: [master] });
    });
    globalThis.fetch = send as typeof fetch;
    await expect(
      new MicrosoftEventReaderAdapter().listEventPage({
        accessToken: "secret",
        calendarId: "calendar",
      }),
    ).rejects.toBeDefined();
    expect(send).toHaveBeenCalledTimes(3);
  });
});
