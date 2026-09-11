import { type calendar_v3 } from "@googleapis/calendar";
import {
  type GoogleChannelsApi,
  GoogleNotificationAdapter,
  parseGoogleNotification,
} from "@sync/providers/google/google-notifications.adapter";
import { ProviderNotificationError } from "@sync/providers/provider-notifications.port";

const gError = (status: number, reason?: string) =>
  Object.assign(new Error(`google error ${status}`), {
    response: {
      status,
      data: reason ? { error: { errors: [{ reason }] } } : undefined,
    },
    config: { headers: { Authorization: "Bearer super-secret-token" } },
  });

type Behavior = calendar_v3.Schema$Channel | Error | undefined;

class FakeChannelsApi implements GoogleChannelsApi {
  watchCalls: Parameters<GoogleChannelsApi["watchEvents"]>[0][] = [];
  calendarListWatchCalls: Parameters<
    GoogleChannelsApi["watchCalendarList"]
  >[0][] = [];
  stopCalls: Parameters<GoogleChannelsApi["stopChannel"]>[0][] = [];

  constructor(
    private readonly behavior: {
      watch?: Behavior;
      calendarListWatch?: Behavior;
      stop?: Error;
    } = {},
  ) {}

  async watchEvents(
    params: Parameters<GoogleChannelsApi["watchEvents"]>[0],
  ): Promise<calendar_v3.Schema$Channel> {
    this.watchCalls.push(params);
    if (this.behavior.watch instanceof Error) throw this.behavior.watch;
    return (
      this.behavior.watch ?? {
        resourceId: "res-1",
        expiration: "1767312000000",
      }
    );
  }

  async watchCalendarList(
    params: Parameters<GoogleChannelsApi["watchCalendarList"]>[0],
  ): Promise<calendar_v3.Schema$Channel> {
    this.calendarListWatchCalls.push(params);
    if (this.behavior.calendarListWatch instanceof Error) {
      throw this.behavior.calendarListWatch;
    }
    const channel = this.behavior.calendarListWatch ??
      this.behavior.watch ?? {
        resourceId: "res-list-1",
        expiration: "1767312000000",
      };
    if (channel instanceof Error) {
      throw channel;
    }
    return channel;
  }

  async stopChannel(
    params: Parameters<GoogleChannelsApi["stopChannel"]>[0],
  ): Promise<void> {
    this.stopCalls.push(params);
    if (this.behavior.stop) throw this.behavior.stop;
  }
}

const adapterWith = (
  api: GoogleChannelsApi,
  now = () => new Date("2026-01-01T00:00:00Z"),
) => {
  const tokens: string[] = [];
  const adapter = new GoogleNotificationAdapter((accessToken) => {
    tokens.push(accessToken);
    return api;
  }, now);
  return { adapter, tokens };
};

const watchInput = {
  accessToken: "at",
  calendarId: "cal@group.calendar.google.com",
  channelId: "chan-1",
  token: "chan-token",
  callbackUrl: "https://sync.example.com/callbacks/google",
};

