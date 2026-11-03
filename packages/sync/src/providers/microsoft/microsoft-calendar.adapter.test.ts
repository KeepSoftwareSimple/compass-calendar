import {
  MicrosoftCalendarAdapter,
  type MicrosoftCalendarGroupListPage,
  type MicrosoftCalendarListApi,
  type MicrosoftCalendarListPage,
  type MicrosoftGraphCalendar,
  type MicrosoftGraphCalendarGroup,
} from "@sync/providers/microsoft/microsoft-calendar.adapter";
import { MICROSOFT_CALENDAR_COLOR_HEX } from "@sync/providers/microsoft/microsoft-calendar-colors";
import { type MicrosoftMasterCategoryApi } from "@sync/providers/microsoft/microsoft-master-categories";
import { type ProviderCalendarError } from "@sync/providers/provider-calendar.port";

class FakeCalendarListApi implements MicrosoftCalendarListApi {
  calls: Array<{ nextLink?: string }> = [];
  groupCalls: Array<{ nextLink?: string }> = [];
  groupCalendarCalls: Array<{ groupId: string; nextLink?: string }> = [];
  #pages: MicrosoftCalendarListPage[];
  #groupPages: MicrosoftCalendarGroupListPage[];
  #groupCalendars: Record<string, MicrosoftCalendarListPage[]>;
  #error?: unknown;

