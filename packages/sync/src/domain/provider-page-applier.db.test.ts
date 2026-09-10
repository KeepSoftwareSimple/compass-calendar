import { type DateTime, type TimeZone } from "@core/types/domain-primitives";
import { type ProviderEventId } from "@core/types/sync/identity.contracts";
import { seedProviderCalendar } from "@sync/__tests__/helpers/fixtures";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { ProviderPageApplier } from "@sync/domain/provider-page-applier";
import {
  type ProviderEvent,
  type ProviderEventCancellation,
} from "@sync/providers/provider-event.port";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import { type ProviderCalendarRecord } from "@sync/storage/contracts/provider-calendar.contracts";
import { EventRepository } from "@sync/storage/repositories/event.repository";
import { EventOccurrenceRepository } from "@sync/storage/repositories/event-occurrence.repository";
import { ProviderCalendarRepository } from "@sync/storage/repositories/provider-calendar.repository";

// The applier's happy-path content behavior (upsert, link, project, series
// ordering, dedup) is exercised end to end by calendar-import.service.test.ts,
// which drives it. These tests pin the one thing the import path does NOT
// exercise: the standalone-cancellation seam applyPage exposes for the pull
// path's deletion policy.

const now = () => new Date("2026-07-10T00:00:00.000Z");

const schedule = {
  kind: "timed" as const,
  start: "2026-07-14T09:00:00-06:00" as DateTime,
  end: "2026-07-14T10:00:00-06:00" as DateTime,
  timeZone: "America/Denver" as TimeZone,
};
const content = (title: string) => ({
  title,
  description: "",
  location: null,
  organizer: null,
  attendees: [],
  conference: null,
});
const single = (id: string): ProviderEvent => ({
  kind: "event",
  providerEventId: id as ProviderEventId,
  providerVersion: `etag-${id}`,
  providerUpdatedAt: null,
  content: content(id),
  schedule,
  busy: true,
  recurrence: { kind: "single" },
});
const master = (id: string): ProviderEvent => ({
  ...single(id),
  recurrence: { kind: "seriesMaster", rules: ["RRULE:FREQ=WEEKLY;COUNT=3"] },
});
const standaloneCancellation = (id: string): ProviderEventCancellation => ({
  kind: "cancellation",
  providerEventId: id as ProviderEventId,
  providerVersion: `etag-${id}`,
  series: null,
});
const seriesCancellation = (
  id: string,
  seriesProviderId: string,
  recurrenceId: string,
): ProviderEventCancellation => ({
  kind: "cancellation",
  providerEventId: id as ProviderEventId,
  providerVersion: `etag-${id}`,
  series: { seriesProviderId, recurrenceId },
});

