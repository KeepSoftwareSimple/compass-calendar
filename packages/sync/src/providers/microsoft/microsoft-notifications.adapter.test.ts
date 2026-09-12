import { verifyNotification } from "@sync/notifications/notification-verification";
import {
  MicrosoftNotificationAdapter as Adapter,
  type GraphSubscription,
  type MicrosoftSubscriptionCreateBody,
  type MicrosoftSubscriptionsApi,
  parseMicrosoftNotification,
} from "@sync/providers/microsoft/microsoft-notifications.adapter";
import { type ProviderNotificationError } from "@sync/providers/provider-notifications.port";
import { type SyncResourceRecord } from "@sync/storage/contracts/sync-resource.contracts";

const msError = (status: number, code?: string) =>
  Object.assign(new Error(`microsoft error ${status}`), {
    response: {
      status,
      data: code ? { error: { code, message: code } } : undefined,
    },
    config: { headers: { Authorization: "Bearer super-secret-token" } },
  });

type CreateBehavior = GraphSubscription | Error;
type DeleteBehavior = Error | undefined;

class FakeSubscriptionsApi implements MicrosoftSubscriptionsApi {
  createCalls: MicrosoftSubscriptionCreateBody[] = [];
  deleteCalls: string[] = [];

  constructor(
    private readonly behavior: {
      create?: CreateBehavior;
      delete?: DeleteBehavior;
    } = {},
  ) {}

  async createSubscription(
    body: MicrosoftSubscriptionCreateBody,
  ): Promise<GraphSubscription> {
    this.createCalls.push(body);
    if (this.behavior.create instanceof Error) throw this.behavior.create;
    return (
      this.behavior.create ?? {
        id: "sub-1",
        resource: body.resource,
        expirationDateTime: "2026-01-02T00:00:00.000Z",
      }
    );
  }

  async deleteSubscription(subscriptionId: string): Promise<void> {
    this.deleteCalls.push(subscriptionId);
    if (this.behavior.delete) throw this.behavior.delete;
  }
}

const adapterWith = (
  api: MicrosoftSubscriptionsApi,
  now = () => new Date("2026-01-01T00:00:00Z"),
) => {
  const tokens: string[] = [];
  const adapter = new Adapter((accessToken) => {
    tokens.push(accessToken);
    return api;
  }, now);
  return { adapter, tokens };
};

const watchInput = {
  accessToken: "at",
  calendarId: "AAMkAGI2TG93AAA=",
  channelId: "chan-1",
  token: "chan-token",
  callbackUrl: "https://sync.example.com/sync/notifications/microsoft",
};