describe("GoogleNotificationAdapter watch/stop", () => {
  it("opens a web_hook channel and returns the provider's expiry", async () => {
    // 1767312000000 = 2026-01-02T00:00:00Z
    const api = new FakeChannelsApi({
      watch: { resourceId: "res-1", expiration: "1767312000000" },
    });
    const { adapter, tokens } = adapterWith(api);

    const channel = await adapter.watch(watchInput);

    expect(tokens).toEqual(["at"]);
    expect(api.watchCalls[0]).toEqual({
      calendarId: "cal@group.calendar.google.com",
      requestBody: {
        id: "chan-1",
        type: "web_hook",
        address: "https://sync.example.com/callbacks/google",
        token: "chan-token",
        // 48h, not the week Google allows: a channel can stop delivering
        // without expiring, and the renewal sweep only selects on expiry, so
        // the short lifetime is what forces a daily re-watch and bounds that
        // blind window.
        expiration: String(new Date("2026-01-03T00:00:00Z").getTime()),
      },
    });
    expect(channel).toEqual({
      channelId: "chan-1",
      resourceId: "res-1",
      expiresAt: new Date("2026-01-02T00:00:00Z"),
    });
  });

  it("opens a calendar-list web_hook channel without a calendar id", async () => {
    const api = new FakeChannelsApi({
      calendarListWatch: {
        resourceId: "res-list-1",
        expiration: "1767312000000",
      },
    });
    const { adapter } = adapterWith(api);

    const channel = await adapter.watch({
      accessToken: "at",
      channelId: "chan-list",
      token: "chan-token",
      callbackUrl: "https://sync.example.com/callbacks/google",
    });

    expect(api.watchCalls).toHaveLength(0);
    expect(api.calendarListWatchCalls[0]?.requestBody).toEqual({
      id: "chan-list",
      type: "web_hook",
      address: "https://sync.example.com/callbacks/google",
      token: "chan-token",
      expiration: String(new Date("2026-01-03T00:00:00Z").getTime()),
    });
    expect(channel).toEqual({
      channelId: "chan-list",
      resourceId: "res-list-1",
      expiresAt: new Date("2026-01-02T00:00:00Z"),
    });
  });

  it("requests a caller-supplied ttl but lets the provider expiry win", async () => {
    const api = new FakeChannelsApi({
      watch: { resourceId: "res-1", expiration: "1767225600000" },
    });
    const { adapter } = adapterWith(api);

    const channel = await adapter.watch({
      ...watchInput,
      ttlMs: 3600_000,
    });

    // Requested one hour out...
    expect(api.watchCalls[0]!.requestBody.expiration).toBe(
      String(new Date("2026-01-01T01:00:00Z").getTime()),
    );
    // ...but the returned expiry (2026-01-01T00:00:00 + provider value) wins.
    expect(channel.expiresAt).toEqual(new Date("2026-01-01T00:00:00Z"));
  });

  it("falls back to the requested expiry when the provider omits one", async () => {
    const api = new FakeChannelsApi({ watch: { resourceId: "res-1" } });
    const { adapter } = adapterWith(api);

    const channel = await adapter.watch({
      ...watchInput,
      ttlMs: 3600_000,
    });

    expect(channel.expiresAt).toEqual(new Date("2026-01-01T01:00:00Z"));
  });

  it("fails when the provider returns no resource id", async () => {
    const api = new FakeChannelsApi({ watch: { expiration: "1767312000000" } });
    const { adapter } = adapterWith(api);

    const error = (await adapter
      .watch(watchInput)
      .catch((e) => e)) as ProviderNotificationError;

    expect(error.reason).toBe("watchFailed");
  });

  it("classifies an unwatchable resource distinctly so the caller can poll", async () => {
    const api = new FakeChannelsApi({
      watch: gError(400, "pushNotSupportedForRequestedResource"),
    });
    const { adapter } = adapterWith(api);

    const error = (await adapter
      .watch(watchInput)
      .catch((e) => e)) as ProviderNotificationError;

    expect(error.reason).toBe("watchUnsupported");
  });

  it("classifies a 403 pushNotSupportedForRequestedResource as unwatchable too", async () => {
    const api = new FakeChannelsApi({
      watch: gError(403, "pushNotSupportedForRequestedResource"),
    });
    const { adapter } = adapterWith(api);

    const error = (await adapter
      .watch(watchInput)
      .catch((e) => e)) as ProviderNotificationError;

    expect(error.reason).toBe("watchUnsupported");
  });

  it("classifies pushNotSupported when googleapis puts errors on the error object", async () => {
    // googleapis sometimes copies errors onto the Error itself rather than
    // only nesting them under response.data.error.errors.
    const api = new FakeChannelsApi({
      watch: Object.assign(new Error("push not supported"), {
        code: 400,
        errors: [{ reason: "pushNotSupportedForRequestedResource" }],
        config: { headers: { Authorization: "Bearer super-secret-token" } },
      }),
    });
    const { adapter } = adapterWith(api);

    const error = (await adapter
      .watch(watchInput)
      .catch((e) => e)) as ProviderNotificationError;

    expect(error.reason).toBe("watchUnsupported");
    expect(JSON.stringify(error.cause ?? {})).not.toContain(
      "super-secret-token",
    );
  });

  // Google returns rate-limit and quota rejections as 403, not 429, so these
  // must stay retryable even though every other 403 is now durable.
  it.each([
    "rateLimitExceeded",
    "userRateLimitExceeded",
    "quotaExceeded",
    "dailyLimitExceeded",
  ])("keeps a 403 %s transient, not durable", async (reason) => {
    const api = new FakeChannelsApi({ watch: gError(403, reason) });
    const { adapter } = adapterWith(api);

    const error = (await adapter
      .watch(watchInput)
      .catch((e) => e)) as ProviderNotificationError;

    expect(error.reason).toBe("transient");
  });

  it("classifies a durable 403 as watchFailed and keeps status/reason for triage", async () => {
    const api = new FakeChannelsApi({ watch: gError(403, "forbidden") });
    const { adapter } = adapterWith(api);

    const error = (await adapter
      .watch(watchInput)
      .catch((e) => e)) as ProviderNotificationError;

    expect(error.reason).toBe("watchFailed");
    expect(error.message).toContain("HTTP 403");
    expect(error.message).toContain("reason forbidden");
    expect((error.cause as Error)?.message).toContain("HTTP 403");
    expect(JSON.stringify(error.cause ?? {})).not.toContain(
      "super-secret-token",
    );
  });

  // A bare 403 carries no reason to prove it is temporary, so it settles to
  // polling rather than burning the retry ladder on a likely-permanent refusal.
  it("classifies a bare 403 (no reason) as a durable watchFailed", async () => {
    const api = new FakeChannelsApi({ watch: gError(403) });
    const { adapter } = adapterWith(api);

    const error = (await adapter
      .watch(watchInput)
      .catch((e) => e)) as ProviderNotificationError;

    expect(error.reason).toBe("watchFailed");
  });

  it("classifies 429 and 5xx as transient so the worker can retry", async () => {
    for (const status of [429, 500, 503]) {
      const api = new FakeChannelsApi({ watch: gError(status) });
      const { adapter } = adapterWith(api);

      const error = (await adapter
        .watch(watchInput)
        .catch((e) => e)) as ProviderNotificationError;

      expect(error.reason).toBe("transient");
      expect(error.message).toContain(`HTTP ${status}`);
    }
  });

  it("classifies a network failure with no HTTP status as transient", async () => {
    const api = new FakeChannelsApi({
      watch: Object.assign(new Error("socket hang up"), {
        config: { headers: { Authorization: "Bearer super-secret-token" } },
      }),
    });
    const { adapter } = adapterWith(api);

    const error = (await adapter
      .watch(watchInput)
      .catch((e) => e)) as ProviderNotificationError;

    expect(error.reason).toBe("transient");
    expect(JSON.stringify(error.cause ?? {})).not.toContain(
      "super-secret-token",
    );
  });

  it("classifies a revoked credential and never leaks the bearer token", async () => {
    const api = new FakeChannelsApi({ watch: gError(401) });
    const { adapter } = adapterWith(api);

    const error = (await adapter
      .watch(watchInput)
      .catch((e) => e)) as ProviderNotificationError;

    expect(error.reason).toBe("authorizationRevoked");
    expect(error.cause).toBeInstanceOf(Error);
    expect((error.cause as { config?: unknown }).config).toBeUndefined();
    expect(JSON.stringify(error.cause ?? {})).not.toContain(
      "super-secret-token",
    );
  });

  it("stops a channel by id and resource id", async () => {
    const api = new FakeChannelsApi();
    const { adapter } = adapterWith(api);

    await adapter.stopChannel({
      accessToken: "at",
      channelId: "chan-1",
      resourceId: "res-1",
    });

    expect(api.stopCalls[0]).toEqual({
      requestBody: { id: "chan-1", resourceId: "res-1" },
    });
  });

  it("treats stopping an already-gone channel as success", async () => {
    for (const status of [404, 401, 410]) {
      const api = new FakeChannelsApi({ stop: gError(status) });
      const { adapter } = adapterWith(api);

      await adapter.stopChannel({
        accessToken: "at",
        channelId: "chan-1",
        resourceId: "res-1",
      });
      expect(api.stopCalls).toHaveLength(1);
    }
  });

  it("surfaces an unexpected stop failure as transient", async () => {
    const api = new FakeChannelsApi({ stop: gError(500) });
    const { adapter } = adapterWith(api);

    const error = (await adapter
      .stopChannel({
        accessToken: "at",
        channelId: "chan-1",
        resourceId: "res-1",
      })
      .catch((e) => e)) as ProviderNotificationError;

    expect(error).toBeInstanceOf(ProviderNotificationError);
    expect(error.reason).toBe("transient");
  });
});

