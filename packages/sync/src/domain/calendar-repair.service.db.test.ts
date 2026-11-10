import { faker } from "@faker-js/faker";
import { IdempotencyKeySchema } from "@core/types/sync/identity.contracts";
import {
  FakeReader,
  pageOf as page,
  TIMED_SCHEDULE as schedule,
  seedProviderCalendar,
  singleEvent as single,
  fakeTokenSource as tokenSource,
} from "@sync/__tests__/helpers/fixtures";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { pullCalendarChanges } from "@sync/domain/calendar-pull.service";
import {
  type CalendarRepairDeps,
  repairCalendar,
} from "@sync/domain/calendar-repair.service";
import { ProviderEventReadError } from "@sync/providers/provider-event-reader.port";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";
import { type ProviderCalendarRecord } from "@sync/storage/contracts/provider-calendar.contracts";
import { CommandRepository } from "@sync/storage/repositories/command.repository";
import { EventRepository } from "@sync/storage/repositories/event.repository";
import { EventOccurrenceRepository } from "@sync/storage/repositories/event-occurrence.repository";
import { ProviderCalendarRepository } from "@sync/storage/repositories/provider-calendar.repository";
import { SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";

const objectId = () => faker.database.mongodbObjectId();
const now = () => new Date("2026-07-10T00:00:00.000Z");

const content = (title: string) => ({
  title,
  description: "",
  location: null,
  organizer: null,
  attendees: [],
  conference: null,
});
describe("repairCalendar", () => {
  const storage = setupSyncStorage(import.meta.url);
  let events: EventRepository;
  let occurrences: EventOccurrenceRepository;
  let resources: SyncResourceRepository;
  let calendars: ProviderCalendarRepository;

  beforeEach(() => {
    events = new EventRepository(storage.db());
    occurrences = new EventOccurrenceRepository(storage.db(), storage.client());
    resources = new SyncResourceRepository(storage.db());
    calendars = new ProviderCalendarRepository(storage.db());
  });

  const deps = (reader: FakeReader): CalendarRepairDeps => ({
    events,
    occurrences,
    resources,
    reader,
    custody: tokenSource,
  });

  const seedCalendar = (
    eventLabels: ProviderCalendarRecord["eventLabels"] = [],
  ): Promise<ProviderCalendarRecord> =>
    seedProviderCalendar(calendars, { eventLabels });

  const seedImported = async (calendar: ProviderCalendarRecord) => {
    const resource = await resources.ensure({
      tenantId: calendar.tenantId,
      principalId: calendar.principalId,
      connectionId: calendar.connectionId,
      resourceKind: "events",
      calendarId: calendar._id,
    });
    await resources.advanceCursor(
      calendar.tenantId,
      calendar.principalId,
      resource._id,
      "cursor-0",
      now(),
    );
    return resource;
  };

  // Seed an event and one occurrence at the given generation, as a prior
  // import/pull would have left them.
  const seedEvent = async (
    calendar: ProviderCalendarRecord,
    providerEventId: string | null,
    generation: number,
  ): Promise<EventRecord> => {
    const record = providerEventId
      ? await events.upsertByProviderIdentity({
          tenantId: calendar.tenantId,
          principalId: calendar.principalId,
          origin: "provider",
          calendarId: calendar._id,
          clientEventId: null,
          connectionId: calendar.connectionId,
          providerEventId: providerEventId as never,
          providerVersion: `etag-${providerEventId}` as never,
          providerUpdatedAt: null,
          deliveryState: null,
          providerMetadata: null,
          content: content(providerEventId),
          schedule,
          recurrence: { kind: "single" },
          lifecycleState: "active",
          generation,
          confirmedAt: now(),
        })
      : await events.put({
          _id: objectId() as EventRecord["_id"],
          tenantId: calendar.tenantId,
          principalId: calendar.principalId,
          origin: "compass",
          calendarId: calendar._id,
          clientEventId: null,
          connectionId: calendar.connectionId,
          providerEventId: null,
          providerVersion: null,
          providerUpdatedAt: null,
          deliveryState: null,
          providerMetadata: null,
          content: content("local"),
          schedule,
          recurrence: { kind: "single" },
          lifecycleState: "active",
          generation,
          createdAt: now(),
          updatedAt: now(),
          confirmedAt: now(),
        } as EventRecord);
    await occurrences.replaceForEvent(record._id, generation, [
      {
        tenantId: calendar.tenantId,
        principalId: calendar.principalId,
        eventId: record._id,
        occurrenceKey: `${record._id}:0`,
        calendarId: calendar._id,
        schedule,
        startAt: new Date("2026-07-14T15:00:00.000Z"),
        endAt: new Date("2026-07-14T16:00:00.000Z"),
        busy: true,
        title: providerEventId ?? "local",
        cancelled: false,
        generation,
      } as never,
    ]);
    return record;
  };

  const occAtGeneration = (calendarId: string, generation: number) =>
    storage
      .db()
      .collection(SYNC_COLLECTIONS.eventOccurrences)
      .countDocuments({ calendarId, generation });

  const eventCountAt = (calendarId: string, generation: number) =>
    storage
      .db()
      .collection(SYNC_COLLECTIONS.events)
      .countDocuments({ calendarId, generation });

  it("fullSnapshotOnly pull still repairs through one provider pass like main", async () => {
    const calendar = await seedCalendar();
    const resource = await seedImported(calendar);
    await seedEvent(calendar, "ms-event", resource.activeGeneration);
    const reader = Object.assign(
      new FakeReader([
        page([single("ms-event")], { nextSyncToken: "ms:delta" }),
      ]),
      { fullSnapshotOnly: true, supportsFullHistory: true },
    );

    const result = await pullCalendarChanges(deps(reader), calendar, now);

    expect(result.status).toBe("applied");
    if (result.status !== "applied") throw new Error("expected applied");
    expect(reader.calls).toHaveLength(1);
    expect(reader.calls[0]?.cursor).toBeUndefined();
    expect(result.resource.activeGeneration).toBeGreaterThan(
      resource.activeGeneration,
    );
    expect(result.resource.syncCursor).toBe("ms:delta");
    expect(
      await events.findByProviderIdentity(
        calendar.tenantId,
        calendar.principalId,
        {
          connectionId: calendar.connectionId,
          calendarId: calendar._id,
          providerEventId: "ms-event",
        },
      ),
    ).toMatchObject({ generation: result.resource.activeGeneration });
  });

  it("token-unsupported pull runs full repair without the stored cursor", async () => {
    const calendar = await seedCalendar();
    const resource = await seedImported(calendar);
    await seedEvent(calendar, "holiday", resource.activeGeneration);
    await resources.markSyncTokenUnsupported(
      resource.tenantId,
      resource.principalId,
      resource._id,
      now(),
    );
    const reader = new FakeReader([
      page([single("holiday")], { nextSyncToken: "holiday:cursor" }),
    ]);

    const result = await pullCalendarChanges(deps(reader), calendar, now);

    expect(result.status).toBe("applied");
    if (result.status !== "applied") throw new Error("expected applied");
    expect(reader.calls).toHaveLength(1);
    expect(reader.calls[0]?.cursor).toBeUndefined();
    expect(result.resource.activeGeneration).toBeGreaterThan(
      resource.activeGeneration,
    );
    expect(result.resource.syncTokenUnsupportedAt).toEqual(now());
  });

  it("rebuilds into a new generation, activates it, and clears the old one", async () => {
    const calendar = await seedCalendar();
    await seedImported(calendar);
    await seedEvent(calendar, "keep", 0);
    await seedEvent(calendar, "stale", 0);
    expect(await occAtGeneration(calendar._id, 0)).toBe(2);

    // The provider still has "keep" but not "stale".
    const reader = new FakeReader([
      page([single("keep")], { nextSyncToken: "cursor-1" }),
    ]);
    const result = await repairCalendar(deps(reader), calendar, now);

    expect(result.status).toBe("repaired");
    if (result.status !== "repaired") throw new Error("unreachable");
    expect(result.generation).toBe(1);
    expect(result.resource.activeGeneration).toBe(1);
    expect(result.resource.syncCursor).toBe("cursor-1");
    // The old generation's occurrences are gone; the new one holds "keep".
    expect(await occAtGeneration(calendar._id, 0)).toBe(0);
    expect(await occAtGeneration(calendar._id, 1)).toBe(1);
    // "stale" (absent at the provider) is removed; "keep" moved to generation 1.
    expect(await eventCountAt(calendar._id, 0)).toBe(0);
    expect(await eventCountAt(calendar._id, 1)).toBe(1);
  });

  it("refreshes snapshot-only history, deletes absent events, and preserves pending local intent", async () => {
    const calendar = await seedCalendar();
    await seedImported(calendar);
    const pending = await seedEvent(calendar, "pending", 0);
    const removed = await seedEvent(calendar, "removed", 0);
    const commands = new CommandRepository(storage.db());
    await commands.submit({
      tenantId: calendar.tenantId,
      principalId: calendar.principalId,
      idempotencyKey: IdempotencyKeySchema.parse("snapshot-pending"),
      eventId: pending._id,
      input: {
        kind: "delete",
        invitation: "none",
        scope: "all",
        recurrenceId: null,
      },
      expectedVersion: null,
    });
    const reader = Object.assign(
      new FakeReader([
        page([single("new")], { nextSyncToken: "full-snapshot:v1" }),
      ]),
      { fullSnapshotOnly: true, supportsFullHistory: true },
    );
    const result = await pullCalendarChanges(
      { ...deps(reader), commands },
      calendar,
      now,
    );
    expect(result.status).toBe("applied");
    if (result.status !== "applied") throw new Error("expected applied");
    expect(result.deleted).toBe(1);
    expect(result.resource.historyCoverageVersion).toBe(1);
    expect(
      await events.findById(
        calendar.tenantId,
        calendar.principalId,
        removed._id,
      ),
    ).toBeNull();
    const preserved = await events.findById(
      calendar.tenantId,
      calendar.principalId,
      pending._id,
    );
    expect(preserved?.generation).toBe(result.resource.activeGeneration);
    expect(
      await storage
        .db()
        .collection(SYNC_COLLECTIONS.eventOccurrences)
        .countDocuments({
          eventId: pending._id,
          generation: result.resource.activeGeneration,
        }),
    ).toBeGreaterThan(0);
    expect(reader.calls[0]?.cursor).toBeUndefined();
  });

  it("incremental snapshot pull reads events with a legacy empty providerVersion", async () => {
    const calendar = await seedCalendar();
    await seedImported(calendar);
    const legacyId = objectId() as EventRecord["_id"];
    await storage
      .db()
      .collection(SYNC_COLLECTIONS.events)
      .insertOne({
        _id: legacyId,
        tenantId: calendar.tenantId,
        principalId: calendar.principalId,
        origin: "provider",
        calendarId: calendar._id,
        clientEventId: null,
        connectionId: calendar.connectionId,
        providerEventId: "legacy-empty-version",
        providerVersion: "",
        providerUpdatedAt: null,
        deliveryState: null,
        providerMetadata: null,
        content: content("legacy-empty-version"),
        schedule,
        recurrence: { kind: "single" },
        lifecycleState: "active",
        generation: 0,
        createdAt: now(),
        updatedAt: now(),
        confirmedAt: now(),
      });
    await occurrences.replaceForEvent(legacyId, 0, [
      {
        tenantId: calendar.tenantId,
        principalId: calendar.principalId,
        eventId: legacyId,
        occurrenceKey: `${legacyId}:0`,
        calendarId: calendar._id,
        schedule,
        startAt: new Date("2026-07-14T15:00:00.000Z"),
        endAt: new Date("2026-07-14T16:00:00.000Z"),
        busy: true,
        title: "legacy-empty-version",
        cancelled: false,
        generation: 0,
      } as never,
    ]);
    const reader = Object.assign(
      new FakeReader([
        page([single("fresh")], { nextSyncToken: "full-snapshot:v2" }),
      ]),
      { fullSnapshotOnly: true, supportsFullHistory: true },
    );

    const result = await pullCalendarChanges(deps(reader), calendar, now);

    expect(result.status).toBe("applied");
    if (result.status !== "applied") throw new Error("expected applied");
    expect(
      await events.findById(calendar.tenantId, calendar.principalId, legacyId),
    ).toBeNull();
  });

  it("retains the certified archive while a routine replacement is being read", async () => {
    const calendar = await seedCalendar();
    const resource = await seedImported(calendar);
    const old = await seedEvent(calendar, "keep", 0);
    await resources.setBootstrapState(
      calendar.tenantId,
      calendar.principalId,
      resource._id,
      "ready",
    );
    await resources.recordHistoryCoverage(resource, 0, true, now());
    const reader = Object.assign(
      new FakeReader([
        page([single("keep")], { nextSyncToken: "replacement" }),
      ]),
      { fullSnapshotOnly: true, supportsFullHistory: true },
    );
    const list = reader.listEventPage.bind(reader);
    let observed = false;
    reader.listEventPage = async (input) => {
      const during = await resources.findById(
        calendar.tenantId,
        calendar.principalId,
        resource._id,
      );
      expect(during?.historyCoverageVersion).toBe(1);
      expect(during?.historySkipped).toBe(0);
      expect(during?.activeGeneration).toBe(0);
      expect(during?.importGeneration).toBeGreaterThan(0);
      expect(
        await events.findById(calendar.tenantId, calendar.principalId, old._id),
      ).not.toBeNull();
      observed = true;
      return list(input);
    };
    const result = await repairCalendar(deps(reader), calendar, now);
    expect(observed).toBe(true);
    expect(result.status).toBe("repaired");
    expect(result.resource.historyCoverageVersion).toBe(1);
  });

  it("retains a prior certificate when a refresh fails before replacing the archive", async () => {
    const calendar = await seedCalendar();
    const resource = await seedImported(calendar);
    const old = await seedEvent(calendar, "keep", 0);
    await resources.recordHistoryCoverage(resource, 0, true, now());
    const reader = Object.assign(new FakeReader([]), {
      fullSnapshotOnly: true,
      supportsFullHistory: true,
    });
    reader.listEventPage = async () => {
      throw new Error("temporary read failure");
    };
    await expect(repairCalendar(deps(reader), calendar, now)).rejects.toThrow(
      "temporary read failure",
    );
    const stored = await resources.findById(
      calendar.tenantId,
      calendar.principalId,
      resource._id,
    );
    expect(stored?.historyCoverageVersion).toBe(1);
    expect(stored?.activeGeneration).toBe(0);
    expect(
      await events.findById(calendar.tenantId, calendar.principalId, old._id),
    ).not.toBeNull();
  });

  it("does not delete old history when a snapshot skips unusable records", async () => {
    const calendar = await seedCalendar();
    const prior = await seedImported(calendar);
    await resources.recordHistoryCoverage(prior, 0, true, now());
    const old = await seedEvent(calendar, "old", 0);
    const reader = Object.assign(
      new FakeReader([
        page([], { skipped: 1, nextSyncToken: "full-snapshot:v1" }),
      ]),
      { fullSnapshotOnly: true, supportsFullHistory: true },
    );
    const result = await repairCalendar(deps(reader), calendar, now);
    expect(result.status).toBe("incomplete");
    expect(
      await events.findById(calendar.tenantId, calendar.principalId, old._id),
    ).not.toBeNull();
    expect(await occAtGeneration(calendar._id, 0)).toBe(1);
    const stored = await resources.findById(
      calendar.tenantId,
      calendar.principalId,
      result.resource._id,
    );
    expect(stored?.activeGeneration).toBe(0);
    expect(stored?.historyCoverageVersion).toBe(0);
  });

  it("leaves the old generation active and intact when the pass yields no cursor", async () => {
    const calendar = await seedCalendar();
    await seedImported(calendar);
    await seedEvent(calendar, "keep", 0);

    const reader = new FakeReader([page([single("keep")])]); // no nextSyncToken
    const result = await repairCalendar(deps(reader), calendar, now);

    expect(result.status).toBe("incomplete");
    // Reads stay on the old generation; the old data is untouched.
    const resource = await resources.findById(
      calendar.tenantId,
      calendar.principalId,
      result.resource._id,
    );
    expect(resource?.activeGeneration).toBe(0);
    expect(await occAtGeneration(calendar._id, 0)).toBe(1);
  });

  it("preserves a Compass-owned event across a repair", async () => {
    const calendar = await seedCalendar();
    await seedImported(calendar);
    // A local (unlinked) event has no providerEventId, so the provider result
    // can't speak to it; it must survive the stale-event cleanup.
    const local = await seedEvent(calendar, null, 0);

    const reader = new FakeReader([
      page([single("keep")], { nextSyncToken: "cursor-1" }),
    ]);
    await repairCalendar(deps(reader), calendar, now);

    const survived = await events.findById(
      calendar.tenantId,
      calendar.principalId,
      local._id,
    );
    expect(survived).not.toBeNull();
    expect(survived?.generation).toBe(1);
    expect(
      await storage
        .db()
        .collection(SYNC_COLLECTIONS.eventOccurrences)
        .countDocuments({ eventId: local._id, generation: 1 }),
    ).toBe(1);
  });

  it("resumes an in-flight repair generation instead of bumping again", async () => {
    const calendar = await seedCalendar();
    const resource = await seedImported(calendar);
    // Simulate a prior repair that bumped the import generation but crashed
    // before activating (importGeneration 1 ahead of activeGeneration 0).
    await resources.startNewGeneration(
      calendar.tenantId,
      calendar.principalId,
      resource._id,
    );

    const reader = new FakeReader([
      page([single("keep")], { nextSyncToken: "cursor-1" }),
    ]);
    const result = await repairCalendar(deps(reader), calendar, now);

    if (result.status !== "repaired") throw new Error("expected repaired");
    // Reused generation 1, did not bump to 2.
    expect(result.generation).toBe(1);
    expect(result.resource.importGeneration).toBe(1);
  });

  it("resumes after a committed page without losing the skipped-record count", async () => {
    const calendar = await seedCalendar();
    const resource = await seedImported(calendar);
    const interrupted = new FakeReader([
      { ...page([single("first")], { nextPageToken: "page-2" }), skipped: 1 },
    ]);
    await expect(
      repairCalendar(deps(interrupted), calendar, now),
    ).rejects.toThrow("no page scripted");
    const checkpoint = await resources.findById(
      calendar.tenantId,
      calendar.principalId,
      resource._id,
    );
    expect(checkpoint?.repairPageCursor).toBe("page-2");
    expect(checkpoint?.activeGeneration).toBe(0);
    const resumed = Object.assign(
      new FakeReader([page([single("second")], { nextSyncToken: "cursor-1" })]),
      { supportsFullHistory: true },
    );
    const result = await repairCalendar(deps(resumed), calendar, now);
    expect(resumed.calls[0]?.pageToken).toBe("page-2");
    expect(result.status).toBe("repaired");
    if (result.status !== "repaired") throw new Error("expected repaired");
    expect(result.skipped).toBe(1);
    expect(result.resource.historyCoverageVersion).toBe(0);
    expect(result.resource.repairPageCursor).toBeNull();
    expect(await eventCountAt(calendar._id, result.generation)).toBe(2);
  });

  it("replays unresolved members after a crash instead of checkpointing past them", async () => {
    const calendar = await seedCalendar();
    const resource = await seedImported(calendar);
    const member = {
      ...single("override"),
      recurrence: {
        kind: "instance" as const,
        seriesProviderId: "master",
        recurrenceId: "2026-07-14T15:00:00.000Z",
      },
    };
    const interrupted = new FakeReader([
      page([member], { nextPageToken: "master-page" }),
    ]);
    await expect(
      repairCalendar(deps(interrupted), calendar, now),
    ).rejects.toThrow("no page scripted");
    const checkpoint = await resources.findById(
      calendar.tenantId,
      calendar.principalId,
      resource._id,
    );
    expect(checkpoint?.repairPageCursor).toBeNull();
    const resumed = new FakeReader([
      page([member], { nextPageToken: "master-page" }),
      page(
        [
          {
            ...single("master"),
            recurrence: {
              kind: "seriesMaster",
              rules: ["RRULE:FREQ=WEEKLY;COUNT=3"],
            },
          },
        ],
        { nextSyncToken: "cursor-1" },
      ),
    ]);
    const result = await repairCalendar(deps(resumed), calendar, now);
    expect(resumed.calls[0]?.pageToken).toBeNull();
    expect(result.status).toBe("repaired");
    if (result.status !== "repaired") throw new Error("expected repaired");
    expect(result.skipped).toBe(0);
    expect(await eventCountAt(calendar._id, result.generation)).toBe(2);
  });

  it("restarts an expired repair checkpoint while preserving the active history", async () => {
    const calendar = await seedCalendar();
    const resource = await seedImported(calendar);
    await seedEvent(calendar, "active-history", 0);
    await resources.startNewGeneration(
      calendar.tenantId,
      calendar.principalId,
      resource._id,
    );
    await resources.setRepairCheckpoint(resource, "expired-page", 0);
    const reader = new FakeReader(
      [],
      new ProviderEventReadError("cursorExpired", "Page expired"),
    );
    await expect(repairCalendar(deps(reader), calendar, now)).rejects.toThrow(
      "Page expired",
    );
    const updated = await resources.findById(
      calendar.tenantId,
      calendar.principalId,
      resource._id,
    );
    expect(updated?.activeGeneration).toBe(0);
    expect(updated?.repairPageCursor).toBeNull();
    expect(updated?.importGeneration).toBe(2);
    expect(await occAtGeneration(calendar._id, 0)).toBe(1);
  });

  it("converges when run twice (idempotent)", async () => {
    const calendar = await seedCalendar();
    await seedImported(calendar);
    await seedEvent(calendar, "keep", 0);

    const first = new FakeReader([
      page([single("keep")], { nextSyncToken: "cursor-1" }),
    ]);
    await repairCalendar(deps(first), calendar, now);
    // A second repair rebuilds again into a further generation and cleans up.
    const second = new FakeReader([
      page([single("keep")], { nextSyncToken: "cursor-2" }),
    ]);
    const result = await repairCalendar(deps(second), calendar, now);

    if (result.status !== "repaired") throw new Error("expected repaired");
    // Exactly one live event and occurrence remain, at the active generation.
    expect(await eventCountAt(calendar._id, result.generation)).toBe(1);
    expect(await occAtGeneration(calendar._id, result.generation)).toBe(1);
    expect(
      await storage
        .db()
        .collection(SYNC_COLLECTIONS.eventOccurrences)
        .countDocuments({ calendarId: calendar._id }),
    ).toBe(1);
  });

  it("passes the calendar's event-color labels to the reader", async () => {
    // Repair rebuilds the whole calendar via the same reader port import/pull
    // use, so a repaired calendar must resolve custom label colors the same
    // way — this was missing until now, silently dropping colorHex for any
    // calendar that went through a repair rather than a plain pull.
    const calendar = await seedCalendar([{ id: "label-1", hex: "#009688" }]);
    await seedImported(calendar);
    const reader = new FakeReader([
      page([single("keep")], { nextSyncToken: "cursor-1" }),
    ]);

    await repairCalendar(deps(reader), calendar, now);

    expect(reader.calls[0]?.colorLabels).toEqual(
      new Map([["label-1", "#009688"]]),
    );
  });

  it("stamps the attempt even when the token fetch throws", async () => {
    // The reconcile sweep selects least-recently-attempted resources. A
    // doomed connection's repair must rotate to the back of the sweep after
    // failing, not tie at lastAttemptAt: null forever and keep winning slots
    // (2026-07-29 sweep-starvation regression; see the sibling test in
    // calendar-import.service.db.test.ts).
    const calendar = await seedCalendar();
    await seedImported(calendar);
    const reader = new FakeReader([page([])]);
    const deadCustody = {
      getValidAccessToken: async () => {
        throw new Error("token fetch failed");
      },
      discardRevoked: async () => {},
      invalidateAccessToken: async () => {},
    };

    await expect(
      repairCalendar(
        { events, occurrences, resources, reader, custody: deadCustody },
        calendar,
        now,
      ),
    ).rejects.toThrow("token fetch failed");

    const resource = await resources.ensure({
      tenantId: calendar.tenantId,
      principalId: calendar.principalId,
      connectionId: calendar.connectionId,
      resourceKind: "events",
      calendarId: calendar._id,
    });
    expect(resource.lastAttemptAt).toEqual(now());
  });
});