  constructor(
    pages: MicrosoftCalendarListPage[],
    options: {
      groupPages?: MicrosoftCalendarGroupListPage[];
      groupCalendars?: Record<string, MicrosoftCalendarListPage[]>;
      error?: unknown;
    } = {},
  ) {
    this.#pages = pages;
    this.#groupPages = options.groupPages ?? [{ items: [], nextLink: null }];
    this.#groupCalendars = options.groupCalendars ?? {};
    this.#error = options.error;
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

  async listCalendarGroupsPage(params: {
    nextLink?: string;
  }): Promise<MicrosoftCalendarGroupListPage> {
    this.groupCalls.push(params);
    if (this.#error) throw this.#error;
    const page = this.#groupPages.shift();
    if (!page) throw new Error("FakeCalendarListApi: no group page scripted");
    return page;
  }

  async listGroupCalendarsPage(
    groupId: string,
    params: { nextLink?: string },
  ): Promise<MicrosoftCalendarListPage> {
    this.groupCalendarCalls.push({ groupId, nextLink: params.nextLink });
    if (this.#error) throw this.#error;
    const pages = this.#groupCalendars[groupId];
    if (!pages?.length) {
      return { items: [], nextLink: null };
    }
    const page = pages.shift();
    if (!page) throw new Error("FakeCalendarListApi: no group calendar page");
    return page;
  }
}

const group = (
  overrides: Partial<MicrosoftGraphCalendarGroup>,
): MicrosoftGraphCalendarGroup => ({
  id: "group-my-calendars",
  name: "My Calendars",
  ...overrides,
});

const groupPage = (
  overrides: Partial<MicrosoftCalendarGroupListPage>,
): MicrosoftCalendarGroupListPage => ({
  items: [],
  nextLink: null,
  ...overrides,
});

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

class FakeMasterCategoryApi implements MicrosoftMasterCategoryApi {
  async list() {
    return [
      { displayName: "Blue category", color: "preset7" },
      { displayName: "None", color: "none" },
    ];
  }
}

function adapterWith(
  api: MicrosoftCalendarListApi,
  masterCategoryApi: MicrosoftMasterCategoryApi = new FakeMasterCategoryApi(),
) {
  const tokensSeen: string[] = [];
  const adapter = new MicrosoftCalendarAdapter(
    (accessToken) => {
      tokensSeen.push(accessToken);
      return api;
    },
    () => masterCategoryApi,
  );
  return { adapter, tokensSeen };
}

describe("MicrosoftCalendarAdapter", () => {
  it("maps a single page and returns a null cursor", async () => {
    const api = new FakeCalendarListApi([], {
      groupPages: [
        groupPage({
          items: [group()],
        }),
      ],
      groupCalendars: {
        "group-my-calendars": [
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
        ],
      },
    });
    const { adapter, tokensSeen } = adapterWith(api);

    const result = await adapter.discoverCalendars({ accessToken: "at-1" });

    expect(tokensSeen).toEqual(["at-1"]);
    expect(result.cursor).toBeNull();
    expect(result.calendars).toEqual([
      {
        providerCalendarId: "default-cal",
        displayName: "Calendar",
        color: "#112233",
        eventLabels: [{ id: "Blue category", hex: "#5CA9E5" }],
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
        defaultPopupReminderMinutes: [],
      },
    ]);
  });

  it("follows @odata.nextLink pagination and accumulates every page", async () => {
    const api = new FakeCalendarListApi([], {
      groupPages: [groupPage({ items: [group()] })],
      groupCalendars: {
        "group-my-calendars": [
          page({
            items: [calendar({ id: "a", name: "A" })],
            nextLink:
              "https://graph.microsoft.com/v1.0/me/calendarGroups/group-my-calendars/calendars?$skiptoken=2",
          }),
          page({
            items: [calendar({ id: "b", name: "B" })],
          }),
        ],
      },
    });
    const { adapter } = adapterWith(api);

    const result = await adapter.discoverCalendars({ accessToken: "at" });

    expect(result.calendars.map((entry) => entry.providerCalendarId)).toEqual([
      "a",
      "b",
    ]);
    expect(api.groupCalendarCalls).toEqual([
      { groupId: "group-my-calendars", nextLink: undefined },
      {
        groupId: "group-my-calendars",
        nextLink:
          "https://graph.microsoft.com/v1.0/me/calendarGroups/group-my-calendars/calendars?$skiptoken=2",
      },
    ]);
  });

  it("merges calendars from every group and picks up a folder added between syncs", async () => {
    const api = new FakeCalendarListApi([], {
      groupPages: [groupPage({ items: [group()] })],
      groupCalendars: {
        "group-my-calendars": [
          page({
            items: [
              calendar({
                id: "default-cal",
                name: "Calendar",
                isDefaultCalendar: true,
              }),
              calendar({ id: "diet-cal", name: "Diet" }),
            ],
          }),
        ],
      },
    });
    const { adapter } = adapterWith(api);

    const result = await adapter.discoverCalendars({ accessToken: "at" });

    expect(result.calendars.map((entry) => entry.displayName).sort()).toEqual([
      "Calendar",
      "Diet",
    ]);
  });

  it("falls back to /me/calendars when calendarGroups returns nothing", async () => {
    const api = new FakeCalendarListApi(
      [
        page({
          items: [calendar({ id: "fallback", name: "Fallback" })],
        }),
      ],
      { groupPages: [groupPage({ items: [] })] },
    );
    const { adapter } = adapterWith(api);

    const result = await adapter.discoverCalendars({ accessToken: "at" });

    expect(result.calendars.map((entry) => entry.providerCalendarId)).toEqual([
      "fallback",
    ]);
    expect(api.calls).toEqual([{ nextLink: undefined }]);
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
  ] as const)(
    "maps access role %s from default-calendar and canEdit flags",
    async (accessRole, flags) => {
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
    },
  );

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
    expect(calendars[0]?.eventLabels).toEqual([
      { id: "Blue category", hex: "#5CA9E5" },
    ]);
    expect(calendars[0]?.createsGoogleMeet).toBe(false);
  });

  it("maps a 401 to authExpired", async () => {
    const api = new FakeCalendarListApi([], {
      error: { response: { status: 401 } },
    });
    const { adapter } = adapterWith(api);

    const error = (await adapter
      .discoverCalendars({ accessToken: "stale" })
      .catch((caught) => caught)) as ProviderCalendarError;

    expect(error.reason).toBe("authExpired");
  });

  it("maps a 429 to transient", async () => {
    const api = new FakeCalendarListApi([], {
      error: { response: { status: 429 } },
    });
    const { adapter } = adapterWith(api);

    const error = (await adapter
      .discoverCalendars({ accessToken: "at" })
      .catch((caught) => caught)) as ProviderCalendarError;

    expect(error.reason).toBe("transient");
  });

  it("maps a 503 to transient", async () => {
    const api = new FakeCalendarListApi([], {
      error: { response: { status: 503 } },
    });
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
    const api = new FakeCalendarListApi([], { error: leaky });
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
    const api = new FakeCalendarListApi([], {
      error: new Error("socket hang up"),
    });
    const { adapter } = adapterWith(api);

    const error = (await adapter
      .discoverCalendars({ accessToken: "at" })
      .catch((caught) => caught)) as ProviderCalendarError;

    expect(error.reason).toBe("transient");
  });
});
