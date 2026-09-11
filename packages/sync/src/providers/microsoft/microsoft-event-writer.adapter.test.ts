import { type EventSchedule } from "@core/types/event.contracts";
import { type SyncEventContent } from "@core/types/sync/event.contracts";
import { type GraphEvent } from "@sync/providers/microsoft/microsoft-event.normalizer";
import {
  type MicrosoftEventWriteApi,
  MicrosoftEventWriter,
} from "@sync/providers/microsoft/microsoft-event-writer.adapter";
import { clearMeetingSettingsCacheForTests } from "@sync/providers/microsoft/microsoft-meeting-providers";
import { type ProviderWriteError } from "@sync/providers/provider-event-writer.port";

const msError = (status: number, code?: string) =>
  Object.assign(new Error(`microsoft error ${status}`), {
    response: {
      status,
      data: code ? { error: { code, message: code } } : undefined,
    },
    config: { headers: { Authorization: "Bearer super-secret-token" } },
  });

const scriptedEvent = (id: string, etag = 'W/"graph-v1"'): GraphEvent => ({
  id,
  "@odata.etag": etag,
  type: "singleInstance",
  subject: "Title",
  start: { dateTime: "2025-01-15T14:00:00.0000000", timeZone: "UTC" },
  end: { dateTime: "2025-01-15T15:00:00.0000000", timeZone: "UTC" },
});

type Behavior = GraphEvent | Error | undefined;

class FakeWriteApi implements MicrosoftEventWriteApi {
  calls = {
    create: [] as Parameters<MicrosoftEventWriteApi["create"]>[0][],
    patch: [] as Parameters<MicrosoftEventWriteApi["patch"]>[0][],
    delete: [] as Parameters<MicrosoftEventWriteApi["delete"]>[0][],
    get: [] as Parameters<MicrosoftEventWriteApi["get"]>[0][],
    listInstances: [] as Parameters<
      MicrosoftEventWriteApi["listInstances"]
    >[0][],
    getCalendarMeetingSettings: [] as unknown[],
  };

  #meetingSettings = {
    defaultOnlineMeetingProvider: "teamsForBusiness",
    allowedOnlineMeetingProviders: ["teamsForBusiness"],
  };
  #instances: readonly GraphEvent[] = [];

  #etag: string;
  #deleted = new Set<string>();
  #transactionEvents = new Map<string, GraphEvent>();

  constructor(
    private readonly behavior: {
      create?: Behavior;
      patch?: Behavior;
      delete?: Behavior;
      get?: Behavior;
      listInstances?: Behavior | readonly GraphEvent[];
      meetingSettings?: {
        defaultOnlineMeetingProvider?: string;
        allowedOnlineMeetingProviders?: string[];
      };
    } = {},
    initialEtag = 'W/"graph-v1"',
  ) {
    this.#etag = initialEtag;
    if (behavior.meetingSettings) {
      this.#meetingSettings = {
        defaultOnlineMeetingProvider:
          behavior.meetingSettings.defaultOnlineMeetingProvider ??
          this.#meetingSettings.defaultOnlineMeetingProvider,
        allowedOnlineMeetingProviders:
          behavior.meetingSettings.allowedOnlineMeetingProviders ??
          this.#meetingSettings.allowedOnlineMeetingProviders,
      };
    }
    if (Array.isArray(behavior.listInstances)) {
      this.#instances = behavior.listInstances;
    }
  }

  async create(
    params: Parameters<MicrosoftEventWriteApi["create"]>[0],
  ): Promise<GraphEvent> {
    this.calls.create.push(params);
    const transactionId = params.body.transactionId;
    if (transactionId && this.#transactionEvents.has(transactionId)) {
      return this.#transactionEvents.get(transactionId)!;
    }
    const result = this.#settle("create", () =>
      scriptedEvent(transactionId ?? "created-id"),
    );
    if (transactionId) this.#transactionEvents.set(transactionId, result);
    return result;
  }

  async patch(
    params: Parameters<MicrosoftEventWriteApi["patch"]>[0],
  ): Promise<GraphEvent> {
    this.calls.patch.push(params);
    if (params.ifMatch && params.ifMatch !== this.#etag) {
      throw msError(412);
    }
    this.#etag = 'W/"graph-v2"';
    return this.#settle("patch", () =>
      scriptedEvent(params.eventId, this.#etag),
    );
  }

  async delete(
    params: Parameters<MicrosoftEventWriteApi["delete"]>[0],
  ): Promise<void> {
    this.calls.delete.push(params);
    if (this.behavior.delete instanceof Error) throw this.behavior.delete;
    if (this.#deleted.has(params.eventId)) throw msError(404);
    this.#deleted.add(params.eventId);
  }

  async get(
    params: Parameters<MicrosoftEventWriteApi["get"]>[0],
  ): Promise<GraphEvent> {
    this.calls.get.push(params);
    return this.#settle("get", () =>
      scriptedEvent(params.eventId, 'W/"graph-get"'),
    );
  }

  async listInstances(
    params: Parameters<MicrosoftEventWriteApi["listInstances"]>[0],
  ): Promise<readonly GraphEvent[]> {
    this.calls.listInstances.push(params);
    const scripted = this.behavior.listInstances;
    if (scripted instanceof Error) throw scripted;
    if (Array.isArray(scripted)) return scripted;
    return this.#instances;
  }

  async getCalendarMeetingSettings(): Promise<{
    defaultOnlineMeetingProvider?: string;
    allowedOnlineMeetingProviders?: string[];
  }> {
    this.calls.getCalendarMeetingSettings.push({});
    return this.#meetingSettings;
  }

  #settle(method: "create" | "patch" | "get", fallback: () => GraphEvent) {
    const scripted = this.behavior[method];
    if (scripted instanceof Error) throw scripted;
    return scripted ?? fallback();
  }
}

