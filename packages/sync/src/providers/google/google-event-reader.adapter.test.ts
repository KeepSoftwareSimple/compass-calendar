import { type gSchema$Event } from "@core/types/gcal";
import {
  type GoogleEventListApi,
  type GoogleEventListPage,
  GoogleEventReaderAdapter,
} from "@sync/providers/google/google-event-reader.adapter";
import { ProviderEventReadError } from "@sync/providers/provider-event-reader.port";

// A fake events.list API returning scripted pages in order, recording the
// params it was called with so tests can assert window/cursor/pagination.
const expectListPageError = async (
  adapter: GoogleEventReaderAdapter,
  input: Parameters<GoogleEventReaderAdapter["listEventPage"]>[0],
): Promise<ProviderEventReadError> => {
  try {
    await adapter.listEventPage(input);
    throw new Error("expected listEventPage to throw");
  } catch (error) {
    if (!(error instanceof ProviderEventReadError)) {
      throw error;
    }
    return error;
  }
};

class FakeEventListApi implements GoogleEventListApi {
  calls: Array<Parameters<GoogleEventListApi["listPage"]>[0]> = [];
  #pages: GoogleEventListPage[];
  #error?: unknown;

  constructor(pages: GoogleEventListPage[], error?: unknown) {
    this.#pages = pages;
    this.#error = error;
  }