describe("ProviderPageApplier", () => {
  const storage = setupSyncStorage(import.meta.url);
  let events: EventRepository;
  let occurrences: EventOccurrenceRepository;
  let calendars: ProviderCalendarRepository;

  beforeEach(() => {
    events = new EventRepository(storage.db());
    occurrences = new EventOccurrenceRepository(storage.db(), storage.client());
    calendars = new ProviderCalendarRepository(storage.db());
  });

  const seedCalendar = (): Promise<ProviderCalendarRecord> =>
    seedProviderCalendar(calendars);

  const applier = (calendar: ProviderCalendarRecord) =>
    new ProviderPageApplier(events, occurrences, calendar, 0, now);

  it("stores transparency and iCalUID in providerMetadata, null when neither applies", async () => {
    const calendar = await seedCalendar();
    const run = applier(calendar);

    await run.applyPage([
      { ...single("plain") },
      { ...single("correlated"), icalUid: "correlated@google.com" },
      { ...single("free-correlated"), busy: false, icalUid: "free@google.com" },
    ]);

    const byId = (providerEventId: string) =>
      events.findByProviderIdentity(calendar.tenantId, calendar.principalId, {
        connectionId: calendar.connectionId,
        calendarId: calendar._id,
        providerEventId: providerEventId as ProviderEventId,
      });

    // Busy with no correlation key is the overwhelming default: no bag at all.
    expect((await byId("plain"))?.providerMetadata).toBeNull();
    expect((await byId("correlated"))?.providerMetadata).toEqual({
      iCalUID: "correlated@google.com",
    });
    // Both facts coexist in one bag rather than one overwriting the other.
    expect((await byId("free-correlated"))?.providerMetadata).toEqual({
      transparency: "transparent",
      iCalUID: "free@google.com",
    });
  });

  it("stores providerManaged in providerMetadata when the read is managed", async () => {
    const calendar = await seedCalendar();
    const run = applier(calendar);

    await run.applyPage([
      { ...single("managed"), providerManaged: true },
      { ...single("normal") },
    ]);

    const byId = (providerEventId: string) =>
      events.findByProviderIdentity(calendar.tenantId, calendar.principalId, {
        connectionId: calendar.connectionId,
        calendarId: calendar._id,
        providerEventId: providerEventId as ProviderEventId,
      });

    expect((await byId("managed"))?.providerMetadata).toEqual({
      providerManaged: "true",
    });
    expect((await byId("normal"))?.providerMetadata).toBeNull();
  });

  it("projects transparent imports as non-busy while opaque siblings occupy listBusyOverlapping", async () => {
    const calendar = await seedCalendar();
    const run = applier(calendar);

    await run.applyPage([
      { ...single("opaque"), providerEventId: "opaque" as ProviderEventId },
      {
        ...single("transparent"),
        providerEventId: "transparent" as ProviderEventId,
        busy: false,
      },
    ]);

    const windowStart = new Date("2026-07-14T15:00:00.000Z");
    const windowEnd = new Date("2026-07-14T17:00:00.000Z");
    const busy = await occurrences.listBusyOverlapping({
      tenantId: calendar.tenantId,
      principalId: calendar.principalId,
      calendars: [{ calendarId: calendar._id, generation: 0 }],
      start: windowStart,
      end: windowEnd,
    });

    expect(busy).toEqual([
      {
        startAt: new Date("2026-07-14T15:00:00.000Z"),
        endAt: new Date("2026-07-14T16:00:00.000Z"),
        eventId: expect.any(String),
      },
    ]);
  });

  it("reprojects occurrence busy when a transparent import becomes opaque on pull", async () => {
    const calendar = await seedCalendar();
    const run = applier(calendar);
    const window = {
      start: new Date("2026-07-14T15:00:00.000Z"),
      end: new Date("2026-07-14T17:00:00.000Z"),
    };
    const queryBusy = () =>
      occurrences.listBusyOverlapping({
        tenantId: calendar.tenantId,
        principalId: calendar.principalId,
        calendars: [{ calendarId: calendar._id, generation: 0 }],
        ...window,
      });

    await run.applyPage([{ ...single("flex"), busy: false }]);
    expect(await queryBusy()).toEqual([]);

    await run.applyPage([{ ...single("flex"), busy: true }]);
    expect(await queryBusy()).toEqual([
      {
        startAt: new Date("2026-07-14T15:00:00.000Z"),
        endAt: new Date("2026-07-14T16:00:00.000Z"),
        eventId: expect.any(String),
      },
    ]);
  });

  it("preserves an existing iCalUID when a later sparse read omits it", async () => {
    const calendar = await seedCalendar();
    const byId = (providerEventId: string) =>
      events.findByProviderIdentity(calendar.tenantId, calendar.principalId, {
        connectionId: calendar.connectionId,
        calendarId: calendar._id,
        providerEventId: providerEventId as ProviderEventId,
      });

    await applier(calendar).applyPage([
      { ...single("kept"), icalUid: "kept@google.com" },
    ]);
    expect((await byId("kept"))?.providerMetadata).toEqual({
      iCalUID: "kept@google.com",
    });

    // Same provider identity, no icalUid on the read — must not wipe the key.
    await applier(calendar).applyPage([single("kept")]);
    expect((await byId("kept"))?.providerMetadata).toEqual({
      iCalUID: "kept@google.com",
    });
  });

  it("updates transparency from a sparse read without dropping iCalUID", async () => {
    const calendar = await seedCalendar();
    const byId = (providerEventId: string) =>
      events.findByProviderIdentity(calendar.tenantId, calendar.principalId, {
        connectionId: calendar.connectionId,
        calendarId: calendar._id,
        providerEventId: providerEventId as ProviderEventId,
      });

    await applier(calendar).applyPage([
      { ...single("flex"), icalUid: "flex@google.com" },
    ]);
    await applier(calendar).applyPage([{ ...single("flex"), busy: false }]);

    expect((await byId("flex"))?.providerMetadata).toEqual({
      transparency: "transparent",
      iCalUID: "flex@google.com",
    });
  });

  it("lets an incoming iCalUID replace a previously stored one", async () => {
    const calendar = await seedCalendar();
    const byId = (providerEventId: string) =>
      events.findByProviderIdentity(calendar.tenantId, calendar.principalId, {
        connectionId: calendar.connectionId,
        calendarId: calendar._id,
        providerEventId: providerEventId as ProviderEventId,
      });

    await applier(calendar).applyPage([
      { ...single("swap"), icalUid: "old@google.com" },
    ]);
    await applier(calendar).applyPage([
      { ...single("swap"), icalUid: "new@google.com" },
    ]);

    expect((await byId("swap"))?.providerMetadata).toEqual({
      iCalUID: "new@google.com",
    });
  });

  it("still clears providerMetadata on a cancelled series exception", async () => {
    const calendar = await seedCalendar();
    const run = applier(calendar);

    await run.applyPage([
      { ...master("m"), icalUid: "series@google.com" },
      seriesCancellation("m_c", "m", "2026-07-21T09:00:00-06:00"),
    ]);

    const cancelled = await events.findByProviderIdentity(
      calendar.tenantId,
      calendar.principalId,
      {
        connectionId: calendar.connectionId,
        calendarId: calendar._id,
        providerEventId: "m_c" as ProviderEventId,
      },
    );
    expect(cancelled?.providerMetadata).toBeNull();
    expect(cancelled?.recurrence).toMatchObject({
      kind: "exception",
      cancelled: true,
    });
  });

  it("returns standalone cancellations unconsumed and writes nothing for them", async () => {
    const calendar = await seedCalendar();
    const run = applier(calendar);

    const returned = await run.applyPage([
      single("a"),
      standaloneCancellation("gone"),
    ]);

    expect(returned.map((c) => c.providerEventId)).toEqual(["gone"]);
    // The live event was written; the cancellation left no record.
    expect(run.importedCount).toBe(1);
    expect(
      await events.findByProviderIdentity(
        calendar.tenantId,
        calendar.principalId,
        {
          connectionId: calendar.connectionId,
          calendarId: calendar._id,
          providerEventId: "gone" as ProviderEventId,
        },
      ),
    ).toBeNull();
  });

  it("consumes a series cancellation as a tombstone rather than returning it", async () => {
    const calendar = await seedCalendar();
    const run = applier(calendar);

    const returned = await run.applyPage([
      master("m"),
      seriesCancellation("m_c", "m", "2026-07-21T09:00:00-06:00"),
    ]);

    // Not returned — it was consumed as a cancelled exception.
    expect(returned).toHaveLength(0);
    // master + cancelled exception written.
    expect(run.importedCount).toBe(2);
    const occ = await storage
      .db()
      .collection(SYNC_COLLECTIONS.eventOccurrences)
      .countDocuments({ calendarId: calendar._id });
    // 3 series occurrences minus the excepted instant, plus the cancelled row.
    expect(occ).toBe(3);
  });

  it("reports members that never found a master as orphans on finish", async () => {
    const calendar = await seedCalendar();
    const run = applier(calendar);

    const returned = await run.applyPage([
      seriesCancellation("orphan_c", "ghost", "2026-07-21T09:00:00-06:00"),
    ]);
    expect(returned.map((c) => c.providerEventId)).toEqual(["orphan_c"]);

    const { orphans, leftoverCancellations } = await run.finish();

    expect(orphans).toBe(1);
    expect(leftoverCancellations.map((c) => c.providerEventId)).toEqual([
      "orphan_c",
    ]);
    expect(run.importedCount).toBe(0);
  });

  it("writes every event's occurrences for a page larger than one projection batch", async () => {
    // PROJECTION_BATCH_SIZE is 200 — a page bigger than that must still
    // project every event correctly, chunked across multiple transactions
    // rather than dropping/duplicating anything at the boundary.
    const calendar = await seedCalendar();
    const run = applier(calendar);
    const ids = Array.from({ length: 250 }, (_, i) => `bulk-${i}`);

    await run.applyPage(ids.map((id) => single(id)));

    expect(run.importedCount).toBe(250);
    const occCount = await storage
      .db()
      .collection(SYNC_COLLECTIONS.eventOccurrences)
      .countDocuments({ calendarId: calendar._id });
    // One single-occurrence event each.
    expect(occCount).toBe(250);
  });

  it("keeps customizations when a pull changes the provider schedule", async () => {
    const calendar = await seedCalendar();
    const run = applier(calendar);
    const providerEventId = "managed-schedule" as ProviderEventId;

    await run.applyPage([
      { ...single(providerEventId), providerManaged: true },
    ]);
    const existing = await events.findByProviderIdentity(
      calendar.tenantId,
      calendar.principalId,
      {
        connectionId: calendar.connectionId,
        calendarId: calendar._id,
        providerEventId: providerEventId as ProviderEventId,
      },
    );
    if (!existing) throw new Error("seed failed");
    await events.replaceExisting({
      ...existing,
      customizations: { title: "My overlay" },
    });

    const movedSchedule = {
      kind: "timed" as const,
      start: "2026-07-14T10:00:00-06:00" as DateTime,
      end: "2026-07-14T11:00:00-06:00" as DateTime,
      timeZone: "America/Denver" as TimeZone,
    };
    await run.applyPage([
      {
        ...single(providerEventId),
        providerManaged: true,
        schedule: movedSchedule,
        providerVersion: "etag-moved",
      },
    ]);

    const updated = await events.findByProviderIdentity(
      calendar.tenantId,
      calendar.principalId,
      {
        connectionId: calendar.connectionId,
        calendarId: calendar._id,
        providerEventId: providerEventId as ProviderEventId,
      },
    );
    expect(updated?.schedule).toEqual(movedSchedule);
    expect(updated?.customizations).toEqual({ title: "My overlay" });
  });
});
