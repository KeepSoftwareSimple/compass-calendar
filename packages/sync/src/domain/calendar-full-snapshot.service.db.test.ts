import { type ProviderEventId } from "@core/types/sync/identity.contracts";
import {
  FakeReader,
  pageOf as page,
  seedProviderCalendar,
  singleEvent as single,
  TIMED_SCHEDULE,
  fakeTokenSource as tokenSource,
} from "@sync/__tests__/helpers/fixtures";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { probeFullSnapshotUnchanged } from "@sync/domain/calendar-full-snapshot.service";
import { pullCalendarChanges } from "@sync/domain/calendar-pull.service";
import { ProviderEventReadError } from "@sync/providers/provider-event-reader.port";
import { type ProviderCalendarRecord } from "@sync/storage/contracts/provider-calendar.contracts";
import { CommandRepository } from "@sync/storage/repositories/command.repository";
import { EventRepository } from "@sync/storage/repositories/event.repository";
import { EventOccurrenceRepository } from "@sync/storage/repositories/event-occurrence.repository";
import { ProviderCalendarRepository } from "@sync/storage/repositories/provider-calendar.repository";
import { ProviderConnectionRepository } from "@sync/storage/repositories/provider-connection.repository";
import { SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";

const now = () => new Date("2026-07-10T00:00:00.000Z");

describe("probeFullSnapshotUnchanged", () => {
  const storage = setupSyncStorage(import.meta.url);
  let events: EventRepository;
  let resources: SyncResourceRepository;
  let calendars: ProviderCalendarRepository;

  beforeEach(() => {
    events = new EventRepository(storage.db());
    resources = new SyncResourceRepository(storage.db());
    calendars = new ProviderCalendarRepository(storage.db());
  });

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

  const deps = (reader: FakeReader) => ({
    events,
    resources,
    reader,
    custody: tokenSource,
  });

  it("matches stored Dates to provider updated strings without milliseconds", async () => {
    const calendar = await seedProviderCalendar(calendars);
    const resource = await seedImported(calendar);
    const storedUpdated = new Date("2026-07-09T18:30:00.000Z");
    await events.upsertByProviderIdentity({
      tenantId: calendar.tenantId,
      principalId: calendar.principalId,
      origin: "provider",
      calendarId: calendar._id,
      clientEventId: null,
      connectionId: calendar.connectionId,
      providerEventId: "holiday" as never,
      providerVersion: "etag-holiday" as never,
      providerUpdatedAt: storedUpdated,
      providerMetadata: null,
      deliveryState: null,
      content: single("holiday").content,
      schedule: TIMED_SCHEDULE,
      recurrence: { kind: "single" },
      lifecycleState: "active",
      generation: resource.activeGeneration,
      confirmedAt: now(),
    });
    const providerRead = {
      ...single("holiday"),
      providerUpdatedAt: "2026-07-09T18:30:00Z",
    };
    const reader = new FakeReader([
      page([providerRead], { nextSyncToken: "cursor-next" }),
    ]);

    const result = await probeFullSnapshotUnchanged(
      deps(reader),
      calendar,
      resource,
    );

    expect(result).toEqual({ unchanged: true, syncCursor: "cursor-next" });
  });

  it("matches when the provider uses an offset equivalent to the stored UTC instant", async () => {
    const calendar = await seedProviderCalendar(calendars);
    const resource = await seedImported(calendar);
    const storedUpdated = new Date("2026-07-09T18:30:00.000Z");
    await events.upsertByProviderIdentity({
      tenantId: calendar.tenantId,
      principalId: calendar.principalId,
      origin: "provider",
      calendarId: calendar._id,
      clientEventId: null,
      connectionId: calendar.connectionId,
      providerEventId: "holiday" as ProviderEventId,
      providerVersion: "etag-holiday" as never,
      providerUpdatedAt: storedUpdated,
      providerMetadata: null,
      deliveryState: null,
      content: single("holiday").content,
      schedule: TIMED_SCHEDULE,
      recurrence: { kind: "single" },
      lifecycleState: "active",
      generation: resource.activeGeneration,
      confirmedAt: now(),
    });
    const providerRead = {
      ...single("holiday"),
      providerUpdatedAt: "2026-07-09T11:30:00-07:00",
    };
    const reader = new FakeReader([
      page([providerRead], { nextSyncToken: "cursor-next" }),
    ]);

    const result = await probeFullSnapshotUnchanged(
      deps(reader),
      calendar,
      resource,
    );

    expect(result).toEqual({ unchanged: true, syncCursor: "cursor-next" });
  });

  it("reports changed when the provider omits a stored event", async () => {
    const calendar = await seedProviderCalendar(calendars);
    const resource = await seedImported(calendar);
    await events.upsertByProviderIdentity({
      tenantId: calendar.tenantId,
      principalId: calendar.principalId,
      origin: "provider",
      calendarId: calendar._id,
      clientEventId: null,
      connectionId: calendar.connectionId,
      providerEventId: "removed" as never,
      providerVersion: "etag-removed" as never,
      providerUpdatedAt: null,
      providerMetadata: null,
      deliveryState: null,
      content: single("removed").content,
      schedule: TIMED_SCHEDULE,
      recurrence: { kind: "single" },
      lifecycleState: "active",
      generation: resource.activeGeneration,
      confirmedAt: now(),
    });
    const reader = new FakeReader([page([], { nextSyncToken: "cursor-next" })]);

    const result = await probeFullSnapshotUnchanged(
      deps(reader),
      calendar,
      resource,
    );

    expect(result).toEqual({ unchanged: false });
  });
});

describe("token-unsupported pull lastFullSnapshotAt", () => {
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

  it("does not stamp lastFullSnapshotAt when repair does not complete", async () => {
    const calendar = await seedProviderCalendar(calendars);
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
    await resources.markSyncTokenUnsupported(
      resource.tenantId,
      resource.principalId,
      resource._id,
      now(),
    );
    const changedPage = page([single("fresh")], {
      nextSyncToken: "cursor-next",
      skipped: 1,
    });
    const reader = Object.assign(new FakeReader([changedPage, changedPage]), {
      fullSnapshotOnly: true,
    });

    await expect(
      pullCalendarChanges(
        {
          events,
          occurrences,
          resources,
          commands: new CommandRepository(storage.db()),
          connections: new ProviderConnectionRepository(storage.db()),
          reader,
          custody: tokenSource,
        },
        calendar,
        now,
      ),
    ).rejects.toBeInstanceOf(ProviderEventReadError);

    const stored = await resources.findById(
      calendar.tenantId,
      calendar.principalId,
      resource._id,
    );
    expect(stored?.lastFullSnapshotAt).toBeNull();
  });
});
