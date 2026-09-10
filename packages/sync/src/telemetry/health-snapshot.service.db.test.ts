import { faker } from "@faker-js/faker";
import { NodeEnv } from "@core/constants/core.constants";
import { type PostHogCaptureClient } from "@core/logger/posthog-capture";
import { type DateTime } from "@core/types/domain-primitives";
import {
  type ConnectionId,
  type PrincipalId,
  type ProviderAccountId,
  type ProviderCapability,
  type ProviderKind,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import {
  type ProviderRegistration,
  ProviderRegistry,
} from "@sync/providers/provider-registry";
import { assertNoSafetyCanary } from "@sync/safety/safety-canary";
import { buildServiceIdentity } from "@sync/service-identity";
import { JobRepository } from "@sync/storage/repositories/job.repository";
import { ProviderConnectionRepository } from "@sync/storage/repositories/provider-connection.repository";
import { SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";
import {
  computeHealthSnapshotForProvider,
  computeHealthSnapshots,
  emitHealthSnapshot,
  HEALTH_SUBSCRIPTION_RENEW_BEFORE_MS,
} from "@sync/telemetry/health-snapshot.service";
import { beforeEach, describe, expect, it } from "bun:test";

const objectId = () => faker.database.mongodbObjectId();
const NOW = new Date("2026-07-25T02:00:00.000Z");

function fakeRegistration(
  capabilities: readonly ProviderCapability[],
): ProviderRegistration {
  return {
    adapters: {} as ProviderRegistration["adapters"],
    scopes: { forFeatures: () => [] },
    capabilities,
    callbackPath: "/sync/test",
    notificationsCallbackPath: "/sync/notifications/test",
    capabilitiesFromScopes: () => [...capabilities],
  };
}

function fakeRegistry(
  entries: Partial<Record<ProviderKind, readonly ProviderCapability[]>>,
): ProviderRegistry {
  const registrations = new Map<ProviderKind, ProviderRegistration>();
  for (const kind of Object.keys(entries) as ProviderKind[]) {
    const capabilities = entries[kind];
    if (capabilities) {
      registrations.set(kind, fakeRegistration(capabilities));
    }
  }
  return new ProviderRegistry(registrations);
}

describe("computeHealthSnapshot", () => {
  const storage = setupSyncStorage(import.meta.url);
  let connections: ProviderConnectionRepository;
  let resources: SyncResourceRepository;
  let jobs: JobRepository;

  const registry = fakeRegistry({
    google: [
      "readEvents",
      "writeEvents",
      "changeNotifications",
      "incrementalChanges",
    ],
    microsoft: [
      "readEvents",
      "writeEvents",
      "changeNotifications",
      "incrementalChanges",
    ],
    apple: ["readEvents", "writeEvents", "incrementalChanges"],
  });

  beforeEach(() => {
    connections = new ProviderConnectionRepository(storage.db());
    resources = new SyncResourceRepository(storage.db());
    jobs = new JobRepository(storage.db());
  });

  const identity = buildServiceIdentity({
    environment: NodeEnv.Test,
    execution: "passive",
  });

  const deps = () => ({
    mongo: storage.mongo(),
    identity,
    registry,
    now: () => NOW,
  });

  const seedConnection = (
    provider: ProviderKind,
    state: "healthy" | "delayed" | "actionRequired" | "disconnected",
  ) =>
    connections.upsertByProviderAccount({
      tenantId: objectId() as TenantId,
      principalId: objectId() as PrincipalId,
      provider,
      account: {
        providerAccountId: objectId() as ProviderAccountId,
        email: "h@example.com",
        displayName: null,
      },
      capabilities: ["readEvents"],
      state,
      stateReason: state === "actionRequired" ? "authorizationRevoked" : null,
    });

  it("aggregates connection states, jobs, subscriptions, and freshness per provider", async () => {
    await seedConnection("google", "healthy");
    await seedConnection("google", "healthy");
    await seedConnection("google", "delayed");
    await seedConnection("google", "disconnected");
    await seedConnection("microsoft", "healthy");
    await seedConnection("apple", "healthy");
    await seedConnection("apple", "healthy");

    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const googleConnection = await seedConnection("google", "healthy");
    const connectionId = googleConnection._id as ConnectionId;
    const healthySub = await resources.ensure({
      tenantId,
      principalId,
      connectionId,
      resourceKind: "events",
      calendarId: objectId() as never,
    });
    await resources.updateSubscription(tenantId, principalId, healthySub._id, {
      subscriptionId: "ch-healthy",
      subscriptionResourceId: "res-1",
      subscriptionToken: "tok-1",
      subscriptionExpiresAt: new Date(
        NOW.getTime() + HEALTH_SUBSCRIPTION_RENEW_BEFORE_MS + 60_000,
      ),
    });
    await resources.advanceCursor(
      tenantId,
      principalId,
      healthySub._id,
      "cursor",
      new Date(NOW.getTime() - 5_000),
    );

    const missing = await resources.ensure({
      tenantId,
      principalId,
      connectionId,
      resourceKind: "events",
      calendarId: objectId() as never,
    });
    await resources.advanceCursor(
      tenantId,
      principalId,
      missing._id,
      "cursor",
      new Date(NOW.getTime() - 60_000),
    );

    const appleConnection = await seedConnection("apple", "healthy");
    const appleResource = await resources.ensure({
      tenantId,
      principalId,
      connectionId: appleConnection._id as ConnectionId,
      resourceKind: "events",
      calendarId: objectId() as never,
    });
    await resources.advanceCursor(
      tenantId,
      principalId,
      appleResource._id,
      "cursor",
      new Date(NOW.getTime() - 45_000),
    );

    await jobs.enqueue({
      tenantId,
      principalId,
      connectionId,
      resourceId: null,
      commandId: null,
      kind: "incrementalPull",
      priority: 0,
      runAfter: new Date(NOW.getTime() - 15_000),
      coalescingKey: `pull:${objectId()}`,
    });

    const snapshots = await computeHealthSnapshots(deps());
    expect(snapshots).toHaveLength(3);

    const google = snapshots.find((row) => row.provider === "google");
    const microsoft = snapshots.find((row) => row.provider === "microsoft");
    const apple = snapshots.find((row) => row.provider === "apple");

    expect(google?.service).toBe("compass-sync");
    expect(google?.connections.healthy).toBe(3);
    expect(google?.connections.delayed).toBe(1);
    expect(google?.connections.disconnected).toBe(1);
    expect(google?.jobs.pending).toBe(1);
    expect(google?.jobs.oldestDueAgeMs).toBe(15_000);
    expect(google?.subscriptions.healthy).toBe(1);
    expect(google?.subscriptions.missing).toBe(1);
    // The subscribed resource in this fixture has never received a push, so it
    // counts as never notified — the signal that push delivery is broken.
    expect(google?.subscriptions.neverNotified).toBe(1);
    expect(google?.freshness.sampleSize).toBe(2);
    expect(google?.freshness.p50Ms).toBeGreaterThan(0);
    expect(google?.freshness.percentOver30s).toBeGreaterThan(0);
    expect(google?.computedAt).toBe(NOW.toISOString() as DateTime);

    expect(microsoft?.connections.healthy).toBe(1);
    expect(microsoft?.jobs.pending).toBe(0);
    expect(microsoft?.subscriptions).toEqual({
      healthy: 0,
      renewSoon: 0,
      expired: 0,
      missing: 0,
      neverNotified: 0,
    });

    expect(apple?.connections.healthy).toBe(3);
    expect(apple?.subscriptions).toEqual({
      healthy: 0,
      renewSoon: 0,
      expired: 0,
      missing: 0,
      neverNotified: 0,
    });
    expect(apple?.freshness.sampleSize).toBe(1);

    for (const snapshot of snapshots) {
      assertNoSafetyCanary(snapshot);
    }
  });

  // The gauge used to read changeNotifiedAt, which the serving pull CLEARS
  // within seconds. That made a fleet with perfectly healthy push delivery
  // report ~100% "never notified", so the number said the same thing whether
  // push worked or was completely dead (2026-08-23).
  it("does not count a resource whose push was received and then served", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const googleConnection = await seedConnection("google", "healthy");
    const connectionId = googleConnection._id as ConnectionId;
    const resource = await resources.ensure({
      tenantId,
      principalId,
      connectionId,
      resourceKind: "events",
      calendarId: objectId() as never,
    });
    await resources.updateSubscription(tenantId, principalId, resource._id, {
      subscriptionId: "ch-served",
      subscriptionResourceId: "res-served",
      subscriptionToken: "tok-served",
      subscriptionExpiresAt: new Date(
        NOW.getTime() + HEALTH_SUBSCRIPTION_RENEW_BEFORE_MS + 60_000,
      ),
    });

    const notifiedAt = new Date(NOW.getTime() - 30_000);
    await resources.markChangeNotified(
      tenantId,
      principalId,
      resource._id,
      notifiedAt,
    );
    // The pull that serves the notification clears the pending marker.
    await resources.clearChangeNotifiedIfUnchanged(
      tenantId,
      principalId,
      resource._id,
      notifiedAt,
    );

    const stored = await resources.findById(
      tenantId,
      principalId,
      resource._id,
    );
    expect(stored?.changeNotifiedAt).toBeNull();
    expect(stored?.pushLastReceivedAt).toEqual(notifiedAt);

    const snapshot = await computeHealthSnapshotForProvider(deps(), "google");
    expect(snapshot.subscriptions.neverNotified).toBe(0);
  });

  // The push-delivery alarm compares neverNotified against the LIVE channels
  // (healthy + renewSoon), so the gauge must count the same population. It
  // did not: staging fired the alarm on 2026-09-09 while its only live channel
  // was receiving pushes, because a dead connection's channel had expired
  // unrenewed without ever being notified and made neverNotified >= live on
  // its own. Google cannot notify an expired channel; it says nothing about
  // delivery.
  it("does not count an expired subscription that was never notified", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const googleConnection = await seedConnection("google", "healthy");
    const connectionId = googleConnection._id as ConnectionId;

    const live = await resources.ensure({
      tenantId,
      principalId,
      connectionId,
      resourceKind: "events",
      calendarId: objectId() as never,
    });
    await resources.updateSubscription(tenantId, principalId, live._id, {
      subscriptionId: "ch-live",
      subscriptionResourceId: "res-live",
      subscriptionToken: "tok-live",
      subscriptionExpiresAt: new Date(
        NOW.getTime() + HEALTH_SUBSCRIPTION_RENEW_BEFORE_MS + 60_000,
      ),
    });
    await resources.markChangeNotified(
      tenantId,
      principalId,
      live._id,
      new Date(NOW.getTime() - 60_000),
    );

    const expired = await resources.ensure({
      tenantId,
      principalId,
      connectionId,
      resourceKind: "events",
      calendarId: objectId() as never,
    });
    await resources.updateSubscription(tenantId, principalId, expired._id, {
      subscriptionId: "ch-expired",
      subscriptionResourceId: "res-expired",
      subscriptionToken: "tok-expired",
      subscriptionExpiresAt: new Date(NOW.getTime() - 60_000),
    });

    const snapshot = await computeHealthSnapshotForProvider(deps(), "google");
    expect(snapshot.subscriptions).toEqual({
      healthy: 1,
      renewSoon: 0,
      expired: 1,
      missing: 0,
      neverNotified: 0,
    });
  });

  it("emits one PostHog event per registered provider", async () => {
    const captured: Array<{
      event: string;
      properties: Record<string, unknown>;
    }> = [];
    const client: PostHogCaptureClient = {
      capture: async ({ event, properties }) => {
        captured.push({ event, properties });
      },
      shutdown: async () => {},
    };

    const snapshots = await emitHealthSnapshot({ deps: deps(), client });

    expect(snapshots).toHaveLength(3);
    expect(captured).toHaveLength(3);
    expect(captured.map((row) => row.properties["provider"]).sort()).toEqual([
      "apple",
      "google",
      "microsoft",
    ]);
    expect(captured[0]?.event).toBe("sync_health_snapshot");
    expect(captured[0]?.properties["service"]).toBe("compass-sync");
    assertNoSafetyCanary(captured[0]?.properties);
  });

  it("still computes when PostHog is not configured", async () => {
    const snapshots = await emitHealthSnapshot({ deps: deps(), client: null });
    expect(snapshots).toHaveLength(3);
    expect(snapshots.every((row) => row.service === "compass-sync")).toBe(true);
  });
});