const writerWith = (api: MicrosoftEventWriteApi) => {
  const tokens: string[] = [];
  const writer = new MicrosoftEventWriter((accessToken) => {
    tokens.push(accessToken);
    return api;
  });
  return { writer, tokens };
};

const content = (overrides: Partial<SyncEventContent> = {}): SyncEventContent =>
  ({
    title: "Title",
    description: "Desc",
    location: null,
    organizer: null,
    attendees: [],
    conference: null,
    ...overrides,
  }) as SyncEventContent;

const timedSchedule = {
  kind: "timed",
  start: "2025-01-15T09:00:00-05:00",
  end: "2025-01-15T10:00:00-05:00",
  timeZone: "America/New_York",
} as unknown as EventSchedule;

const allDaySchedule = {
  kind: "allDay",
  start: "2025-01-15",
  end: "2025-01-16",
} as unknown as EventSchedule;

const baseCreate = {
  accessToken: "at",
  calendarId: "AAMkADAwATM0MDAAMS0zMDAwLTAwMDAtMDAwMDAwMABGAAAAAAA",
  providerEventId: "abc12deadbeef00000000000",
  content: content(),
  schedule: timedSchedule,
  recurrence: { kind: "single" } as const,
  invitation: "none" as const,
};

const basePatch = {
  accessToken: "at",
  calendarId: "AAMkADAwATM0MDAAMS0zMDAwLTAwMDAtMDAwMDAwMABGAAAAAAA",
  providerEventId: "abc12deadbeef00000000000",
  expectedVersion: null,
  content: content(),
  schedule: timedSchedule,
  recurrence: { kind: "single" } as const,
  invitation: "none" as const,
};

