import { faker } from "@faker-js/faker";
import { type ConnectionId } from "@core/types/sync/identity.contracts";
import { seedOauthCredential } from "@sync/__tests__/helpers/credential-encryption";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { type AccessTokenSource } from "@sync/domain/provider-write-ladder";
import {
  maintainSubscription,
  type SubscriptionMaintenanceDeps,
} from "@sync/domain/subscription-maintenance.service";
import {
  type NotificationChannel,
  type ProviderNotificationAdapter,
  ProviderNotificationError,
} from "@sync/providers/provider-notifications.port";
import { type ProviderCalendarRecord } from "@sync/storage/contracts/provider-calendar.contracts";
import { type SyncResourceRecord } from "@sync/storage/contracts/sync-resource.contracts";
import { CredentialRepository } from "@sync/storage/repositories/credential.repository";
import { SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";

const objectId = () => faker.database.mongodbObjectId();
const now = () => new Date("2026-07-10T00:00:00.000Z");

// Records watch/stop calls and replays a scripted channel or throws a scripted
// error, so a test drives the adapter without a network round-trip.
class FakeNotifications implements ProviderNotificationAdapter {
  watched: Array<{
    channelId: string;
    token: string;
    calendarId?: string;
    kind: "events" | "calendarList";
  }> = [];
  stopped: Array<{ channelId: string; resourceId: string }> = [];
  #channel: NotificationChannel | null;
  #watchError: ProviderNotificationError | null;
  #stopError: Error | null;

  constructor(opts: {
    channel?: NotificationChannel | null;
    watchError?: ProviderNotificationError | null;
    stopError?: Error | null;
  }) {
    this.#channel = opts.channel ?? null;
    this.#watchError = opts.watchError ?? null;
    this.#stopError = opts.stopError ?? null;
  }

  watch = async (input: {
    accessToken: string;
    calendarId?: string;
    channelId: string;
    token: string;
    callbackUrl: string;
  }): Promise<NotificationChannel> => {
    this.watched.push({
      channelId: input.channelId,
      token: input.token,
      calendarId: input.calendarId,
      kind: input.calendarId === undefined ? "calendarList" : "events",
    });
    if (this.#watchError) throw this.#watchError;
    // Echo the caller's channel id, as the real adapter does.
    return {
      ...(this.#channel as NotificationChannel),
      channelId: input.channelId,
    };
  };

  stopChannel = async (input: {
    accessToken: string;
    channelId: string;
    resourceId: string;
  }): Promise<void> => {
    this.stopped.push({
      channelId: input.channelId,
      resourceId: input.resourceId,
    });
    if (this.#stopError) throw this.#stopError;
  };

  parseNotification = () => null;
}

const custody: AccessTokenSource = {
  getValidAccessToken: async () => "access-token",
  discardRevoked: async () => {},
  invalidateAccessToken: async () => {},
};

describe("maintainSubscription", () => {
  const storage = setupSyncStorage(import.meta.url);
  let resources: SyncResourceRepository;

  const maintenanceDeps = (
    notifications: FakeNotifications,
    supportsChangeNotifications = true,
  ): SubscriptionMaintenanceDeps => ({
    resources,
    notifications,
    custody,
    callbackUrl: "https://sync/cb",
    supportsChangeNotifications,
  });

  beforeEach(() => {
    resources = new SyncResourceRepository(storage.db());
  });

  // A calendar record maintainSubscription reads (connectionId + the provider's
  // calendar id); only those two fields matter to the operation.
  const calendar = (connectionId: string): ProviderCalendarRecord =>
    ({
      _id: objectId(),
      tenantId: objectId(),
      principalId: objectId(),
      connectionId,
      providerCalendarId: "primary@google.com",
      displayName: "Google",
      color: null,
      active: true,
      primary: true,
      accessRole: "owner",
      capabilities: {
        canReadEvents: true,
        canWriteEvents: true,
        canReadBusy: true,
        canInviteAttendees: true,
      },
      createdAt: now(),
      updatedAt: now(),
    }) as ProviderCalendarRecord;

  // Ensure an events resource for a calendar, optionally seeded with an existing
  // subscription that expires at `expiresAt`.
  const seedResource = async (
    cal: ProviderCalendarRecord,
    subscription?: { expiresAt: Date },
  ): Promise<SyncResourceRecord> => {
    const resource = await resources.ensure({
      tenantId: cal.tenantId,
      principalId: cal.principalId,
      connectionId: cal.connectionId,
      resourceKind: "events",
      calendarId: cal._id,
    });
    if (subscription) {
      await resources.updateSubscription(
        cal.tenantId,
        cal.principalId,
        resource._id,
        {
          subscriptionId: "old-channel",
          subscriptionResourceId: "old-resource",
          subscriptionToken: "old-token",
          subscriptionExpiresAt: subscription.expiresAt,
        },
      );
    }
    const fresh = await resources.findById(
      cal.tenantId,
      cal.principalId,
      resource._id,
    );
    if (!fresh) throw new Error("seed: resource vanished");
    return fresh;
  };

  const reload = (resource: SyncResourceRecord) =>
    resources.findById(resource.tenantId, resource.principalId, resource._id);

  it("opens a fresh channel when the resource has none", async () => {
    const cal = calendar(objectId());
    const resource = await seedResource(cal);
    const expiresAt = new Date("2026-07-17T00:00:00.000Z");
    const notifications = new FakeNotifications({
      channel: { channelId: "", resourceId: "res-1", expiresAt },
    });

    const outcome = await maintainSubscription(
      maintenanceDeps(notifications),
      cal,
      resource,
      now,
    );

    expect(outcome).toEqual({ status: "watched" });
    expect(notifications.stopped).toHaveLength(0);
    const saved = await reload(resource);
    // The stored channel/token are the ones the operation generated and passed
    // to watch; the resource id and expiry come back from the provider.
    expect(saved?.subscriptionId).toBe(notifications.watched[0]?.channelId);
    expect(saved?.subscriptionToken).toBe(notifications.watched[0]?.token);
    expect(saved?.subscriptionResourceId).toBe("res-1");
    expect(saved?.subscriptionExpiresAt).toEqual(expiresAt);
    expect(notifications.watched[0]?.calendarId).toBe("primary@google.com");
  });

  it("renews and stops the old channel when it is near expiry", async () => {
    const cal = calendar(objectId());
    // Expires in 1 hour: inside the default 24h renew window.
    const resource = await seedResource(cal, {
      expiresAt: new Date("2026-07-10T01:00:00.000Z"),
    });
    const expiresAt = new Date("2026-07-17T00:00:00.000Z");
    const notifications = new FakeNotifications({
      channel: { channelId: "", resourceId: "res-2", expiresAt },
    });

    const outcome = await maintainSubscription(
      maintenanceDeps(notifications),
      cal,
      resource,
      now,
    );

    expect(outcome).toEqual({ status: "renewed" });
    // The OLD channel is stopped (by its stored id), not the new one.
    expect(notifications.stopped).toEqual([
      { channelId: "old-channel", resourceId: "old-resource" },
    ]);
    const saved = await reload(resource);
    expect(saved?.subscriptionResourceId).toBe("res-2");
    expect(saved?.subscriptionExpiresAt).toEqual(expiresAt);
    expect(saved?.subscriptionId).not.toBe("old-channel");
  });

  it("leaves a healthy channel untouched", async () => {
    const cal = calendar(objectId());
    // Expires in 3 days: outside the 24h renew window.
    const resource = await seedResource(cal, {
      expiresAt: new Date("2026-07-13T00:00:00.000Z"),
    });
    const notifications = new FakeNotifications({
      channel: { channelId: "", resourceId: "res-x", expiresAt: now() },
    });

    const outcome = await maintainSubscription(
      maintenanceDeps(notifications),
      cal,
      resource,
      now,
    );

    expect(outcome).toEqual({ status: "current" });
    expect(notifications.watched).toHaveLength(0);
    expect(notifications.stopped).toHaveLength(0);
    const saved = await reload(resource);
    expect(saved?.subscriptionId).toBe("old-channel");
  });

  it("clears the subscription and reports unsupported when the calendar cannot be watched", async () => {
    const cal = calendar(objectId());
    const resource = await seedResource(cal, {
      expiresAt: new Date("2026-07-10T01:00:00.000Z"),
    });
    const notifications = new FakeNotifications({
      watchError: new ProviderNotificationError("watchUnsupported", "nope"),
    });

    const outcome = await maintainSubscription(
      maintenanceDeps(notifications),
      cal,
      resource,
      now,
    );

    expect(outcome).toEqual({ status: "unsupported" });
    const saved = await reload(resource);
    expect(saved?.subscriptionId).toBeNull();
    expect(saved?.subscriptionExpiresAt).toBeNull();
    // The verdict is persisted so the pull path stops re-attempting a watch
    // every cycle.
    expect(saved?.watchUnsupportedAt).toEqual(now());
  });

  it("clears a persisted unsupported verdict when a later watch succeeds", async () => {
    const cal = calendar(objectId());
    const resource = await seedResource(cal);
    await resources.markWatchUnsupported(
      cal.tenantId,
      cal.principalId,
      resource._id,
      now(),
    );

    const outcome = await maintainSubscription(
      maintenanceDeps(
        new FakeNotifications({
          channel: {
            channelId: "",
            resourceId: "res-retry",
            expiresAt: new Date("2026-07-17T00:00:00.000Z"),
          },
        }),
      ),
      cal,
      resource,
      now,
    );

    expect(outcome).toEqual({ status: "watched" });
    const saved = await reload(resource);
    expect(saved?.watchUnsupportedAt).toBeNull();
  });

  it("reports authRevoked, discards the credential, and leaves the subscription", async () => {
    const connectionId = objectId() as ConnectionId;
    const cal = calendar(connectionId);
    const resource = await seedResource(cal, {
      expiresAt: new Date("2026-07-10T01:00:00.000Z"),
    });
    const credentials = new CredentialRepository(storage.db());
    await seedOauthCredential(credentials, {
      connectionId,
      provider: "google",
      refreshToken: "stored-refresh-token",
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
    });
    const discardingCustody = {
      getValidAccessToken: async () => "access-token",
      discardRevoked: async (id: ConnectionId) => {
        await credentials.deleteByConnection(id);
      },
      invalidateAccessToken: async () => {},
    };
    const notifications = new FakeNotifications({
      watchError: new ProviderNotificationError("authorizationRevoked", "gone"),
    });

    const outcome = await maintainSubscription(
      {
        ...maintenanceDeps(notifications),
        custody: discardingCustody,
      },
      cal,
      resource,
      now,
    );

    expect(outcome).toEqual({ status: "authRevoked" });
    // Left as-is: a reconnect re-bootstraps; we do not clear a possibly-live one.
    const saved = await reload(resource);
    expect(saved?.subscriptionId).toBe("old-channel");
    expect(await credentials.findByConnection(connectionId)).toBeNull();
  });

  it("throws on a transient watch failure so the worker retries", async () => {
    const cal = calendar(objectId());
    const resource = await seedResource(cal);
    const notifications = new FakeNotifications({
      watchError: new ProviderNotificationError("transient", "try later"),
    });

    await expect(
      maintainSubscription(maintenanceDeps(notifications), cal, resource, now),
    ).rejects.toThrow("try later");
  });

  it("settles a durable watchFailed as unsupported so polling covers it", async () => {
    // 2026-08-07 prod: watchFailed was rethrown as retryableTransient and
    // burned all 20 attempts (78 PostHog exceptions for one job). A durable
    // refusal must free the coalescing key and fall back to reconcile pulls.
    const cal = calendar(objectId());
    const resource = await seedResource(cal, {
      expiresAt: new Date("2026-07-10T01:00:00.000Z"),
    });
    const notifications = new FakeNotifications({
      watchError: new ProviderNotificationError(
        "watchFailed",
        "Google refused to open the channel (HTTP 403, reason forbidden)",
      ),
    });

    const outcome = await maintainSubscription(
      maintenanceDeps(notifications),
      cal,
      resource,
      now,
    );

    expect(outcome).toEqual({ status: "unsupported" });
    const saved = await reload(resource);
    expect(saved?.subscriptionId).toBeNull();
    expect(saved?.subscriptionExpiresAt).toBeNull();
  });

  it("persists the new channel even when stopping the old one fails", async () => {
    const cal = calendar(objectId());
    const resource = await seedResource(cal, {
      expiresAt: new Date("2026-07-10T01:00:00.000Z"),
    });
    const expiresAt = new Date("2026-07-17T00:00:00.000Z");
    const notifications = new FakeNotifications({
      channel: { channelId: "", resourceId: "res-3", expiresAt },
      stopError: new Error("stop blew up"),
    });

    const outcome = await maintainSubscription(
      maintenanceDeps(notifications),
      cal,
      resource,
      now,
    );

    expect(outcome).toEqual({ status: "renewed" });
    const saved = await reload(resource);
    expect(saved?.subscriptionResourceId).toBe("res-3");
  });

  it("opens a calendar-list channel without watching a calendar's events", async () => {
    const tenantId = objectId() as ProviderCalendarRecord["tenantId"];
    const principalId = objectId() as ProviderCalendarRecord["principalId"];
    const connectionId = objectId() as ConnectionId;
    const resource = await resources.ensure({
      tenantId,
      principalId,
      connectionId,
      resourceKind: "calendarList",
      calendarId: null,
    });
    const expiresAt = new Date("2026-07-17T00:00:00.000Z");
    const notifications = new FakeNotifications({
      channel: { channelId: "", resourceId: "res-list", expiresAt },
    });

    const outcome = await maintainSubscription(
      maintenanceDeps(notifications),
      null,
      resource,
      now,
    );

    expect(outcome).toEqual({ status: "watched" });
    expect(notifications.watched).toEqual([
      expect.objectContaining({ kind: "calendarList" }),
    ]);
    const saved = await resources.findById(tenantId, principalId, resource._id);
    expect(saved?.subscriptionResourceId).toBe("res-list");
  });

  it("returns unsupported without calling watch when changeNotifications is false", async () => {
    const cal = calendar(objectId());
    const resource = await seedResource(cal);
    const notifications = new FakeNotifications({
      channel: {
        channelId: "",
        resourceId: "res-poll",
        expiresAt: new Date("2026-07-17T00:00:00.000Z"),
      },
    });

    const outcome = await maintainSubscription(
      maintenanceDeps(notifications, false),
      cal,
      resource,
      now,
    );

    expect(outcome).toEqual({ status: "unsupported" });
    expect(notifications.watched).toHaveLength(0);
    const saved = await reload(resource);
    expect(saved?.watchUnsupportedAt).toEqual(now());
    expect(saved?.subscriptionId).toBeNull();
  });
});