describe("parseGoogleNotification", () => {
  it("normalizes a change callback from the Google headers", () => {
    const notification = parseGoogleNotification({
      "x-goog-channel-id": "chan-1",
      "x-goog-channel-token": "chan-token",
      "x-goog-resource-id": "res-1",
      "x-goog-resource-state": "exists",
    });

    expect(notification).toEqual({
      channelId: "chan-1",
      resourceId: "res-1",
      token: "chan-token",
      state: "changed",
    });
  });

  it("maps the initial sync handshake to initialSync", () => {
    const notification = parseGoogleNotification({
      "x-goog-channel-id": "chan-1",
      "x-goog-channel-token": "chan-token",
      "x-goog-resource-id": "res-1",
      "x-goog-resource-state": "sync",
    });

    expect(notification?.state).toBe("initialSync");
  });

  it("carries a null token when the header is absent, for the verifier to reject", () => {
    const notification = parseGoogleNotification({
      "x-goog-channel-id": "chan-1",
      "x-goog-resource-id": "res-1",
      "x-goog-resource-state": "exists",
    });

    expect(notification?.token).toBeNull();
  });

  it("returns null when the channel or resource header is missing", () => {
    expect(
      parseGoogleNotification({ "x-goog-resource-id": "res-1" }),
    ).toBeNull();
    expect(
      parseGoogleNotification({ "x-goog-channel-id": "chan-1" }),
    ).toBeNull();
  });
});
