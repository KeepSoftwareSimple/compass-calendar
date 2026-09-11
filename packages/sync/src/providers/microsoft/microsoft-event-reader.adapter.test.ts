import {
  type GraphEventDeltaItem,
  type MicrosoftEventListApi,
  type MicrosoftEventListPage,
  MicrosoftEventReaderAdapter,
} from "@sync/providers/microsoft/microsoft-event-reader.adapter";
import { ProviderEventReadError } from "@sync/providers/provider-event-reader.port";

const expectListPageError = async (
  adapter: MicrosoftEventReaderAdapter,
  input: Parameters<MicrosoftEventReaderAdapter["listEventPage"]>[0],
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

class FakeEventListApi implements MicrosoftEventListApi {
  calls: Array<Parameters<MicrosoftEventListApi["listPage"]>[0]> = [];
  #pages: MicrosoftEventListPage[];
  #error?: unknown;

  constructor(pages: MicrosoftEventListPage[], error?: unknown) {
    this.#pages = pages;
    this.#error = error;
  }

  async listPage(
    params: Parameters<MicrosoftEventListApi["listPage"]>[0],
  ): Promise<MicrosoftEventListPage> {
    this.calls.push(params);
    if (this.#error) throw this.#error;
    const page = this.#pages.shift();
    if (!page) throw new Error("FakeEventListApi: no page scripted");
    return page;
  }
}

const mEvent = (
  overrides: Partial<GraphEventDeltaItem> = {},
): GraphEventDeltaItem => ({
  id: "evt-id",
  "@odata.etag": 'W/"v1"',
  type: "singleInstance",
  subject: "Title",
  start: { dateTime: "2025-01-15T14:00:00.0000000", timeZone: "UTC" },
  end: { dateTime: "2025-01-15T15:00:00.0000000", timeZone: "UTC" },
  ...overrides,
});

const page = (
  overrides: Partial<MicrosoftEventListPage>,
): MicrosoftEventListPage => ({
  items: [],
  nextLink: null,
  deltaLink: null,
  ...overrides,
});

function adapterWith(
  api: MicrosoftEventListApi,
  log: { warn: (message: string) => void } = { warn: () => {} },
) {
  const tokensSeen: string[] = [];
  const adapter = new MicrosoftEventReaderAdapter((accessToken) => {
    tokensSeen.push(accessToken);
    return api;
  }, log);
  return { adapter, tokensSeen };
}

describe("MicrosoftEventReaderAdapter", () => {
  it("normalizes a page's events and returns its page and delta tokens", async () => {
    const api = new FakeEventListApi([
      page({
        items: [
          mEvent({ id: "a", subject: "A" }),
          mEvent({ id: "b", subject: "B" }),
        ],
        deltaLink: "https://graph.microsoft.com/delta?$deltatoken=sync-1",
      }),
    ]);
    const { adapter, tokensSeen } = adapterWith(api);

    const result = await adapter.listEventPage({
      accessToken: "tok",
      calendarId: "cal-1",
    });

    expect(tokensSeen).toEqual(["tok"]);
    expect(result.events.map((e) => e.providerEventId)).toEqual(["a", "b"]);
    expect(result.skipped).toBe(0);
    expect(result.nextPageToken).toBeNull();
    expect(result.nextSyncToken).toBe(
      "https://graph.microsoft.com/delta?$deltatoken=sync-1",
    );
  });

  it("uses calendarView delta when a bounded window is provided", async () => {
    const api = new FakeEventListApi([page({})]);
    const { adapter } = adapterWith(api);

    await adapter.listEventPage({
      accessToken: "tok",
      calendarId: "cal-1",
      window: {
        timeMin: "2026-06-01T00:00:00Z",
        timeMax: "2026-09-01T00:00:00Z",
      },
    });

    expect(api.calls[0]?.strategy).toBe("calendarView");
    expect(api.calls[0]?.window).toEqual({
      timeMin: "2026-06-01T00:00:00Z",
      timeMax: "2026-09-01T00:00:00Z",
    });
  });

  it("forwards the stored delta link and page link for a resumed pass", async () => {
    const api = new FakeEventListApi([page({})]);
    const { adapter } = adapterWith(api);
    const deltaLink = "https://graph.microsoft.com/delta?$deltatoken=stored";
    const pageLink = "https://graph.microsoft.com/delta?$skiptoken=page-2";

    await adapter.listEventPage({
      accessToken: "tok",
      calendarId: "cal-1",
      cursor: deltaLink,
      pageToken: pageLink,
    });

    expect(api.calls[0]?.deltaLink).toBe(deltaLink);
    expect(api.calls[0]?.pageLink).toBe(pageLink);
  });

  it("maps removed items to cancellations", async () => {
    const api = new FakeEventListApi([
      page({
        items: [
          mEvent({ id: "live", subject: "Live" }),
          { id: "gone", "@removed": { reason: "deleted" } },
        ],
      }),
    ]);
    const { adapter } = adapterWith(api);

    const result = await adapter.listEventPage({
      accessToken: "tok",
      calendarId: "cal-1",
    });

    expect(result.events.map((e) => e.kind)).toEqual(["event", "cancellation"]);
  });

  it("skips occurrence rows and counts them in skipped", async () => {
    const api = new FakeEventListApi([
      page({
        items: [
          mEvent({ id: "ok", subject: "OK" }),
          mEvent({
            id: "occ-1",
            type: "occurrence",
            seriesMasterId: "series-1",
          }),
        ],
      }),
    ]);
    const { adapter } = adapterWith(api);

    const result = await adapter.listEventPage({
      accessToken: "tok",
      calendarId: "cal-1",
    });

    expect(result.events.map((e) => e.providerEventId)).toEqual(["ok"]);
    expect(result.skipped).toBe(1);
  });

  it("drops and counts a structurally unusable event without failing the page", async () => {
    const api = new FakeEventListApi([
      page({
        items: [
          mEvent({ id: "ok", subject: "OK" }),
          mEvent({ id: "no-etag", "@odata.etag": undefined }),
        ],
      }),
    ]);
    const { adapter } = adapterWith(api);

    const result = await adapter.listEventPage({
      accessToken: "tok",
      calendarId: "cal-1",
    });

    expect(result.events.map((e) => e.providerEventId)).toEqual(["ok"]);
    expect(result.skipped).toBe(1);
  });

  it("threads colorLabels through as Outlook category colors", async () => {
    const api = new FakeEventListApi([
      page({
        items: [
          mEvent({
            id: "labeled",
            categories: ["Blue category"],
          }),
        ],
      }),
    ]);
    const { adapter } = adapterWith(api);

    const result = await adapter.listEventPage({
      accessToken: "tok",
      calendarId: "cal-1",
      colorLabels: new Map([["Blue category", "#0078D4"]]),
    });

    expect(result.events[0]).toMatchObject({
      content: { colorHex: "#0078D4" },
    });
  });

  it("maps an expired delta token (410) to cursorExpired", async () => {
    const api = new FakeEventListApi([], { response: { status: 410 } });
    const { adapter } = adapterWith(api);

    await expect(
      adapter.listEventPage({
        accessToken: "tok",
        calendarId: "cal-1",
        cursor: "https://graph.microsoft.com/delta?$deltatoken=stale",
      }),
    ).rejects.toMatchObject({ reason: "cursorExpired" });
  });

  it("maps syncStateNotFound to cursorExpired", async () => {
    const api = new FakeEventListApi([], {
      response: {
        status: 404,
        data: { error: { code: "syncStateNotFound" } },
      },
    });
    const { adapter } = adapterWith(api);

    await expect(
      adapter.listEventPage({
        accessToken: "tok",
        calendarId: "cal-1",
        cursor: "https://graph.microsoft.com/delta?$deltatoken=stale",
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
          calendarId: "cal-1",
        }),
      ).rejects.toMatchObject({ reason: "transient" });
    }
  });

  it("maps a 401 to authExpired", async () => {
    const api = new FakeEventListApi([], { response: { status: 401 } });
    const { adapter } = adapterWith(api);

    await expect(
      adapter.listEventPage({
        accessToken: "tok",
        calendarId: "cal-1",
      }),
    ).rejects.toMatchObject({ reason: "authExpired" });
  });

  it("maps an unrecoverable 4xx to readFailed", async () => {
    const api = new FakeEventListApi([], { response: { status: 404 } });
    const { adapter } = adapterWith(api);

    await expect(
      adapter.listEventPage({
        accessToken: "tok",
        calendarId: "cal-1",
      }),
    ).rejects.toMatchObject({ reason: "readFailed" });
  });

  it("keeps the HTTP status on the cause for triage", async () => {
    const rejected = Object.assign(new Error("Not Found"), {
      response: {
        status: 404,
        data: { error: { code: "ErrorItemNotFound" } },
      },
    });
    const api = new FakeEventListApi([], rejected);
    const { adapter } = adapterWith(api);

    const error = await expectListPageError(adapter, {
      accessToken: "tok",
      calendarId: "cal-1",
    });

    expect((error.cause as Error)?.message).toContain("HTTP 404");
    expect((error.cause as Error)?.message).toContain("ErrorItemNotFound");
  });

  it("never leaks the access token onto a thrown error's cause", async () => {
    const leaky = new Error("boom") as Error & { config?: unknown };
    leaky.config = { headers: { Authorization: "Bearer super-secret-token" } };
    const api = new FakeEventListApi([], leaky);
    const { adapter } = adapterWith(api);

    const error = await expectListPageError(adapter, {
      accessToken: "tok",
      calendarId: "cal-1",
    });

    expect(error).toBeInstanceOf(ProviderEventReadError);
    expect(JSON.stringify(error.cause ?? {})).not.toContain(
      "super-secret-token",
    );
  });
});
