import { faker } from "@faker-js/faker";
import { type EventId } from "@core/types/domain-primitives";
import { type ConnectionState } from "@core/types/sync/connection.contracts";
import { type SyncEventCalendarId } from "@core/types/sync/event.contracts";
import {
  type ConnectionId,
  type PrincipalId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { computeBusyAvailability } from "@sync/domain/busy-query.service";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import { EventOccurrenceRepository } from "@sync/storage/repositories/event-occurrence.repository";
import { ProviderCalendarRepository } from "@sync/storage/repositories/provider-calendar.repository";
import { ProviderConnectionRepository } from "@sync/storage/repositories/provider-connection.repository";
import { SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";

const objectId = () => faker.database.mongodbObjectId();
const NOW = new Date("2026-07-14T12:00:00.000Z");
const MAX_AGE_MS = 10 * 60_000; // 10 minutes
const WINDOW_START = new Date("2026-07-14T09:00:00.000Z");
const WINDOW_END = new Date("2026-07-14T17:00:00.000Z");

describe("computeBusyAvailability", () => {
  const storage = setupSyncStorage(import.meta.url);
  let connections: ProviderConnectionRepository;
  let resources: SyncResourceRepository;
  let occurrences: EventOccurrenceRepository;
  let calendars: ProviderCalendarRepository;
  let tenantId: TenantId;
  let principalId: PrincipalId;
  let accountSeq: number;

  beforeEach(() => {
    connections = new ProviderConnectionRepository(storage.db());
    resources = new SyncResourceRepository(storage.db());
    occurrences = new EventOccurrenceRepository(storage.db(), storage.client());
    calendars = new ProviderCalendarRepository(storage.db());
    tenantId = objectId() as TenantId;
    principalId = objectId() as PrincipalId;
    accountSeq = 0;
  });

  const seedConnection = async (
    state: ConnectionState,
    lastSyncedAt: Date | null,
  ): Promise<ConnectionId> => {
    accountSeq += 1;
    const connection = await connections.upsertByProviderAccount({
      tenantId,
      principalId,
      provider: "google",
      account: {
        providerAccountId: `acct-${accountSeq}`,
        email: `user${accountSeq}@gmail.com`,
        displayName: "User",
      },
      capabilities: ["readEvents"],
      state,
      stateReason: null,
    });
    if (lastSyncedAt !== null) {
      await connections.updateDerivedState(
        tenantId,
        principalId,
        connection._id,
        {
          state,
          stateReason: null,
          lastSyncedAt,
          lastHealthyAt: lastSyncedAt,
        },
        NOW,
      );
    }
    return connection._id;
  };

  // Seed a calendar with its events resource (optionally never-synced or with a
  // given last-success time) and optional busy occurrences, on a connection of a
  // given health. Returns the calendar id.
  const seedCalendar = async (opts: {
    connectionId: ConnectionId;
    lastSuccessAt?: Date | null;
    cursorExpiredBackoffUntil?: Date;
    intervals?: Array<[string, string]>;
  }): Promise<SyncEventCalendarId> => {
    const calendarId = objectId() as SyncEventCalendarId;
    const resource = await resources.ensure({
      tenantId,
      principalId,
      connectionId: opts.connectionId,
      resourceKind: "events",
      calendarId,
    });
    if (opts.lastSuccessAt) {
      await resources.advanceCursor(
        tenantId,
        principalId,
        resource._id,
        "cursor",
        opts.lastSuccessAt,
      );
    }
    if (opts.cursorExpiredBackoffUntil) {
      await resources.recordCursorExpiry(
        tenantId,
        principalId,
        resource._id,
        opts.cursorExpiredBackoffUntil,
      );
    }
    for (const [start, end] of opts.intervals ?? []) {
      const eventId = objectId();
      await storage
        .db()
        .collection(SYNC_COLLECTIONS.eventOccurrences)
        .insertOne({
          _id: objectId(),
          tenantId,
          principalId,
          eventId,
          occurrenceKey: `${eventId}:${start}`,
          calendarId,
          generation: 0,
          startAt: new Date(start),
          endAt: new Date(end),
          busy: true,
          cancelled: false,
        });
    }
    return calendarId;
  };

  const run = (
    calendarIds: SyncEventCalendarId[],
    unbackedCalendarIds?: SyncEventCalendarId[],
    excludeEventIds?: EventId[],
  ) =>
    computeBusyAvailability(
      { occurrences, resources, connections, calendars },
      {
        tenantId,
        principalId,
        calendarIds,
        unbackedCalendarIds,
        excludeEventIds,
        start: WINDOW_START,
        end: WINDOW_END,
        maxAgeMs: MAX_AGE_MS,
        now: NOW,
      },
    );

  const fresh = new Date(NOW.getTime() - 60_000); // 1 min ago
  const old = new Date(NOW.getTime() - 60 * 60_000); // 1 hour ago (> maxAge)
  const bookingMaxAgeMs = 30 * 60_000; // 30 minutes, matches booking confirmation
  const threeHoursAgo = new Date(NOW.getTime() - 3 * 60 * 60_000);

  it("is complete and bookable when every calendar is fresh and its connection is healthy", async () => {
    const conn = await seedConnection("healthy", fresh);
    const calA = await seedCalendar({
      connectionId: conn,
      lastSuccessAt: fresh,
      intervals: [["2026-07-14T09:00Z", "2026-07-14T10:00Z"]],
    });
    const calB = await seedCalendar({
      connectionId: conn,
      lastSuccessAt: fresh,
      intervals: [["2026-07-14T09:30Z", "2026-07-14T11:00Z"]],
    });

    const result = await run([calA, calB]);

    expect(result.complete).toBe(true);
    expect(result.bookable).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.computedAt).toEqual(NOW);
    expect(
      result.intervals.map((i) => [i.start.toISOString(), i.end.toISOString()]),
    ).toEqual([["2026-07-14T09:00:00.000Z", "2026-07-14T11:00:00.000Z"]]);
    expect(result.connections).toHaveLength(1);
    expect(result.connections[0]?.state).toBe("healthy");
  });

  it("flags a not-imported calendar and is neither complete nor bookable", async () => {
    const conn = await seedConnection("healthy", fresh);
    const calA = await seedCalendar({
      connectionId: conn,
      lastSuccessAt: fresh,
    });
    const ghost = await calendars.upsertByProviderCalendar({
      tenantId,
      principalId,
      connectionId: conn,
      providerCalendarId: "ghost@google.com",
      displayName: "Ghost",
      color: null,
      active: true,
      primary: false,
      accessRole: "owner",
      capabilities: {
        canReadEvents: true,
        canWriteEvents: true,
        canReadBusy: true,
        canInviteAttendees: true,
      },
      eventLabels: [],
      createsGoogleMeet: true,
    });

    const result = await run([calA, ghost._id as SyncEventCalendarId]);

    expect(result.complete).toBe(false);
    expect(result.bookable).toBe(false);
    expect(result.issues).toEqual([
      { calendarId: ghost._id, reason: "notImported" },
    ]);
  });

  it("includes Compass-local busy at generation 0 without a sync resource", async () => {
    const localCalendarId = objectId() as SyncEventCalendarId;
    await storage
      .db()
      .collection(SYNC_COLLECTIONS.eventOccurrences)
      .insertOne({
        _id: objectId(),
        tenantId,
        principalId,
        eventId: objectId(),
        occurrenceKey: `${localCalendarId}:local`,
        calendarId: localCalendarId,
        generation: 0,
        startAt: new Date("2026-07-14T10:00:00.000Z"),
        endAt: new Date("2026-07-14T10:30:00.000Z"),
        busy: true,
        cancelled: false,
      });

    const result = await run([localCalendarId], [localCalendarId]);

    expect(result.complete).toBe(true);
    expect(result.bookable).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.connections).toEqual([]);
    expect(
      result.intervals.map((i) => [i.start.toISOString(), i.end.toISOString()]),
    ).toEqual([["2026-07-14T10:00:00.000Z", "2026-07-14T10:30:00.000Z"]]);
  });

  it("treats a Compass-local calendar with no occurrences as empty busy", async () => {
    const localCalendarId = objectId() as SyncEventCalendarId;

    const result = await run([localCalendarId], [localCalendarId]);

    expect(result.complete).toBe(true);
    expect(result.bookable).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.intervals).toEqual([]);
  });

  it("fails closed for a missing resource that is not allowlisted as unbacked", async () => {
    const unknown = objectId() as SyncEventCalendarId;

    const result = await run([unknown]);

    expect(result.complete).toBe(false);
    expect(result.bookable).toBe(false);
    expect(result.issues).toEqual([
      { calendarId: unknown, reason: "notImported" },
    ]);
  });

  it("flags a never-synced calendar", async () => {
    const conn = await seedConnection("importing", null);
    const cal = await seedCalendar({ connectionId: conn, lastSuccessAt: null });

    const result = await run([cal]);

    expect(result.issues).toEqual([{ calendarId: cal, reason: "neverSynced" }]);
    expect(result.complete).toBe(false);
    expect(result.bookable).toBe(false);
  });

  it("returns a stale calendar's intervals but flags it stale and not bookable", async () => {
    const conn = await seedConnection("healthy", old);
    const cal = await seedCalendar({
      connectionId: conn,
      lastSuccessAt: old,
      intervals: [["2026-07-14T13:00Z", "2026-07-14T14:00Z"]],
    });

    const result = await run([cal]);

    // The busy data is still returned...
    expect(
      result.intervals.map((i) => [i.start.toISOString(), i.end.toISOString()]),
    ).toEqual([["2026-07-14T13:00:00.000Z", "2026-07-14T14:00:00.000Z"]]);
    // ...but its staleness is disclosed and it is not bookable.
    expect(result.issues).toEqual([{ calendarId: cal, reason: "stale" }]);
    expect(result.complete).toBe(false);
    expect(result.bookable).toBe(false);
  });

  it("a resource under an active cursor-expiry hold-off is not stale", async () => {
    const conn = await seedConnection("healthy", threeHoursAgo);
    const holdOffUntil = new Date(NOW.getTime() + 60 * 60_000);
    const cal = await seedCalendar({
      connectionId: conn,
      lastSuccessAt: threeHoursAgo,
      cursorExpiredBackoffUntil: holdOffUntil,
      intervals: [["2026-07-14T13:00Z", "2026-07-14T14:00Z"]],
    });

    const result = await computeBusyAvailability(
      { occurrences, resources, connections, calendars },
      {
        tenantId,
        principalId,
        calendarIds: [cal],
        start: WINDOW_START,
        end: WINDOW_END,
        maxAgeMs: bookingMaxAgeMs,
        now: NOW,
      },
    );

    expect(result.complete).toBe(true);
    expect(result.bookable).toBe(true);
    expect(result.issues).toEqual([]);
    expect(
      result.intervals.map((i) => [i.start.toISOString(), i.end.toISOString()]),
    ).toEqual([["2026-07-14T13:00:00.000Z", "2026-07-14T14:00:00.000Z"]]);
  });

  it("a hold-off that expired more than the grace ago is stale again", async () => {
    const conn = await seedConnection("healthy", threeHoursAgo);
    const expiredHoldOff = new Date(NOW.getTime() - 20 * 60_000);
    const cal = await seedCalendar({
      connectionId: conn,
      lastSuccessAt: threeHoursAgo,
      cursorExpiredBackoffUntil: expiredHoldOff,
      intervals: [["2026-07-14T13:00Z", "2026-07-14T14:00Z"]],
    });

    const result = await computeBusyAvailability(
      { occurrences, resources, connections, calendars },
      {
        tenantId,
        principalId,
        calendarIds: [cal],
        start: WINDOW_START,
        end: WINDOW_END,
        maxAgeMs: bookingMaxAgeMs,
        now: NOW,
      },
    );

    expect(result.issues).toEqual([{ calendarId: cal, reason: "stale" }]);
    expect(result.complete).toBe(false);
    expect(result.bookable).toBe(false);
  });

  it("is complete but not bookable when a backing connection is not healthy", async () => {
    const conn = await seedConnection("importing", fresh);
    const cal = await seedCalendar({
      connectionId: conn,
      lastSuccessAt: fresh,
      intervals: [["2026-07-14T09:00Z", "2026-07-14T10:00Z"]],
    });

    const result = await run([cal]);

    expect(result.complete).toBe(true); // fresh data
    expect(result.bookable).toBe(false); // connection not healthy
    expect(result.connections[0]?.state).toBe("importing");
  });

  it("fails closed when a resource references a missing connection record", async () => {
    // A fresh, fully-imported calendar whose connection row is gone (e.g. hard
    // deleted) leaves an orphaned resource. bookable must NOT be true — we cannot
    // verify the connection's health, so booking would risk a double-book.
    const ghostConnection = objectId() as ConnectionId; // never seeded
    const cal = await seedCalendar({
      connectionId: ghostConnection,
      lastSuccessAt: fresh,
      intervals: [["2026-07-14T09:00Z", "2026-07-14T10:00Z"]],
    });

    const result = await run([cal]);

    expect(result.complete).toBe(true); // the data itself is fresh
    expect(result.bookable).toBe(false); // but the connection cannot be verified
    expect(result.connections).toEqual([]); // no record to report freshness for
  });

  it("still fail-closes on incomplete freshness when excludeEventIds is set", async () => {
    const conn = await seedConnection("healthy", old);
    const cal = await seedCalendar({
      connectionId: conn,
      lastSuccessAt: old,
      intervals: [["2026-07-14T13:00Z", "2026-07-14T14:00Z"]],
    });

    const result = await run([cal], undefined, [objectId() as EventId]);

    expect(result.issues).toEqual([{ calendarId: cal, reason: "stale" }]);
    expect(result.complete).toBe(false);
    expect(result.bookable).toBe(false);
    expect(
      result.intervals.map((i) => [i.start.toISOString(), i.end.toISOString()]),
    ).toEqual([["2026-07-14T13:00:00.000Z", "2026-07-14T14:00:00.000Z"]]);
  });
});