describe("MicrosoftNotificationAdapter watch/stop", () => {
  it("opens a subscription with the Graph payload and returns provider expiry", async () => {
    const api = new FakeSubscriptionsApi({
      create: {
        id: "sub-1",
        resource: "/me/calendars/AAMkAGI2TG93AAA=/events",
        expirationDateTime: "2026-01-02T00:00:00.000Z",
      },
    });
    const { adapter, tokens } = adapterWith(api);

    const channel = await adapter.watch(watchInput);

    expect(tokens).toEqual(["at"]);
    expect(api.createCalls[0]).toEqual({
      changeType: "created,updated,deleted",
      notificationUrl: "https://sync.example.com/sync/notifications/microsoft",
      lifecycleNotificationUrl:
        "https://sync.example.com/sync/notifications/microsoft",
      resource: "/me/calendars/AAMkAGI2TG93AAA=/events",
      clientState: "chan-token",
      expirationDateTime: "2026-01-03T00:00:00.000Z",
    });
    expect(channel).toEqual({
      channelId: "sub-1",
      resourceId: "/me/calendars/AAMkAGI2TG93AAA=/events",
      expiresAt: new Date("2026-01-02T00:00:00.000Z"),
      // Graph validated the notification URL before returning the
      // subscription, so the watch itself proves the callback route.
      callbackVerified: true,
    });
  });

  it("clamps ttl to Graph's 4230 minute maximum", async () => {
    const api = new FakeSubscriptionsApi();
    const { adapter } = adapterWith(api);

    await adapter.watch({
      ...watchInput,
      ttlMs: 5000 * 60 * 60 * 1000,
    });

    expect(api.createCalls[0]?.expirationDateTime).toBe(
      "2026-01-03T22:30:00.000Z",
    );
  });

  it("requests a caller-supplied ttl but lets the provider expiry win", async () => {
    const api = new FakeSubscriptionsApi({
      create: {
        id: "sub-1",
        resource: "/me/calendars/AAMkAGI2TG93AAA=/events",
        expirationDateTime: "2026-01-01T12:00:00.000Z",
      },
    });
    const { adapter } = adapterWith(api);

    const channel = await adapter.watch({
      ...watchInput,
      ttlMs: 3600_000,
    });

    expect(api.createCalls[0]?.expirationDateTime).toBe(
      "2026-01-01T01:00:00.000Z",
    );
    expect(channel.expiresAt).toEqual(new Date("2026-01-01T12:00:00.000Z"));
  });

  it("falls back to the requested expiry when the provider omits one", async () => {
    const api = new FakeSubscriptionsApi({
      create: {
        id: "sub-1",
        resource: "/me/calendars/AAMkAGI2TG93AAA=/events",
        expirationDateTime: "",
      },
    });
    const { adapter } = adapterWith(api);

    const channel = await adapter.watch({
      ...watchInput,
      ttlMs: 3600_000,
    });

    expect(channel.expiresAt).toEqual(new Date("2026-01-01T01:00:00.000Z"));
  });

  it("refuses calendar-list watches as unsupported", async () => {
    const api = new FakeSubscriptionsApi();
    const { adapter } = adapterWith(api);

    const error = (await adapter
      .watch({
        accessToken: "at",
        channelId: "chan-list",
        token: "chan-token",
        callbackUrl: "https://sync.example.com/sync/notifications/microsoft",
      })
      .catch((e) => e)) as ProviderNotificationError;

    expect(error.reason).toBe("watchUnsupported");
    expect(api.createCalls).toHaveLength(0);
  });

  it("fails when the provider returns no subscription id", async () => {
    const api = new FakeSubscriptionsApi({
      create: {
        id: "",
        resource: "/me/calendars/AAMkAGI2TG93AAA=/events",
        expirationDateTime: "2026-01-02T00:00:00.000Z",
      },
    });
    const { adapter } = adapterWith(api);

    const error = (await adapter
      .watch(watchInput)
      .catch((e) => e)) as ProviderNotificationError;

    expect(error.reason).toBe("watchFailed");
  });

  it("classifies ExtensionError as watchUnsupported", async () => {
    const api = new FakeSubscriptionsApi({
      create: msError(400, "ExtensionError"),
    });
    const { adapter } = adapterWith(api);

    const error = (await adapter
      .watch(watchInput)
      .catch((e) => e)) as ProviderNotificationError;

    expect(error.reason).toBe("watchUnsupported");
  });

  it("classifies other 4xx responses as watchFailed", async () => {
    const api = new FakeSubscriptionsApi({ create: msError(403, "Forbidden") });
    const { adapter } = adapterWith(api);

    const error = (await adapter
      .watch(watchInput)
      .catch((e) => e)) as ProviderNotificationError;

    expect(error.reason).toBe("watchFailed");
  });

  it("classifies 429 and 5xx as transient", async () => {
    for (const status of [429, 500, 503]) {
      const api = new FakeSubscriptionsApi({ create: msError(status) });
      const { adapter } = adapterWith(api);

      const error = (await adapter
        .watch(watchInput)
        .catch((e) => e)) as ProviderNotificationError;

      expect(error.reason).toBe("transient");
    }
  });

  it("classifies a revoked credential and never leaks the bearer token", async () => {
    const api = new FakeSubscriptionsApi({ create: msError(401) });
    const { adapter } = adapterWith(api);

    const error = (await adapter
      .watch(watchInput)
      .catch((e) => e)) as ProviderNotificationError;

    expect(error.reason).toBe("authorizationRevoked");
    expect(JSON.stringify(error.cause ?? {})).not.toContain(
      "super-secret-token",
    );
  });

  it("stops a subscription by id", async () => {
    const api = new FakeSubscriptionsApi();
    const { adapter } = adapterWith(api);

    await adapter.stopChannel({
      accessToken: "at",
      channelId: "sub-1",
      resourceId: "/me/calendars/AAMkAGI2TG93AAA=/events",
    });

    expect(api.deleteCalls).toEqual(["sub-1"]);
  });

  it("treats stopping an already-gone subscription as success", async () => {
    const api = new FakeSubscriptionsApi({ delete: msError(404) });
    const { adapter } = adapterWith(api);

    await adapter.stopChannel({
      accessToken: "at",
      channelId: "sub-1",
      resourceId: "/me/calendars/AAMkAGI2TG93AAA=/events",
    });
    expect(api.deleteCalls).toHaveLength(1);
  });

  it("surfaces an unexpected stop failure as transient", async () => {
    const api = new FakeSubscriptionsApi({ delete: msError(500) });
    const { adapter } = adapterWith(api);

    const error = (await adapter
      .stopChannel({
        accessToken: "at",
        channelId: "sub-1",
        resourceId: "/me/calendars/AAMkAGI2TG93AAA=/events",
      })
      .catch((e) => e)) as ProviderNotificationError;

    expect(error.reason).toBe("transient");
  });
});