describe("MicrosoftEventWriter", () => {
  afterEach(() => {
    clearMeetingSettingsCacheForTests();
  });

  it("creates with transactionId and returns provider identity", async () => {
    const api = new FakeWriteApi();
    const { writer, tokens } = writerWith(api);

    const result = await writer.createEvent(baseCreate);

    expect(tokens).toEqual(["at"]);
    expect(api.calls.create[0]?.body.transactionId).toBe(
      "abc12deadbeef00000000000",
    );
    expect(result).toEqual({
      providerEventId: "abc12deadbeef00000000000",
      providerVersion: 'W/"graph-v1"',
    });
  });

  it("writes timed schedule, text body, and showAs busy", async () => {
    const api = new FakeWriteApi();
    const { writer } = writerWith(api);

    await writer.createEvent(baseCreate);

    expect(api.calls.create[0]?.body).toMatchObject({
      subject: "Title",
      body: { contentType: "text", content: "Desc" },
      isAllDay: false,
      showAs: "busy",
      start: { timeZone: "UTC" },
      end: { timeZone: "UTC" },
    });
  });

  it("writes all-day bounds with isAllDay and UTC date-only datetimes", async () => {
    const api = new FakeWriteApi();
    const { writer } = writerWith(api);

    await writer.createEvent({ ...baseCreate, schedule: allDaySchedule });

    expect(api.calls.create[0]?.body).toMatchObject({
      isAllDay: true,
      start: { dateTime: "2025-01-15T00:00:00.000", timeZone: "UTC" },
      end: { dateTime: "2025-01-16T00:00:00.000", timeZone: "UTC" },
    });
  });

  it("writes recurrence for a series create", async () => {
    const api = new FakeWriteApi();
    const { writer } = writerWith(api);

    await writer.createEvent({
      ...baseCreate,
      recurrence: { kind: "series", rules: ["RRULE:FREQ=DAILY"] },
    });

    expect(api.calls.create[0]?.body.recurrence).toEqual({
      pattern: { type: "daily", interval: 1 },
      range: { type: "noEnd", startDate: "2025-01-15" },
    });
  });

  it("returns the same event when create is retried with the same transactionId", async () => {
    const api = new FakeWriteApi();
    const { writer } = writerWith(api);

    const first = await writer.createEvent(baseCreate);
    const second = await writer.createEvent(baseCreate);

    expect(api.calls.create).toHaveLength(2);
    expect(second).toEqual(first);
  });

  it("writes attendees with responseRequested when invitation is not none", async () => {
    const api = new FakeWriteApi();
    const { writer } = writerWith(api);

    await writer.createEvent({
      ...baseCreate,
      invitation: "all",
      attendees: [
        {
          email: "guest@example.com",
          displayName: "Guest",
          responseStatus: "needsAction",
        },
      ],
    });

    expect(api.calls.create[0]?.body).toMatchObject({
      responseRequested: true,
      attendees: [
        {
          type: "required",
          emailAddress: { address: "guest@example.com", name: "Guest" },
          status: { response: "notResponded" },
        },
      ],
    });
  });

  it("sets responseRequested false for invitation none with attendees", async () => {
    const api = new FakeWriteApi();
    const { writer } = writerWith(api);

    await writer.createEvent({
      ...baseCreate,
      invitation: "none",
      attendees: [
        {
          email: "guest@example.com",
          displayName: null,
          responseStatus: "accepted",
        },
      ],
    });

    expect(api.calls.create[0]?.body.responseRequested).toBe(false);
  });

  it("replaces the whole attendees array on patch when present", async () => {
    const api = new FakeWriteApi();
    const { writer } = writerWith(api);

    await writer.patchEvent({
      ...basePatch,
      attendees: [
        {
          email: "solo@example.com",
          displayName: null,
          responseStatus: "tentative",
        },
      ],
    });

    expect(api.calls.patch[0]?.body.attendees).toEqual([
      {
        type: "required",
        emailAddress: { address: "solo@example.com" },
        status: { response: "tentativelyAccepted" },
      },
    ]);
  });

  it("omits attendees when the write does not intend a guest edit", async () => {
    const api = new FakeWriteApi();
    const { writer } = writerWith(api);

    await writer.patchEvent(basePatch);

    expect(api.calls.patch[0]?.body).not.toHaveProperty("attendees");
  });

  it("clears recurrence with null on a single patch", async () => {
    const api = new FakeWriteApi();
    const { writer } = writerWith(api);

    await writer.patchEvent({ ...basePatch, recurrence: { kind: "single" } });

    expect(api.calls.patch[0]?.body.recurrence).toBeNull();
  });

  it("omits recurrence when patching a resolved instance", async () => {
    const api = new FakeWriteApi();
    const { writer } = writerWith(api);

    await writer.patchEvent({ ...basePatch, recurrence: { kind: "instance" } });

    expect(api.calls.patch[0]?.body).not.toHaveProperty("recurrence");
  });

  it("maps a stale etag to versionConflict", async () => {
    const api = new FakeWriteApi({ patch: msError(412) });
    const { writer } = writerWith(api);

    const error = (await writer
      .patchEvent({ ...basePatch, expectedVersion: 'W/"stale"' })
      .catch((e) => e)) as ProviderWriteError;

    expect(error.reason).toBe("versionConflict");
  });

  it("treats deleting an already-absent event as success", async () => {
    const api = new FakeWriteApi({ delete: msError(404) });
    const { writer } = writerWith(api);

    await writer.deleteEvent({
      accessToken: "at",
      calendarId: "cal",
      providerEventId: "gone-id",
      expectedVersion: null,
      invitation: "none",
    });
  });

  it("maps 401 to authorizationRevoked", async () => {
    const api = new FakeWriteApi({ patch: msError(401) });
    const error = (await writerWith(api)
      .writer.patchEvent(basePatch)
      .catch((e) => e)) as ProviderWriteError;
    expect(error.reason).toBe("authorizationRevoked");
  });

  it("maps 403 to readOnlyCalendar", async () => {
    const api = new FakeWriteApi({ patch: msError(403, "ErrorAccessDenied") });
    const error = (await writerWith(api)
      .writer.patchEvent(basePatch)
      .catch((e) => e)) as ProviderWriteError;
    expect(error.reason).toBe("readOnlyCalendar");
  });

  it("maps 429 and 5xx to transient", async () => {
    const throttled = new FakeWriteApi({ patch: msError(429) });
    const server = new FakeWriteApi({ patch: msError(503) });
    const network = new FakeWriteApi({ patch: new Error("ECONNRESET") });

    const a = (await writerWith(throttled)
      .writer.patchEvent(basePatch)
      .catch((e) => e)) as ProviderWriteError;
    const b = (await writerWith(server)
      .writer.patchEvent(basePatch)
      .catch((e) => e)) as ProviderWriteError;
    const c = (await writerWith(network)
      .writer.patchEvent(basePatch)
      .catch((e) => e)) as ProviderWriteError;

    expect(a.reason).toBe("transient");
    expect(b.reason).toBe("transient");
    expect(c.reason).toBe("transient");
  });

  it("maps unsupported recurrence to permanentProviderError", async () => {
    const api = new FakeWriteApi();
    const { writer } = writerWith(api);

    const error = (await writer
      .createEvent({
        ...baseCreate,
        recurrence: {
          kind: "series",
          rules: ["RRULE:FREQ=HOURLY"],
        },
      })
      .catch((e) => e)) as ProviderWriteError;

    expect(error.reason).toBe("permanentProviderError");
    expect(error.message).toContain("Hourly");
  });

  it("fetches an event back as a normalized read, or null when absent", async () => {
    const present = new FakeWriteApi({
      get: {
        ...scriptedEvent("abc12deadbeef00000000000"),
        subject: "Fetched",
        bodyPreview: "Fetched body",
      },
    });
    const absent = new FakeWriteApi({ get: msError(404) });

    const read = await writerWith(present).writer.fetchEvent({
      accessToken: "at",
      calendarId: "cal",
      providerEventId: "abc12deadbeef00000000000",
    });
    const missing = await writerWith(absent).writer.fetchEvent({
      accessToken: "at",
      calendarId: "cal",
      providerEventId: "missing",
    });

    expect(read?.kind).toBe("event");
    expect(read?.providerEventId).toBe("abc12deadbeef00000000000");
    expect(missing).toBeNull();
  });

  it("adds Teams online meeting fields when createConference and default Teams provider", async () => {
    const api = new FakeWriteApi({
      create: {
        ...scriptedEvent("abc12deadbeef00000000000"),
        onlineMeeting: {
          joinUrl: "https://teams.microsoft.com/l/meetup-join/abc",
        },
        onlineMeetingProvider: "teamsForBusiness",
      },
      meetingSettings: {
        defaultOnlineMeetingProvider: "teamsForBusiness",
        allowedOnlineMeetingProviders: ["teamsForBusiness"],
      },
    });
    const { writer } = writerWith(api);

    const result = await writer.createEvent({
      ...baseCreate,
      createConference: true,
    });

    expect(api.calls.getCalendarMeetingSettings).toHaveLength(1);
    expect(api.calls.create[0]?.body).toMatchObject({
      isOnlineMeeting: true,
      onlineMeetingProvider: "teamsForBusiness",
    });
    expect(result.conference).toEqual({
      url: "https://teams.microsoft.com/l/meetup-join/abc",
      label: "Microsoft Teams",
    });
  });

  it("uses the first allowed Teams provider when default is not Teams", async () => {
    const api = new FakeWriteApi({
      meetingSettings: {
        defaultOnlineMeetingProvider: "skypeForConsumer",
        allowedOnlineMeetingProviders: ["skypeForConsumer", "teamsForConsumer"],
      },
    });
    const { writer } = writerWith(api);

    await writer.createEvent({ ...baseCreate, createConference: true });

    expect(api.calls.create[0]?.body).toMatchObject({
      isOnlineMeeting: true,
      onlineMeetingProvider: "teamsForConsumer",
    });
  });

  it("creates without a conference when no Teams provider is allowed", async () => {
    const api = new FakeWriteApi({
      meetingSettings: {
        defaultOnlineMeetingProvider: "skypeForConsumer",
        allowedOnlineMeetingProviders: ["skypeForConsumer"],
      },
    });
    const { writer } = writerWith(api);

    const result = await writer.createEvent({
      ...baseCreate,
      createConference: true,
    });

    expect(api.calls.create[0]?.body).not.toHaveProperty("isOnlineMeeting");
    expect(result.conference).toBeUndefined();
  });

  it("caches calendar meeting settings for the same access token", async () => {
    const api = new FakeWriteApi();
    const { writer } = writerWith(api);

    await writer.createEvent({ ...baseCreate, createConference: true });
    await writer.createEvent({ ...baseCreate, createConference: true });

    expect(api.calls.getCalendarMeetingSettings).toHaveLength(1);
  });

  it("resolves one series instance by originalStart within a one-day window", async () => {
    const api = new FakeWriteApi({
      listInstances: [
        {
          ...scriptedEvent("instance-1"),
          type: "occurrence",
          seriesMasterId: "series-1",
          originalStart: "2025-01-15T14:00:00.0000000Z",
          subject: "Occurrence",
        },
      ],
    });
    const { writer } = writerWith(api);

    const read = await writer.fetchInstanceAt({
      accessToken: "at",
      calendarId: "cal",
      seriesProviderEventId: "series-1",
      originalStartAt: "2025-01-15T14:00:00.000Z",
      scheduleKind: "timed",
    });

    expect(api.calls.listInstances[0]).toMatchObject({
      seriesMasterId: "series-1",
      startDateTime: "2025-01-15T02:00:00.000",
      endDateTime: "2025-01-16T02:00:00.000",
    });
    expect(read?.kind).toBe("event");
    expect(read?.providerEventId).toBe("instance-1");
    if (read?.kind === "event") {
      expect(read.recurrence).toEqual({
        kind: "instance",
        seriesProviderId: "series-1",
        recurrenceId: "2025-01-15T14:00:00.000Z",
      });
    }
  });

  it("returns null when no instance matches the original start", async () => {
    const api = new FakeWriteApi({ listInstances: [] });
    const { writer } = writerWith(api);

    const read = await writer.fetchInstanceAt({
      accessToken: "at",
      calendarId: "cal",
      seriesProviderEventId: "series-1",
      originalStartAt: "2025-01-15T14:00:00.000Z",
      scheduleKind: "timed",
    });

    expect(read).toBeNull();
  });

  it("returns null when the series itself is gone", async () => {
    const api = new FakeWriteApi({ listInstances: msError(404) });
    const { writer } = writerWith(api);

    const read = await writer.fetchInstanceAt({
      accessToken: "at",
      calendarId: "cal",
      seriesProviderEventId: "gone",
      originalStartAt: "2025-01-15T14:00:00.000Z",
      scheduleKind: "timed",
    });

    expect(read).toBeNull();
  });

  it("never leaks the bearer token onto a thrown error cause", async () => {
    const api = new FakeWriteApi({ patch: msError(500) });
    const error = (await writerWith(api)
      .writer.patchEvent(basePatch)
      .catch((e) => e)) as ProviderWriteError;

    expect(JSON.stringify(error.cause ?? {})).not.toContain(
      "super-secret-token",
    );
  });

  it("rejects a create whose returned event lacks identity", async () => {
    const api = new FakeWriteApi({ create: { type: "singleInstance" } });
    const error = (await writerWith(api)
      .writer.createEvent(baseCreate)
      .catch((e) => e)) as ProviderWriteError;

    expect(error.reason).toBe("permanentProviderError");
  });
});