  async listPage(
    params: Parameters<GoogleEventListApi["listPage"]>[0],
  ): Promise<GoogleEventListPage> {
    this.calls.push(params);
    if (this.#error) throw this.#error;
    const page = this.#pages.shift();
    if (!page) throw new Error("FakeEventListApi: no page scripted");
    return page;
  }
}

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

const page = (
  overrides: Partial<GoogleEventListPage>,
): GoogleEventListPage => ({
  items: [],
  nextPageToken: null,
  nextSyncToken: null,
  ...overrides,
});

function adapterWith(
  api: GoogleEventListApi,
  log: { warn: (message: string) => void } = { warn: () => {} },
) {
  const tokensSeen: string[] = [];
  const adapter = new GoogleEventReaderAdapter((accessToken) => {
    tokensSeen.push(accessToken);
    return api;
  }, log);
  return { adapter, tokensSeen };
}

describe("GoogleEventReaderAdapter", () => {
  it("normalizes a page's events and returns its page/sync tokens", async () => {
    const api = new FakeEventListApi([
      page({
        items: [
          gEvent({ id: "a", summary: "A" }),
          gEvent({ id: "b", summary: "B" }),
        ],
        nextSyncToken: "sync-1",
      }),
    ]);
    const { adapter, tokensSeen } = adapterWith(api);

    const result = await adapter.listEventPage({
      accessToken: "tok",
      calendarId: "primary@google.com",
    });

    expect(tokensSeen).toEqual(["tok"]);
    expect(result.events.map((e) => e.providerEventId)).toEqual(["a", "b"]);
    expect(result.skipped).toBe(0);
    expect(result.nextPageToken).toBeNull();
    expect(result.nextSyncToken).toBe("sync-1");
  });

  it("passes the working window through and forwards no cursor", async () => {
    const api = new FakeEventListApi([page({ nextSyncToken: null })]);
    const { adapter } = adapterWith(api);

    await adapter.listEventPage({
      accessToken: "tok",
      calendarId: "primary@google.com",
      window: {
        timeMin: "2026-06-01T00:00:00Z",
        timeMax: "2026-09-01T00:00:00Z",
      },
    });

    expect(api.calls[0].window).toEqual({
      timeMin: "2026-06-01T00:00:00Z",
      timeMax: "2026-09-01T00:00:00Z",
    });
    expect(api.calls[0].syncToken).toBeUndefined();
  });

  it("forwards the stored cursor and page token for a resumed full pass", async () => {
    const api = new FakeEventListApi([page({})]);
    const { adapter } = adapterWith(api);

    await adapter.listEventPage({
      accessToken: "tok",
      calendarId: "primary@google.com",
      cursor: "sync-token-0",
      pageToken: "page-2",
    });

    expect(api.calls[0].syncToken).toBe("sync-token-0");
    expect(api.calls[0].pageToken).toBe("page-2");
  });

  it("keeps cancellations in the page (an incremental deletion)", async () => {
    const api = new FakeEventListApi([
      page({
        items: [
          gEvent({ id: "live", summary: "Live" }),
          gEvent({ id: "gone", status: "cancelled" }),
        ],
      }),
    ]);
    const { adapter } = adapterWith(api);

    const result = await adapter.listEventPage({
      accessToken: "tok",
      calendarId: "primary@google.com",
    });

    expect(result.events.map((e) => e.kind)).toEqual(["event", "cancellation"]);
  });

  it("keeps a cancelled instance that has no etag", async () => {
    const api = new FakeEventListApi([
      page({
        items: [
          gEvent({
            id: "series-1_20260808",
            status: "cancelled",
            etag: undefined,
          }),
        ],
      }),
    ]);
    const { adapter } = adapterWith(api);

    const result = await adapter.listEventPage({
      accessToken: "tok",
      calendarId: "primary@google.com",
    });

    expect(result.skipped).toBe(0);
    expect(result.events).toEqual([
      {
        kind: "cancellation",
        providerEventId: "series-1_20260808",
        providerVersion: "",
        series: {
          seriesProviderId: "series-1",
          recurrenceId: "2026-08-08T00:00:00.000Z",
        },
      },
    ]);
  });

  it("drops and counts a structurally unusable event without failing the page", async () => {
    const api = new FakeEventListApi([
      page({
        items: [
          gEvent({ id: "ok", summary: "OK" }),
          // No etag: the normalizer rejects it as missingIdentity.
          gEvent({ id: "no-etag", etag: undefined }),
        ],
      }),
    ]);
    const { adapter } = adapterWith(api);

    const result = await adapter.listEventPage({
      accessToken: "tok",
      calendarId: "primary@google.com",
    });

    expect(result.events.map((e) => e.providerEventId)).toEqual(["ok"]);
    expect(result.skipped).toBe(1);
  });

  it("logs the skip reason and provider event id, never the title", async () => {
    const warnings: string[] = [];
    const api = new FakeEventListApi([
      page({
        items: [
          gEvent({
            id: "no-etag",
            etag: undefined,
            summary: "Secret title must not be logged",
          }),
        ],
      }),
    ]);
    const { adapter } = adapterWith(api, {
      warn: (message) => warnings.push(message),
    });

    await adapter.listEventPage({
      accessToken: "tok",
      calendarId: "primary@google.com",
    });

    expect(warnings).toEqual([
      "Skipped unusable Google event no-etag (missingIdentity)",
    ]);
  });

  it("skips a content-oversized event instead of failing the whole page", async () => {
    const api = new FakeEventListApi([
      page({
        items: [
          gEvent({ id: "ok", summary: "OK" }),
          // Google does not cap attendee names; the neutral contract does. This
          // event must be skipped, not throw out of the page.
          gEvent({
            id: "poison",
            attendees: [
              { email: "guest@example.com", displayName: "x".repeat(300) },
            ],
          }),
          gEvent({ id: "ok2", summary: "OK2" }),
        ],
      }),
    ]);
    const { adapter } = adapterWith(api);

    const result = await adapter.listEventPage({
      accessToken: "tok",
      calendarId: "primary@google.com",
    });

    expect(result.events.map((e) => e.providerEventId)).toEqual(["ok", "ok2"]);
    expect(result.skipped).toBe(1);
  });

  it("threads colorLabels through to resolve an event's eventLabelId", async () => {
    const api = new FakeEventListApi([
      page({ items: [gEvent({ id: "labeled", eventLabelId: "label-1" })] }),
    ]);
    const { adapter } = adapterWith(api);

    const result = await adapter.listEventPage({
      accessToken: "tok",
      calendarId: "primary@google.com",
      colorLabels: new Map([["label-1", "#009688"]]),
    });

    expect(result.events[0]).toMatchObject({
      content: { colorHex: "#009688" },
    });
  });

  it("maps an expired sync token (410) to cursorExpired", async () => {
    const api = new FakeEventListApi([], { response: { status: 410 } });
    const { adapter } = adapterWith(api);

    await expect(
      adapter.listEventPage({
        accessToken: "tok",
        calendarId: "primary@google.com",
        cursor: "stale",
      }),
    ).rejects.toMatchObject({ reason: "cursorExpired" });
  });

  it("maps a rate limit and a server error to transient", async () => {
    for (const status of [429, 503]) {
      const api = new FakeEventListApi([], { response: { status } });
      const { adapter } = adapterWith(api);
      await expect(
        adapter.listEventPage({
          accessToken: "tok",
          calendarId: "primary@google.com",
        }),
      ).rejects.toMatchObject({ reason: "transient" });
    }
  });

  it("maps a 401 to authExpired (the caller must invalidate the cached token before retrying)", async () => {
    const api = new FakeEventListApi([], { response: { status: 401 } });
    const { adapter } = adapterWith(api);

    await expect(
      adapter.listEventPage({
        accessToken: "tok",
        calendarId: "primary@google.com",
      }),
    ).rejects.toMatchObject({ reason: "authExpired" });
  });

  it("maps a quota-shaped 403 to transient, like discovery/watch/write already do", async () => {
    for (const reason of [
      "rateLimitExceeded",
      "userRateLimitExceeded",
      "quotaExceeded",
      "dailyLimitExceeded",
    ]) {
      const api = new FakeEventListApi([], {
        response: {
          status: 403,
          data: { error: { errors: [{ reason }] } },
        },
      });
      const { adapter } = adapterWith(api);
      await expect(
        adapter.listEventPage({
          accessToken: "tok",
          calendarId: "primary@google.com",
        }),
      ).rejects.toMatchObject({ reason: "transient" });
    }
  });

  it("maps a permission-refusal 403 (no quota reason) to readFailed", async () => {
    const api = new FakeEventListApi([], {
      response: {
        status: 403,
        data: { error: { errors: [{ reason: "forbidden" }] } },
      },
    });
    const { adapter } = adapterWith(api);

    await expect(
      adapter.listEventPage({
        accessToken: "tok",
        calendarId: "primary@google.com",
      }),
    ).rejects.toMatchObject({ reason: "readFailed" });
  });

  it("maps a networkless failure to transient", async () => {
    const api = new FakeEventListApi([], new Error("socket hang up"));
    const { adapter } = adapterWith(api);

    await expect(
      adapter.listEventPage({
        accessToken: "tok",
        calendarId: "primary@google.com",
      }),
    ).rejects.toMatchObject({ reason: "transient" });
  });

  it("maps an unrecoverable 4xx to readFailed", async () => {
    const api = new FakeEventListApi([], { response: { status: 404 } });
    const { adapter } = adapterWith(api);

    await expect(
      adapter.listEventPage({
        accessToken: "tok",
        calendarId: "primary@google.com",
      }),
    ).rejects.toMatchObject({ reason: "readFailed" });
  });

  it("keeps the HTTP status and Google's reason on the cause for triage", async () => {
    const rejected = Object.assign(new Error("Not Found"), {
      response: {
        status: 404,
        data: { error: { errors: [{ reason: "notFound" }] } },
      },
    });
    const api = new FakeEventListApi([], rejected);
    const { adapter } = adapterWith(api);

    const error = await expectListPageError(adapter, {
      accessToken: "tok",
      calendarId: "primary@google.com",
    });

    // Without these, a durable readFailed row is guesswork to diagnose: the
    // message alone does not say which rejection Google gave.
    expect((error.cause as Error)?.message).toContain("HTTP 404");
    expect((error.cause as Error)?.message).toContain("notFound");
  });

  it("still reports the status when the error carries no Google reason", async () => {
    const api = new FakeEventListApi([], { response: { status: 403 } });
    const { adapter } = adapterWith(api);

    const error = await expectListPageError(adapter, {
      accessToken: "tok",
      calendarId: "primary@google.com",
    });

    expect((error.cause as Error)?.message).toContain("HTTP 403");
  });

  it("never leaks the access token onto a thrown error's cause", async () => {
    const leaky = new Error("boom") as Error & { config?: unknown };
    leaky.config = { headers: { Authorization: "Bearer super-secret-token" } };
    const api = new FakeEventListApi([], leaky);
    const { adapter } = adapterWith(api);

    const error = await expectListPageError(adapter, {
      accessToken: "tok",
      calendarId: "primary@google.com",
    });

    expect(error).toBeInstanceOf(ProviderEventReadError);
    expect(JSON.stringify(error.cause ?? {})).not.toContain(
      "super-secret-token",
    );
    expect((error.cause as Error)?.message).toBe("boom");
  });
});