describe("parseMicrosoftNotification", () => {
  it("normalizes a change callback from the Graph body", () => {
    const notification = parseMicrosoftNotification({
      headers: {},
      body: {
        value: [
          {
            subscriptionId: "chan-1",
            clientState: "chan-token",
            resource: "/me/calendars/AAMkAGI2TG93AAA=/events",
            changeType: "updated",
          },
        ],
      },
      query: {},
    });

    expect(notification).toEqual({
      channelId: "chan-1",
      resourceId: "/me/calendars/AAMkAGI2TG93AAA=/events",
      token: "chan-token",
      state: "changed",
    });
  });

  it("returns a batch when Graph sends two notifications", () => {
    const parsed = parseMicrosoftNotification({
      headers: {},
      body: {
        value: [
          {
            subscriptionId: "chan-1",
            clientState: "chan-token",
            resource: "/me/calendars/cal-a/events",
            changeType: "created",
          },
          {
            subscriptionId: "chan-2",
            clientState: "chan-token-2",
            resource: "/me/calendars/cal-b/events",
            changeType: "deleted",
          },
        ],
      },
      query: {},
    });

    expect(parsed).toEqual({
      kind: "batch",
      notifications: [
        {
          channelId: "chan-1",
          resourceId: "/me/calendars/cal-a/events",
          token: "chan-token",
          state: "changed",
        },
        {
          channelId: "chan-2",
          resourceId: "/me/calendars/cal-b/events",
          token: "chan-token-2",
          state: "changed",
        },
      ],
    });
  });

  it("maps lifecycle notifications with a maintenance hint", () => {
    const notification = parseMicrosoftNotification({
      headers: {},
      body: {
        value: [
          {
            subscriptionId: "chan-1",
            clientState: "chan-token",
            resource: "/me/calendars/AAMkAGI2TG93AAA=/events",
            lifecycleEvent: "reauthorizationRequired",
          },
        ],
      },
      query: {},
    });

    expect(notification).toEqual({
      channelId: "chan-1",
      resourceId: "/me/calendars/AAMkAGI2TG93AAA=/events",
      token: "chan-token",
      state: "changed",
      lifecycle: "reauthorizationRequired",
    });
  });

  it("returns the validation handshake from validationToken query param", () => {
    const parsed = parseMicrosoftNotification({
      headers: {},
      body: {},
      query: { validationToken: "echo-me" },
    });

    expect(parsed).toEqual({ kind: "validation", body: "echo-me" });
  });

  it("rejects a tampered clientState downstream in verifyNotification", () => {
    const notification = parseMicrosoftNotification({
      headers: {},
      body: {
        value: [
          {
            subscriptionId: "chan-1",
            clientState: "wrong-token",
            resource: "/me/calendars/AAMkAGI2TG93AAA=/events",
            changeType: "updated",
          },
        ],
      },
      query: {},
    });

    expect(notification).not.toBeNull();
    if (!notification || !("channelId" in notification)) {
      throw new Error("expected a single notification");
    }

    const resource = {
      subscriptionId: "chan-1",
      subscriptionResourceId: "/me/calendars/AAMkAGI2TG93AAA=/events",
      subscriptionToken: "chan-token",
      subscriptionExpiresAt: new Date("2026-02-01T00:00:00.000Z"),
    } as SyncResourceRecord;

    expect(verifyNotification(notification, resource).status).toBe("rejected");
  });

  it("returns null when the body is not recognizable", () => {
    expect(
      parseMicrosoftNotification({ headers: {}, body: {}, query: {} }),
    ).toBeNull();
    expect(
      parseMicrosoftNotification({
        headers: {},
        body: { value: [{ resource: "only-resource" }] },
        query: {},
      }),
    ).toBeNull();
  });
});
