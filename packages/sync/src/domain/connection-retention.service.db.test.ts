import { faker } from "@faker-js/faker";
import { type DateTime, type TimeZone } from "@core/types/domain-primitives";
import { type ProviderEventVersion } from "@core/types/sync/event.contracts";
import {
  type ConnectionId,
  type PrincipalId,
  type ProviderAccountId,
  type ProviderCalendarSourceId,
  type ProviderEventId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import {
  CONNECTION_CACHE_RETENTION_MS,
  purgeExpiredDisconnectedConnections,
} from "@sync/domain/connection-retention.service";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import {
  type EventOccurrenceRecord,
  EventOccurrenceRecordSchema,
} from "@sync/storage/contracts/event-occurrence.contracts";
import { CredentialRepository } from "@sync/storage/repositories/credential.repository";
import { DeletionMarkerRepository } from "@sync/storage/repositories/deletion-marker.repository";
import { EventRepository } from "@sync/storage/repositories/event.repository";
import { EventOccurrenceRepository } from "@sync/storage/repositories/event-occurrence.repository";
import { JobRepository } from "@sync/storage/repositories/job.repository";
import { ProviderCalendarRepository } from "@sync/storage/repositories/provider-calendar.repository";
import { ProviderConnectionRepository } from "@sync/storage/repositories/provider-connection.repository";
import { SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";
import { beforeEach, describe, expect, it } from "bun:test";

const objectId = () => faker.database.mongodbObjectId();
const NOW = new Date("2026-07-24T12:00:00.000Z");
const RETENTION_CUTOFF = new Date(
  NOW.getTime() - CONNECTION_CACHE_RETENTION_MS,
);

describe("purgeExpiredDisconnectedConnections", () => {
  const storage = setupSyncStorage(import.meta.url);

  let connections: ProviderConnectionRepository;
  let credentials: CredentialRepository;
  let calendars: ProviderCalendarRepository;
  let events: EventRepository;
  let eventOccurrences: EventOccurrenceRepository;
  let syncResources: SyncResourceRepository;
  let jobs: JobRepository;
  let deletionMarkers: DeletionMarkerRepository;

  beforeEach(() => {
    const db = storage.db();
    connections = new ProviderConnectionRepository(db);
    credentials = new CredentialRepository(db);
    calendars = new ProviderCalendarRepository(db);
    events = new EventRepository(db);
    eventOccurrences = new EventOccurrenceRepository(db, storage.client());
    syncResources = new SyncResourceRepository(db);
    jobs = new JobRepository(db);
    deletionMarkers = new DeletionMarkerRepository(db);
  });

  const deps = () => ({
    connections,
    credentials,
    calendars,
    events,
    eventOccurrences,
    syncResources,
    jobs,
    deletionMarkers,
  });

  const seedConnection = async (
    tenantId: string,
    principalId: string,
    disconnectedAt: Date | null,
  ) => {
    const connection = await connections.upsertByProviderAccount({
      tenantId: tenantId as TenantId,
      principalId: principalId as PrincipalId,
      provider: "google",
      account: {
        providerAccountId: objectId() as ProviderAccountId,
        email: "cache@example.com",
        displayName: null,
      },
      capabilities: ["readEvents"],
      state: "healthy",
      stateReason: null,
    });
    if (disconnectedAt) {
      await connections.markDisconnected(
        tenantId as TenantId,
        principalId as PrincipalId,
        connection._id,
        disconnectedAt,
      );
    }
    return connection;
  };

  it("purges cache for connections disconnected before the retention cutoff", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const otherPrincipal = objectId() as PrincipalId;

    const expired = await seedConnection(
      tenantId,
      principalId,
      new Date(RETENTION_CUTOFF.getTime() - 60_000),
    );
    const recent = await seedConnection(
      tenantId,
      principalId,
      new Date(RETENTION_CUTOFF.getTime() + 60_000),
    );
    const live = await seedConnection(tenantId, otherPrincipal, null);

    const calendar = await calendars.upsertByProviderCalendar({
      tenantId: tenantId,
      principalId: principalId,
      connectionId: expired._id,
      providerCalendarId: "primary" as ProviderCalendarSourceId,
      displayName: "Primary",
      color: null,
      active: true,
      primary: true,
      accessRole: "owner",
      capabilities: {
        canReadBusy: true,
        canReadEvents: true,
        canWriteEvents: true,
        canInviteAttendees: false,
      },
      eventLabels: [],
      createsGoogleMeet: true,
    });
    await events.upsertByProviderIdentity({
      tenantId: tenantId,
      principalId: principalId,
      origin: "provider",
      calendarId: calendar._id,
      clientEventId: null,
      connectionId: expired._id,
      providerEventId: "gcal-1" as ProviderEventId,
      providerVersion: "etag-1" as ProviderEventVersion,
      providerUpdatedAt: NOW,
      deliveryState: "confirmed",
      providerMetadata: null,
      content: {
        title: "Cached meeting",
        description: "",
        location: null,
        organizer: null,
        attendees: [],
        conference: null,
      },
      schedule: {
        kind: "timed",
        start: "2026-07-14T09:00:00-06:00" as DateTime,
        end: "2026-07-14T10:00:00-06:00" as DateTime,
        timeZone: "America/Denver" as TimeZone,
      },
      recurrence: { kind: "single" },
      lifecycleState: "active",
      generation: 0,
      confirmedAt: NOW,
    });
    const occurrence = EventOccurrenceRecordSchema.parse({
      _id: objectId(),
      tenantId,
      principalId,
      eventId: objectId(),
      occurrenceKey: `${objectId()}:${NOW.toISOString()}`,
      calendarId: calendar._id,
      schedule: {
        kind: "timed",
        start: "2026-07-14T09:00:00-06:00",
        end: "2026-07-14T10:00:00-06:00",
        timeZone: "America/Denver",
      },
      startAt: NOW,
      endAt: new Date(NOW.getTime() + 60 * 60_000),
      busy: true,
      title: "Cached meeting",
      cancelled: false,
      generation: 0,
    });
    await storage
      .db()
      .collection<EventOccurrenceRecord>(SYNC_COLLECTIONS.eventOccurrences)
      .insertOne(occurrence);
    await syncResources.ensure({
      tenantId: tenantId,
      principalId: principalId,
      connectionId: expired._id,
      resourceKind: "calendarList",
      calendarId: null,
    });
    await jobs.enqueue({
      tenantId: tenantId,
      principalId: principalId,
      connectionId: expired._id,
      resourceId: null,
      commandId: null,
      kind: "calendarListSync",
      priority: 0,
      runAfter: NOW,
      coalescingKey: `retention:${expired._id}`,
    });

    const purged = await purgeExpiredDisconnectedConnections(
      deps(),
      RETENTION_CUTOFF,
    );

    expect(purged).toBe(1);
    expect(
      await connections.findById(tenantId, principalId, expired._id),
    ).toBeNull();
    expect(
      await calendars.listByConnection(
        tenantId,
        principalId,
        expired._id as ConnectionId,
      ),
    ).toHaveLength(0);
    expect(
      await storage
        .db()
        .collection(SYNC_COLLECTIONS.events)
        .countDocuments({ connectionId: expired._id }),
    ).toBe(0);
    expect(
      await storage
        .db()
        .collection(SYNC_COLLECTIONS.eventOccurrences)
        .countDocuments({ calendarId: calendar._id }),
    ).toBe(0);
    expect(
      await connections.findById(tenantId, principalId, recent._id),
    ).not.toBeNull();
    expect(
      await connections.findById(tenantId, otherPrincipal, live._id),
    ).not.toBeNull();
  });

  it("is idempotent when nothing is past retention", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    await seedConnection(
      tenantId,
      principalId,
      new Date(RETENTION_CUTOFF.getTime() + 60_000),
    );

    expect(
      await purgeExpiredDisconnectedConnections(deps(), RETENTION_CUTOFF),
    ).toBe(0);
    expect(
      await purgeExpiredDisconnectedConnections(deps(), RETENTION_CUTOFF),
    ).toBe(0);
  });

  it("skips purge when the connection reconnects before processing", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const expiredAt = new Date(RETENTION_CUTOFF.getTime() - 60_000);
    const connection = await seedConnection(tenantId, principalId, expiredAt);

    await connections.upsertByProviderAccount({
      tenantId: tenantId,
      principalId: principalId,
      provider: "google",
      account: {
        providerAccountId: connection.account.providerAccountId,
        email: "cache@example.com",
        displayName: null,
      },
      capabilities: ["readEvents"],
      state: "healthy",
      stateReason: null,
    });

    const purged = await purgeExpiredDisconnectedConnections(
      deps(),
      RETENTION_CUTOFF,
    );

    expect(purged).toBe(0);
    expect(
      await connections.findById(tenantId, principalId, connection._id),
    ).not.toBeNull();
  });

  it("bounds the sweep and takes the oldest disconnect first", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const older = await seedConnection(
      tenantId,
      principalId,
      new Date(RETENTION_CUTOFF.getTime() - 3 * 60_000),
    );
    await seedConnection(
      tenantId,
      principalId,
      new Date(RETENTION_CUTOFF.getTime() - 60_000),
    );

    const purged = await purgeExpiredDisconnectedConnections(
      deps(),
      RETENTION_CUTOFF,
      1,
    );

    expect(purged).toBe(1);
    expect(
      await connections.findById(tenantId, principalId, older._id),
    ).toBeNull();
    expect(
      await connections.listByPrincipal(tenantId, principalId),
    ).toHaveLength(1);
  });
});
