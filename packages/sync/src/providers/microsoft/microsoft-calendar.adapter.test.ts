import {
  MicrosoftCalendarAdapter,
  type MicrosoftCalendarListApi,
  type MicrosoftCalendarListPage,
  type MicrosoftGraphCalendar,
} from "@sync/providers/microsoft/microsoft-calendar.adapter";
import { MICROSOFT_CALENDAR_COLOR_HEX } from "@sync/providers/microsoft/microsoft-calendar-colors";
import { type ProviderCalendarError } from "@sync/providers/provider-calendar.port";

class FakeCalendarListApi implements MicrosoftCalendarListApi {
  calls: Array<{ nextLink?: string }> = [];
  #pages: MicrosoftCalendarListPage[];
  #error?: unknown;

  constructor(pages: MicrosoftCalendarListPage[], error?: unknown) {
    this.#pages = pages;
    this.#error = error;
  }

  async listPage(params: {
    nextLink?: string;
  }): Promise<MicrosoftCalendarListPage> {
    this.calls.push(params);
    if (this.#error) throw this.#error;
    const page = this.#pages.shift();
    if (!page) throw new Error("FakeCalendarListApi: no page scripted");
    return page;
  }
}

const calendar = (
  overrides: Partial<MicrosoftGraphCalendar>,
): MicrosoftGraphCalendar => ({
  id: "cal-id",
  name: "Calendar",
  color: "lightBlue",
  hexColor: "#0078D4",
  canEdit: true,
  isDefaultCalendar: false,
  ...overrides,
});

const page = (
  overrides: Partial<MicrosoftCalendarListPage>,
): MicrosoftCalendarListPage => ({
  items: [],
  nextLink: null,
  ...overrides,
});

function adapterWith(api: MicrosoftCalendarListApi) {
  const tokensSeen: string[] = [];
  const adapter = new MicrosoftCalendarAdapter((accessToken) => {
    tokensSeen.push(accessToken);
    return api;
  });
  return { adapter, tokensSeen };
}

describe("MicrosoftCalendarAdapter", () => {
  it("maps a single page and returns a null cursor", async () => {
    const api = new FakeCalendarListApi([
      page({
        items: [
          calendar({
            id: "default-cal",
            name: "Calendar",
            isDefaultCalendar: true,
            hexColor: "#112233",
          }),
        ],
      }),
    ]);
    const { adapter, tokensSeen } = adapterWith(api);

    const result = await adapter.discoverCalendars({ accessToken: "at-1" });

    expect(tokensSeen).toEqual(["at-1"]);
    expect(result.cursor).toBeNull();
    expect(result.calendars).toEqual([
      {
        providerCalendarId: "default-cal",
        displayName: "Calendar",
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
        createsGoogleMeet: false,
      },
    ]);
  });

  it("follows @odata.nextLink pagination and accumulates every page", async () => {
    const api = new FakeCalendarListApi([
      page({
        items: [calendar({ id: "a", name: "A" })],
        nextLink: "https://graph.microsoft.com/v1.0/me/calendars?$skiptoken=2",
      }),
      page({
        items: [calendar({ id: "b", name: "B" })],
      }),
    ]);
    const { adapter } = adapterWith(api);

    const result = await adapter.discoverCalendars({ accessToken: "at" });

    expect(result.calendars.map((entry) => entry.providerCalendarId)).toEqual([
      "a",
      "b",
    ]);
    expect(api.calls).toEqual([
      { nextLink: undefined },
      {
        nextLink: "https://graph.microsoft.com/v1.0/me/calendars?$skiptoken=2",
      },
    ]);
  });

  it("ignores an incremental cursor input and still returns null", async () => {
    const api = new FakeCalendarListApi([
      page({ items: [calendar({ id: "a" })] }),
    ]);
    const { adapter } = adapterWith(api);

    const result = await adapter.discoverCalendars({
      accessToken: "at",
      cursor: "stale-sync-token",
    });

    expect(result.cursor).toBeNull();
    expect(api.calls).toEqual([{ nextLink: undefined }]);
  });

  it("prefers hexColor and falls back to the named color enum table", async () => {
    const api = new FakeCalendarListApi([
      page({
        items: [
          calendar({ id: "hex", hexColor: "#AABBCC", color: "lightGreen" }),
          calendar({
            id: "enum",
            hexColor: "",
            color: "lightGreen",
          }),
          calendar({ id: "auto", hexColor: "", color: "auto" }),
        ],
      }),
    ]);
    const { adapter } = adapterWith(api);

    const { calendars } = await adapter.discoverCalendars({
      accessToken: "at",
    });
    const byId = Object.fromEntries(
      calendars.map((entry) => [entry.providerCalendarId, entry.color]),
    );

    expect(byId).toEqual({
      hex: "#AABBCC",
      enum: MICROSOFT_CALENDAR_COLOR_HEX["lightGreen"]!,
      auto: null,
    });
  });

  it.each([
    ["owner", { isDefaultCalendar: true, canEdit: false }],
    ["editor", { isDefaultCalendar: false, canEdit: true }],
    ["viewer", { isDefaultCalendar: false, canEdit: false }],
  ] as const)("maps access role %s from default-calendar and canEdit flags", async (accessRole, flags) => {
    const api = new FakeCalendarListApi([
      page({
        items: [calendar({ id: accessRole, ...flags })],
      }),
    ]);
    const { adapter } = adapterWith(api);

    const { calendars } = await adapter.discoverCalendars({
      accessToken: "at",
    });

    expect(calendars[0]?.accessRole).toBe(accessRole);
  });

  it("derives write and invite capabilities from canEdit", async () => {
    const api = new FakeCalendarListApi([
      page({
        items: [
          calendar({ id: "writable", canEdit: true }),
          calendar({ id: "readonly", canEdit: false }),
        ],
      }),
    ]);
    const { adapter } = adapterWith(api);

    const { calendars } = await adapter.discoverCalendars({
      accessToken: "at",
    });
    const byId = Object.fromEntries(
      calendars.map((entry) => [entry.providerCalendarId, entry.capabilities]),
    );

    expect(byId["writable"]).toEqual({
      canReadEvents: true,
      canWriteEvents: true,
      canReadBusy: true,
      canInviteAttendees: true,
    });
    expect(byId["readonly"]).toEqual({
      canReadEvents: true,
      canWriteEvents: false,
      canReadBusy: true,
      canInviteAttendees: false,
    });
  });

  it("drops entries without an id and falls back displayName to the id", async () => {
    const api = new FakeCalendarListApi([
      page({
        items: [
          calendar({ id: undefined, name: "no id" }),
          calendar({ id: "bare-id", name: "   " }),
        ],
      }),
    ]);
    const { adapter } = adapterWith(api);

    const { calendars } = await adapter.discoverCalendars({
      accessToken: "at",
    });

    expect(calendars).toHaveLength(1);
    expect(calendars[0]?.displayName).toBe("bare-id");
    expect(calendars[0]?.eventLabels).toEqual([]);
    expect(calendars[0]?.createsGoogleMeet).toBe(false);
  });

  it("maps a 401 to authExpired", async () => {
    const api = new FakeCalendarListApi([], { response: { status: 401 } });
    const { adapter } = adapterWith(api);

    const error = (await adapter
      .discoverCalendars({ accessToken: "stale" })
      .catch((caught) => caught)) as ProviderCalendarError;

    expect(error.reason).toBe("authExpired");
  });

  it("maps a 429 to transient", async () => {
    const api = new FakeCalendarListApi([], { response: { status: 429 } });
    const { adapter } = adapterWith(api);

    const error = (await adapter
      .discoverCalendars({ accessToken: "at" })
      .catch((caught) => caught)) as ProviderCalendarError;

    expect(error.reason).toBe("transient");
  });

  it("maps a 503 to transient", async () => {
    const api = new FakeCalendarListApi([], { response: { status: 503 } });
    const { adapter } = adapterWith(api);

    const error = (await adapter
      .discoverCalendars({ accessToken: "at" })
      .catch((caught) => caught)) as ProviderCalendarError;

    expect(error.reason).toBe("transient");
  });

  it("maps other 4xx responses to discoveryFailed with triage facts", async () => {
    const leaky = Object.assign(new Error("Access denied"), {
      config: {
        headers: { Authorization: "Bearer super-secret-access-token" },
      },
      response: { status: 403, data: { error: { code: "ErrorAccessDenied" } } },
    });
    const api = new FakeCalendarListApi([], leaky);
    const { adapter } = adapterWith(api);

    const error = (await adapter
      .discoverCalendars({ accessToken: "at" })
      .catch((caught) => caught)) as ProviderCalendarError;

    expect(error.reason).toBe("discoveryFailed");
    expect(error.cause).toBeInstanceOf(Error);
    expect((error.cause as Error).message).toContain("HTTP 403");
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
      .catch((caught) => caught)) as ProviderCalendarError;

    expect(error.reason).toBe("transient");
  });
});
