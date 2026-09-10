import { faker } from "@faker-js/faker";
import { NodeEnv } from "@core/constants/core.constants";
import {
  type ConnectionId,
  type PrincipalId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import { stringIdFilter } from "@sync/__tests__/helpers/mongo-id";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { createSyncService, type SyncService } from "@sync/app";
import { type SyncConfig } from "@sync/config/sync.config";
import { parseGoogleNotification } from "@sync/providers/google/google-notifications.adapter";
import { parseMicrosoftNotification } from "@sync/providers/microsoft/microsoft-notifications.adapter";
import { type ProviderNotificationAdapter } from "@sync/providers/provider-notifications.port";
import {
  buildProviderRegistry,
  NOTIFICATIONS_PARAM_PATH,
  ProviderRegistry,
  type ProviderRegistry as ProviderRegistryType,
} from "@sync/providers/provider-registry";
import { NOTIFICATIONS_PATH } from "@sync/server/notification.routes";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import { SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";
import { type SyncMongoService } from "@sync/storage/sync-mongo.service";
import { type AddressInfo } from "node:net";

const uri = process.env["SYNC_MONGO_URI"] as string;
const storage = setupSyncStorage(import.meta.url);
const objectId = () => faker.database.mongodbObjectId();

const testConfig = (overrides: Partial<SyncConfig> = {}): SyncConfig =>
  ({
    NODE_ENV: NodeEnv.Test,
    PORT: 0,
    MONGO_URI: uri,
    INTERNAL_AUTH_TOKEN: "secret",
    CALLBACK_BASE_URL: "http://localhost:3010",
    GOOGLE_CLIENT_ID: "test-client",
    GOOGLE_CLIENT_SECRET: "test-secret",
    EXECUTION: "active",
    MAX_CONCURRENCY: 4,
    ...overrides,
  }) as SyncConfig;

const CHANNEL = "chan-1";
const RESOURCE = "res-1";
const TOKEN = "channel-secret-token";

const googHeaders = (
  overrides: Record<string, string> = {},
): Record<string, string> => ({
  "x-goog-channel-id": CHANNEL,
  "x-goog-channel-token": TOKEN,
  "x-goog-resource-id": RESOURCE,
  "x-goog-resource-state": "exists",
  ...overrides,
});

describe("POST /sync/notifications/google", () => {
  let mongo: SyncMongoService;
  let resources: SyncResourceRepository;
  let service: SyncService;
  let base: string;

  const startService = async (
    config: SyncConfig = testConfig(),
    registry?: ProviderRegistryType,
  ) => {
    service = createSyncService(config, { mongo, registry });
    await new Promise<void>((resolve) => service.httpServer.listen(0, resolve));
    const { port } = service.httpServer.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
  };

  // Seed a synced resource with an active push subscription for CHANNEL.
  const seedSubscription = async (
    expiresAt = new Date(Date.now() + 60 * 60 * 1000),
    token = TOKEN,
    kind: "events" | "calendarList" = "events",
  ) => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const resource = await resources.ensure({
      tenantId,
      principalId,
      connectionId: objectId() as ConnectionId,
      resourceKind: kind,
      calendarId: kind === "events" ? objectId() : null,
    });
    await resources.updateSubscription(tenantId, principalId, resource._id, {
      subscriptionId: CHANNEL,
      subscriptionResourceId: RESOURCE,
      subscriptionToken: token,
      subscriptionExpiresAt: expiresAt,
    });
    return resource;
  };

  const post = (path: string, headers: Record<string, string>) =>
    fetch(`${base}${path}`, { method: "POST", headers });

  const registryWithMicrosoft = (
    notifications: ProviderNotificationAdapter,
  ) => {
    const google = buildProviderRegistry(testConfig()).get("google");
    return new ProviderRegistry(
      new Map([
        ["google", google],
        [
          "microsoft",
          {
            ...google,
            callbackPath: "/sync/microsoft",
            notificationsCallbackPath: "/sync/notifications/microsoft",
            adapters: { ...google.adapters, notifications },
          },
        ],
      ]),
    );
  };

  const microsoftNotificationsFromGoogleHeaders =
    (): ProviderNotificationAdapter => ({
      watch: async () => {
        throw new Error("unused in route test");
      },
      stopChannel: async () => {},
      parseNotification: (request) => parseGoogleNotification(request.headers),
    });

  const jobCount = (coalescingKey: string) =>
    mongo.db
      .collection(SYNC_COLLECTIONS.jobs)
      .countDocuments({ coalescingKey });

  beforeEach(() => {
    mongo = storage.mongo();
    resources = new SyncResourceRepository(mongo.db);
  });

  afterEach(async () => {
    await service?.stop();
  });

  it("enqueues one pull for an authentic change, coalescing duplicates", async () => {
    const { _id: resourceId } = await seedSubscription();
    await startService();

    const first = await post(NOTIFICATIONS_PATH, googHeaders());
    const second = await post(NOTIFICATIONS_PATH, googHeaders()); // duplicate delivery

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    // Both deliveries collapse to a single incrementalPull job.
    expect(await jobCount(`incrementalPull:${resourceId}`)).toBe(1);
  });

  it("stamps the change marker so a pull already in flight cannot miss the change", async () => {
    // The enqueue above no-ops whenever a job holds the coalescing key —
    // including the claimed row of a running pull that has already read the
    // provider. The marker is the only thing that survives that, and the pull's
    // compare-and-clear is what turns it back into a second pass.
    const { _id: resourceId } = await seedSubscription();
    await startService();

    const res = await post(NOTIFICATIONS_PATH, googHeaders());

    expect(res.status).toBe(200);
    const stored = await mongo.db
      .collection(SYNC_COLLECTIONS.syncResources)
      .findOne(stringIdFilter(resourceId));
    expect(stored?.["changeNotifiedAt"]).toBeInstanceOf(Date);
  });

  it("does not stamp the change marker on a rejected notification", async () => {
    const { _id: resourceId } = await seedSubscription();
    await startService();

    await post(
      NOTIFICATIONS_PATH,
      googHeaders({ "x-goog-channel-token": "wrong" }),
    );

    const stored = await mongo.db
      .collection(SYNC_COLLECTIONS.syncResources)
      .findOne(stringIdFilter(resourceId));
    expect(stored?.["changeNotifiedAt"]).toBeNull();
  });

  it("does not enqueue on the initial sync handshake", async () => {
    const { _id: resourceId } = await seedSubscription();
    await startService();

    const res = await post(
      NOTIFICATIONS_PATH,
      googHeaders({ "x-goog-resource-state": "sync" }),
    );

    expect(res.status).toBe(200);
    expect(await jobCount(`incrementalPull:${resourceId}`)).toBe(0);
  });

  it("rejects a spoofed token: accepts the request but enqueues nothing", async () => {
    const { _id: resourceId } = await seedSubscription();
    await startService();

    const res = await post(
      NOTIFICATIONS_PATH,
      googHeaders({ "x-goog-channel-token": "wrong" }),
    );

    // 200 so a spoofer learns nothing and triggers no retry — but no work.
    expect(res.status).toBe(200);
    expect(await jobCount(`incrementalPull:${resourceId}`)).toBe(0);
  });

  it("enqueues nothing for an unknown channel", async () => {
    await startService();

    const res = await post(
      NOTIFICATIONS_PATH,
      googHeaders({ "x-goog-channel-id": "unknown" }),
    );

    expect(res.status).toBe(200);
    expect(
      await mongo.db.collection(SYNC_COLLECTIONS.jobs).countDocuments({}),
    ).toBe(0);
  });

  it("enqueues nothing for a resource-id that does not match the subscription", async () => {
    const { _id: resourceId } = await seedSubscription();
    await startService();

    const res = await post(
      NOTIFICATIONS_PATH,
      googHeaders({ "x-goog-resource-id": "other-res" }),
    );

    expect(res.status).toBe(200);
    expect(await jobCount(`incrementalPull:${resourceId}`)).toBe(0);
  });

  it("enqueues nothing once the subscription has expired", async () => {
    const { _id: resourceId } = await seedSubscription(
      new Date(Date.now() - 1000),
    );
    await startService();

    const res = await post(NOTIFICATIONS_PATH, googHeaders());

    expect(res.status).toBe(200);
    expect(await jobCount(`incrementalPull:${resourceId}`)).toBe(0);
  });

  it("rejects a request with no recognizable notification headers", async () => {
    await startService();

    const res = await post(NOTIFICATIONS_PATH, {
      "x-goog-resource-state": "exists",
    });

    expect(res.status).toBe(400);
  });

  it("enqueues calendarListSync for a calendar-list channel change, not a pull", async () => {
    const resource = await seedSubscription(
      new Date(Date.now() + 60 * 60 * 1000),
      TOKEN,
      "calendarList",
    );
    await startService();

    const res = await post(NOTIFICATIONS_PATH, googHeaders());

    expect(res.status).toBe(200);
    expect(await jobCount(`calendarListSync:${resource.connectionId}`)).toBe(1);
    expect(await jobCount(`incrementalPull:${resource._id}`)).toBe(0);
  });

  it("clears the calendar-list cursor so the resulting pass re-enumerates", async () => {
    // A calendarList notification means the LIST itself changed. Listing
    // incrementally from the stored cursor would rest on the (untested, and
    // untestable from in here) assumption that Google reports a hidden-flag flip
    // as a changed entry. Clearing the cursor re-enumerates instead, which is
    // what makes a calendar hidden in Google leave the sidebar in seconds rather
    // than waiting on the daily sweep.
    const resource = await seedSubscription(
      new Date(Date.now() + 60 * 60 * 1000),
      TOKEN,
      "calendarList",
    );
    await resources.advanceCursor(
      resource.tenantId,
      resource.principalId,
      resource._id,
      "stored-token",
      new Date(),
    );
    await startService();

    await post(NOTIFICATIONS_PATH, googHeaders());

    const stored = await mongo.db
      .collection(SYNC_COLLECTIONS.syncResources)
      .findOne(stringIdFilter(String(resource._id)));
    expect(stored?.["syncCursor"]).toBeNull();
    // Only the cursor: the sweep's staleness clock must not advance on the
    // strength of a pass that has merely been scheduled. Read raw, so the key is
    // absent rather than defaulted to null; both mean "never fully listed".
    expect(stored?.["lastFullListAt"] ?? null).toBeNull();
  });

  it("does not clear the cursor for an events channel", async () => {
    // Scoping guard. An events cursor clear would force a full re-import of
    // every event on the calendar, which is enormously more expensive than the
    // re-enumeration this buys on the calendarList side.
    const resource = await seedSubscription();
    await resources.advanceCursor(
      resource.tenantId,
      resource.principalId,
      resource._id,
      "stored-token",
      new Date(),
    );
    await startService();

    await post(NOTIFICATIONS_PATH, googHeaders());

    const stored = await mongo.db
      .collection(SYNC_COLLECTIONS.syncResources)
      .findOne(stringIdFilter(String(resource._id)));
    expect(stored?.["syncCursor"]).toBe("stored-token");
  });

  it("does not clear the calendar-list cursor on a spoofed notification", async () => {
    // Otherwise anyone who could guess a channel id could force unbounded full
    // re-enumerations (~1 provider call per calendar each).
    const resource = await seedSubscription(
      new Date(Date.now() + 60 * 60 * 1000),
      TOKEN,
      "calendarList",
    );
    await resources.advanceCursor(
      resource.tenantId,
      resource.principalId,
      resource._id,
      "stored-token",
      new Date(),
    );
    await startService();

    await post(
      NOTIFICATIONS_PATH,
      googHeaders({ "x-goog-channel-token": "wrong" }),
    );

    const stored = await mongo.db
      .collection(SYNC_COLLECTIONS.syncResources)
      .findOne(stringIdFilter(String(resource._id)));
    expect(stored?.["syncCursor"]).toBe("stored-token");
  });

  it("clears the calendar-list cursor even when a sync job already exists", async () => {
    // The enqueue no-ops against an already-pending (or claimed) job on this
    // connection's coalescing key. The cursor clear is what still lands, and
    // whichever job ultimately runs reads it fresh — the same reasoning the
    // rediscovery sweep relies on.
    const resource = await seedSubscription(
      new Date(Date.now() + 60 * 60 * 1000),
      TOKEN,
      "calendarList",
    );
    await resources.advanceCursor(
      resource.tenantId,
      resource.principalId,
      resource._id,
      "stored-token",
      new Date(),
    );
    await startService();

    await post(NOTIFICATIONS_PATH, googHeaders());
    await post(NOTIFICATIONS_PATH, googHeaders()); // duplicate delivery, coalesces

    expect(await jobCount(`calendarListSync:${resource.connectionId}`)).toBe(1);
    const stored = await mongo.db
      .collection(SYNC_COLLECTIONS.syncResources)
      .findOne(stringIdFilter(String(resource._id)));
    expect(stored?.["syncCursor"]).toBeNull();
  });

  it("accepts and drops notifications in passive mode", async () => {
    const { _id: resourceId } = await seedSubscription();
    await startService(testConfig({ EXECUTION: "passive" }));

    const res = await post(NOTIFICATIONS_PATH, googHeaders());

    expect(res.status).toBe(200);
    expect(await jobCount(`incrementalPull:${resourceId}`)).toBe(0);
  });

  it("routes a google-shaped push on the microsoft path through verification", async () => {
    const { _id: resourceId } = await seedSubscription();
    await startService(
      testConfig(),
      registryWithMicrosoft(microsoftNotificationsFromGoogleHeaders()),
    );

    const res = await post("/sync/notifications/microsoft", googHeaders());

    expect(res.status).toBe(200);
    expect(await jobCount(`incrementalPull:${resourceId}`)).toBe(1);
  });

  it("returns 404 for an unknown provider notification path", async () => {
    await startService();

    const res = await post(
      `${NOTIFICATIONS_PARAM_PATH.replace(":provider", "apple")}`,
      googHeaders(),
    );

    expect(res.status).toBe(404);
  });

  it("echoes a validation handshake as text/plain", async () => {
    const validationAdapter: ProviderNotificationAdapter = {
      watch: async () => {
        throw new Error("unused in route test");
      },
      stopChannel: async () => {},
      parseNotification: () => ({
        kind: "validation",
        body: "validation-token",
      }),
    };
    await startService(testConfig(), registryWithMicrosoft(validationAdapter));

    const res = await post("/sync/notifications/microsoft", {});

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(await res.text()).toBe("validation-token");
  });

  it("enqueues subscriptionMaintain for a lifecycle notification", async () => {
    const { _id: resourceId } = await seedSubscription();
    const lifecycleAdapter: ProviderNotificationAdapter = {
      watch: async () => {
        throw new Error("unused in route test");
      },
      stopChannel: async () => {},
      parseNotification: (request) => parseMicrosoftNotification(request),
    };
    await startService(testConfig(), registryWithMicrosoft(lifecycleAdapter));

    const res = await fetch(`${base}/sync/notifications/microsoft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        value: [
          {
            subscriptionId: CHANNEL,
            clientState: TOKEN,
            resource: RESOURCE,
            lifecycleEvent: "reauthorizationRequired",
          },
        ],
      }),
    });

    expect(res.status).toBe(200);
    expect(await jobCount(`subscriptionMaintain:${resourceId}`)).toBe(1);
    expect(await jobCount(`incrementalPull:${resourceId}`)).toBe(0);
  });
});
