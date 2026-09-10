import { type gSchema$CalendarListEntry } from "@core/types/gcal";
import {
  GoogleCalendarAdapter,
  type GoogleCalendarListApi,
  type GoogleCalendarListPage,
  type GoogleEventLabel,
} from "@sync/providers/google/google-calendar.adapter";
import { ProviderCalendarError } from "@sync/providers/provider-calendar.port";

// A fake calendar-list API that returns scripted pages in order, recording the
// params it was called with so tests can assert pagination and cursor handling.
// Event labels default to empty per calendar unless scripted via `labelsById`.
class FakeCalendarListApi implements GoogleCalendarListApi {
  calls: Array<{ pageToken?: string; syncToken?: string }> = [];
  labelCalls: string[] = [];
  #pages: GoogleCalendarListPage[];
  #error?: unknown;
  #labelsById: Record<string, readonly GoogleEventLabel[]>;

  constructor(
    pages: GoogleCalendarListPage[],
    error?: unknown,
    labelsById: Record<string, readonly GoogleEventLabel[]> = {},
  ) {
    this.#pages = pages;
    this.#error = error;
    this.#labelsById = labelsById;
  }

  async listPage(params: {
    pageToken?: string;
    syncToken?: string;
  }): Promise<GoogleCalendarListPage> {
    this.calls.push(params);
    if (this.#error) throw this.#error;
    const page = this.#pages.shift();
    if (!page) throw new Error("FakeCalendarListApi: no page scripted");
    return page;
  }

  async getEventLabels(
    calendarId: string,
  ): Promise<readonly GoogleEventLabel[]> {
    this.labelCalls.push(calendarId);
    return this.#labelsById[calendarId] ?? [];
  }
}

const entry = (
  overrides: Partial<gSchema$CalendarListEntry>,
): gSchema$CalendarListEntry => ({
  kind: "calendar#calendarListEntry",
  id: "cal@group.calendar.google.com",
  summary: "A Calendar",
  accessRole: "owner",
  ...overrides,
});

const page = (
  overrides: Partial<GoogleCalendarListPage>,
): GoogleCalendarListPage => ({
  items: [],
  nextPageToken: null,
  nextSyncToken: null,
  ...overrides,
});

// A page factory that returns the given API for any access token, and remembers
// which token it was built with.
function adapterWith(api: GoogleCalendarListApi) {
  const tokensSeen: string[] = [];
  const adapter = new GoogleCalendarAdapter((accessToken) => {
    tokensSeen.push(accessToken);
    return api;
  });
  return { adapter, tokensSeen };
}

describe("GoogleCalendarAdapter", () => {
  it("maps a single page and returns its sync token as the cursor", async () => {
    const api = new FakeCalendarListApi([
      page({
        items: [
          entry({
            id: "primary-cal",
            summary: "Primary",
            primary: true,
            backgroundColor: "#112233",
            accessRole: "owner",
          }),
        ],
        nextSyncToken: "sync-token-1",
      }),
    ]);
    const { adapter, tokensSeen } = adapterWith(api);

    const result = await adapter.discoverCalendars({ accessToken: "at-1" });

    expect(tokensSeen).toEqual(["at-1"]);
    expect(result.cursor).toBe("sync-token-1");
    expect(result.calendars).toEqual([
      {
        providerCalendarId: "primary-cal",
        displayName: "Primary",
        color: "#112233",
        eventLabels: [],
        primary: true,
        active: true,
        accessRole: "owner",
        capabilities: {
          canReadEvents: true,
          canWriteEvents: true,
          canReadBusy: true,
          canInviteAttendees: true,
        },
        createsGoogleMeet: true,
      },
    ]);
  });

  it("resolves each calendar's custom event-color labels via a per-calendar lookup", async () => {
    const api = new FakeCalendarListApi(
      [
        page({
          items: [entry({ id: "labeled" }), entry({ id: "unlabeled" })],
          nextSyncToken: "s",
        }),
      ],
      undefined,
      {
        labeled: [{ id: "label-1", hex: "#009688" }],
      },
    );
    const { adapter } = adapterWith(api);

    const { calendars } = await adapter.discoverCalendars({
      accessToken: "at",
    });
    const byId = Object.fromEntries(
      calendars.map((c) => [c.providerCalendarId, c]),
    );

    expect(byId["labeled"]!.eventLabels).toEqual([
      { id: "label-1", hex: "#009688" },
    ]);
    expect(byId["unlabeled"]!.eventLabels).toEqual([]);
    expect(api.labelCalls).toEqual(["labeled", "unlabeled"]);
  });

  it("follows pagination, accumulating items and taking the final sync token", async () => {
    const api = new FakeCalendarListApi([
      page({
        items: [entry({ id: "a", summary: "A" })],
        nextPageToken: "page-2",
      }),
      page({
        items: [entry({ id: "b", summary: "B" })],
        nextSyncToken: "final-sync",
      }),
    ]);
    const { adapter } = adapterWith(api);

    const result = await adapter.discoverCalendars({ accessToken: "at" });

    expect(result.calendars.map((c) => c.providerCalendarId)).toEqual([
      "a",
      "b",
    ]);
    expect(result.cursor).toBe("final-sync");
    // First request has no pageToken; the second carries the first page's token.
    expect(api.calls).toEqual([
      { pageToken: undefined, syncToken: undefined },
      { pageToken: "page-2", syncToken: undefined },
    ]);
  });

  it("passes an incremental cursor on the first request only", async () => {
    const api = new FakeCalendarListApi([
      page({ items: [entry({ id: "a" })], nextPageToken: "p2" }),
      page({ items: [entry({ id: "b" })], nextSyncToken: "s2" }),
    ]);
    const { adapter } = adapterWith(api);

    await adapter.discoverCalendars({ accessToken: "at", cursor: "prev-sync" });

    expect(api.calls[0]).toEqual({
      pageToken: undefined,
      syncToken: "prev-sync",
    });
    expect(api.calls[1]).toEqual({ pageToken: "p2", syncToken: undefined });
  });

  it("derives role and capabilities for each Google access role", async () => {
    const api = new FakeCalendarListApi([
      page({
        items: [
          entry({ id: "owner", accessRole: "owner" }),
          entry({ id: "writer", accessRole: "writer" }),
          entry({ id: "reader", accessRole: "reader" }),
          entry({ id: "fbr", accessRole: "freeBusyReader" }),
        ],
        nextSyncToken: "s",
      }),
    ]);
    const { adapter } = adapterWith(api);

    const { calendars } = await adapter.discoverCalendars({
      accessToken: "at",
    });
    const byId = Object.fromEntries(
      calendars.map((c) => [c.providerCalendarId, c]),
    );

    expect(byId["owner"]!.accessRole).toBe("owner");
    expect(byId["writer"]!.accessRole).toBe("editor");
    expect(byId["reader"]!.accessRole).toBe("viewer");
    expect(byId["fbr"]!.accessRole).toBe("busyOnly");

    expect(byId["writer"]!.capabilities).toEqual({
      canReadEvents: true,
      canWriteEvents: true,
      canReadBusy: true,
      canInviteAttendees: true,
    });
    expect(byId["reader"]!.capabilities).toEqual({
      canReadEvents: true,
      canWriteEvents: false,
      canReadBusy: true,
      canInviteAttendees: false,
    });
    expect(byId["fbr"]!.capabilities).toEqual({
      canReadEvents: false,
      canWriteEvents: false,
      canReadBusy: true,
      canInviteAttendees: false,
    });
  });

  it("falls back to busyOnly for an unknown or missing access role", async () => {
    const api = new FakeCalendarListApi([
      page({
        items: [
          entry({ id: "weird", accessRole: "somethingNew" }),
          entry({ id: "none", accessRole: undefined }),
        ],
        nextSyncToken: "s",
      }),
    ]);
    const { adapter } = adapterWith(api);

    const { calendars } = await adapter.discoverCalendars({
      accessToken: "at",
    });

    expect(calendars.every((c) => c.accessRole === "busyOnly")).toBe(true);
  });

  it("marks deleted and hidden calendars inactive but still reports them", async () => {
    const api = new FakeCalendarListApi([
      page({
        items: [
          entry({ id: "live" }),
          entry({ id: "gone", deleted: true }),
          entry({ id: "hidden", hidden: true }),
        ],
        nextSyncToken: "s",
      }),
    ]);
    const { adapter } = adapterWith(api);

    const { calendars } = await adapter.discoverCalendars({
      accessToken: "at",
    });
    const active = Object.fromEntries(
      calendars.map((c) => [c.providerCalendarId, c.active]),
    );

    expect(active).toEqual({ live: true, gone: false, hidden: false });
  });

  it("marks a hidden calendar inactive even when selected is still true", async () => {
    // Hiding a calendar in Google leaves the API's `selected` flag frozen at
    // its pre-hide value, so hidden+selected must not resurrect the calendar.
    const api = new FakeCalendarListApi([
      page({
        items: [
          entry({ id: "hidden-but-selected", hidden: true, selected: true }),
          entry({ id: "unselected-hidden", hidden: true, selected: false }),
          entry({ id: "hidden-omitted-selected", hidden: true }),
          entry({
            id: "deleted-but-selected",
            deleted: true,
            selected: true,
          }),
        ],
        nextSyncToken: "s",
      }),
    ]);
    const { adapter } = adapterWith(api);

    const { calendars } = await adapter.discoverCalendars({
      accessToken: "at",
    });
    const active = Object.fromEntries(
      calendars.map((c) => [c.providerCalendarId, c.active]),
    );

    expect(active).toEqual({
      "hidden-but-selected": false,
      "unselected-hidden": false,
      "hidden-omitted-selected": false,
      "deleted-but-selected": false,
    });
  });

  it("falls back through summaryOverride, summary, then id for the display name", async () => {
    const api = new FakeCalendarListApi([
      page({
        items: [
          entry({
            id: "renamed",
            summary: "Original",
            summaryOverride: "Mine",
          }),
          entry({
            id: "shared",
            summary: "Shared",
            summaryOverride: undefined,
          }),
          entry({
            id: "bare-id",
            summary: undefined,
            summaryOverride: undefined,
          }),
        ],
        nextSyncToken: "s",
      }),
    ]);
    const { adapter } = adapterWith(api);

    const { calendars } = await adapter.discoverCalendars({
      accessToken: "at",
    });
    const names = Object.fromEntries(
      calendars.map((c) => [c.providerCalendarId, c.displayName]),
    );

    expect(names).toEqual({
      renamed: "Mine",
      shared: "Shared",
      "bare-id": "bare-id",
    });
  });

  it("drops entries without an id and nulls a missing color", async () => {
    const api = new FakeCalendarListApi([
      page({
        items: [
          entry({ id: undefined, summary: "no id" }),
          entry({ id: "no-color", backgroundColor: undefined }),
        ],
        nextSyncToken: "s",
      }),
    ]);
    const { adapter } = adapterWith(api);

    const { calendars } = await adapter.discoverCalendars({
      accessToken: "at",
    });

    expect(calendars).toHaveLength(1);
    expect(calendars[0]!.providerCalendarId).toBe("no-color");
    expect(calendars[0]!.color).toBeNull();
  });

  it("treats missing conference types as Meet-capable", async () => {
    const api = new FakeCalendarListApi([
      page({ items: [entry({ id: "primary" })], nextSyncToken: "s" }),
    ]);
    const { adapter } = adapterWith(api);

    const { calendars } = await adapter.discoverCalendars({
      accessToken: "at",
    });

    expect(calendars[0]!.createsGoogleMeet).toBe(true);
  });

  it("maps hangoutsMeet as Meet-capable", async () => {
    const api = new FakeCalendarListApi([
      page({
        items: [
          entry({
            id: "meet",
            conferenceProperties: {
              allowedConferenceSolutionTypes: ["hangoutsMeet"],
            },
          }),
        ],
        nextSyncToken: "s",
      }),
    ]);
    const { adapter } = adapterWith(api);

    const { calendars } = await adapter.discoverCalendars({
      accessToken: "at",
    });

    expect(calendars[0]!.createsGoogleMeet).toBe(true);
  });

  it("maps a calendar without hangoutsMeet as not Meet-capable", async () => {
    const api = new FakeCalendarListApi([
      page({
        items: [
          entry({
            id: "resource",
            conferenceProperties: {
              allowedConferenceSolutionTypes: ["eventHangout"],
            },
          }),
        ],
        nextSyncToken: "s",
      }),
    ]);
    const { adapter } = adapterWith(api);

    const { calendars } = await adapter.discoverCalendars({
      accessToken: "at",
    });

    expect(calendars[0]!.createsGoogleMeet).toBe(false);
  });

  it("returns a null cursor when the provider sends no sync token", async () => {
    const api = new FakeCalendarListApi([
      page({ items: [entry({ id: "a" })] }),
    ]);
    const { adapter } = adapterWith(api);

    const { cursor } = await adapter.discoverCalendars({ accessToken: "at" });

    expect(cursor).toBeNull();
  });

  it("keeps discovery independent per account (fresh api per access token)", async () => {
    const tokensSeen: string[] = [];
    const adapter = new GoogleCalendarAdapter((accessToken) => {
      tokensSeen.push(accessToken);
      return new FakeCalendarListApi([
        page({ items: [entry({ id: accessToken })], nextSyncToken: "s" }),
      ]);
    });

    const first = await adapter.discoverCalendars({ accessToken: "account-a" });
    const second = await adapter.discoverCalendars({
      accessToken: "account-b",
    });

    expect(tokensSeen).toEqual(["account-a", "account-b"]);
    expect(first.calendars[0]!.providerCalendarId).toBe("account-a");
    expect(second.calendars[0]!.providerCalendarId).toBe("account-b");
  });

  it("maps a 401 to authExpired so the caller can remint the access token", async () => {
    const api = new FakeCalendarListApi([], { response: { status: 401 } });
    const { adapter } = adapterWith(api);

    const error = (await adapter
      .discoverCalendars({ accessToken: "stale" })
      .catch((e) => e)) as ProviderCalendarError;

    expect(error.reason).toBe("authExpired");
  });

  it("classifies an expired cursor (410) distinctly from a generic failure", async () => {
    const expired = new FakeCalendarListApi([], {
      response: { status: 410 },
    });
    const { adapter } = adapterWith(expired);

    const error = (await adapter
      .discoverCalendars({ accessToken: "at", cursor: "old" })
      .catch((e) => e)) as ProviderCalendarError;

    expect(error).toBeInstanceOf(ProviderCalendarError);
    expect(error.reason).toBe("cursorExpired");
  });

  it("maps a durable 403 (notACalendarUser) to discoveryFailed with triage facts", async () => {
    // A gaxios-shaped error whose config carries the bearer token must never
    // survive onto the ProviderCalendarError cause chain; status/reason must.
    const leaky = Object.assign(
      new Error("The user must be signed up for Google Calendar."),
      {
        config: {
          headers: { Authorization: "Bearer super-secret-access-token" },
        },
        response: {
          status: 403,
          data: {
            error: { errors: [{ reason: "notACalendarUser" }] },
          },
        },
      },
    );
    const api = new FakeCalendarListApi([], leaky);
    const { adapter } = adapterWith(api);

    const error = (await adapter
      .discoverCalendars({ accessToken: "at" })
      .catch((e) => e)) as ProviderCalendarError;

    expect(error.reason).toBe("discoveryFailed");
    expect(error.cause).toBeInstanceOf(Error);
    expect((error.cause as Error).message).toContain("HTTP 403");
    expect((error.cause as Error).message).toContain("reason notACalendarUser");
    expect((error.cause as { config?: unknown }).config).toBeUndefined();
    expect(JSON.stringify(error.cause)).not.toContain(
      "super-secret-access-token",
    );
  });

  it("maps a network failure to transient", async () => {
    const api = new FakeCalendarListApi([], new Error("socket hang up"));
    const { adapter } = adapterWith(api);

    const error = (await adapter
      .discoverCalendars({ accessToken: "at" })
      .catch((e) => e)) as ProviderCalendarError;

    expect(error.reason).toBe("transient");
  });

  it("maps a 5xx provider error to transient", async () => {
    const api = new FakeCalendarListApi([], {
      response: { status: 503 },
    });
    const { adapter } = adapterWith(api);

    const error = (await adapter
      .discoverCalendars({ accessToken: "at" })
      .catch((e) => e)) as ProviderCalendarError;

    expect(error.reason).toBe("transient");
  });

  it.each([
    "rateLimitExceeded",
    "userRateLimitExceeded",
    "quotaExceeded",
    "dailyLimitExceeded",
  ])("maps a 403 %s to transient rather than discoveryFailed", async (reason) => {
    const quota = Object.assign(new Error("Request failed with status 403"), {
      response: {
        status: 403,
        data: {
          error: { errors: [{ reason }] },
        },
      },
    });
    const api = new FakeCalendarListApi([], quota);
    const { adapter } = adapterWith(api);

    const error = (await adapter
      .discoverCalendars({ accessToken: "at" })
      .catch((e) => e)) as ProviderCalendarError;

    expect(error.reason).toBe("transient");
  });
});
