import { faker } from "@faker-js/faker";
import {
  type DateTime,
  type EventId,
  type TimeZone,
} from "@core/types/domain-primitives";
import {
  type ConnectionId,
  type IdempotencyKey,
  type PrincipalId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import {
  bindCommandRepos,
  COMMAND_NOW,
  FakeProviderEventWriter,
  failingTokenSource,
  newCommandIds,
  providerDeleteDeps,
  seedLinkedEvent,
} from "@sync/__tests__/helpers/command-scenario";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { executeProviderDelete } from "@sync/domain/provider-command.delete";
import { reprojectOccurrences } from "@sync/domain/reproject";
import { ProviderAuthError } from "@sync/providers/provider-auth.port";
import { ProviderWriteError } from "@sync/providers/provider-event-writer.port";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";
import { type ProviderCalendarRecord } from "@sync/storage/contracts/provider-calendar.contracts";
import { type CommandRepository } from "@sync/storage/repositories/command.repository";
import { type DeletionMarkerRepository } from "@sync/storage/repositories/deletion-marker.repository";
import { type EventRepository } from "@sync/storage/repositories/event.repository";
import { type EventOccurrenceRepository } from "@sync/storage/repositories/event-occurrence.repository";
import { type SyncMongoService } from "@sync/storage/sync-mongo.service";
import { beforeEach, describe, expect, it } from "bun:test";

const storage = setupSyncStorage(import.meta.url);
const repos = bindCommandRepos(storage);
const objectId = () => faker.database.mongodbObjectId();
const now = COMMAND_NOW;

let mongo: SyncMongoService;
let commands: CommandRepository;
let events: EventRepository;
let occurrences: EventOccurrenceRepository;
let markers: DeletionMarkerRepository;

beforeEach(() => {
  mongo = repos.mongo;
  commands = repos.commands;
  events = repos.events;
  occurrences = repos.occurrences;
  markers = repos.markers;
});

describe("executeProviderDelete", () => {
  const schedule = {
    kind: "timed" as const,
    start: "2026-07-14T09:00:00-06:00" as DateTime,
    end: "2026-07-14T10:00:00-06:00" as DateTime,
    timeZone: "America/Denver" as TimeZone,
  };

  // Seed a provider-linked event plus a delete command for it.
  const seed = async () => {
    const ids = newCommandIds();
    const calendar: ProviderCalendarRecord = {
      _id: objectId() as never,
      tenantId: ids.tenantId,
      principalId: ids.principalId,
      connectionId: ids.connectionId,
      providerCalendarId: "primary@google.com" as never,
      displayName: "Google",
      color: null,
      active: true,
      primary: true,
      accessRole: "owner",
      capabilities: [],
      createdAt: now(),
      updatedAt: now(),
    } as never;
    const event = await seedLinkedEvent(events, {
      ids,
      calendarId: calendar._id,
      content: {
        title: "Doomed",
        description: "",
        location: null,
        organizer: null,
        attendees: [],
        conference: null,
      },
      schedule,
      recurrence: { kind: "single" },
      now: now(),
    });
    const { record: command } = await commands.submit({
      tenantId: ids.tenantId,
      principalId: ids.principalId,
      idempotencyKey: ids.idempotencyKey,
      eventId: event._id,
      input: { kind: "delete", invitation: "all", scope: "all" } as never,
      expectedVersion: null,
    });
    return {
      tenantId: ids.tenantId,
      principalId: ids.principalId,
      calendar,
      event,
      command,
    };
  };

  it("deletes at the provider, tombstones, removes the local event, and confirms", async () => {
    const { tenantId, principalId, calendar, event, command } = await seed();
    const writer = new FakeProviderEventWriter();
    // Project the event first so the delete has occurrences to clear.
    await reprojectOccurrences(occurrences, event, now);
    const occurrenceCount = () =>
      mongo.db
        .collection(SYNC_COLLECTIONS.eventOccurrences)
        .countDocuments({ eventId: event._id });
    expect(await occurrenceCount()).toBe(1);

    const result = await executeProviderDelete(
      providerDeleteDeps(repos, writer),
      command,
      event,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("confirmed");
    expect(writer.deleteCalls).toHaveLength(1);
    expect(writer.deleteCalls[0]!.invitation).toBe("all");
    // Local content is gone, a content-free marker remains, occurrences cleared.
    expect(await events.findById(tenantId, principalId, event._id)).toBeNull();
    expect(await occurrenceCount()).toBe(0);
    expect(
      await markers.exists(
        calendar.connectionId,
        event.calendarId,
        "g-evt-1" as never,
      ),
    ).toBe(true);
  });

  it("confirms idempotently when the local event is already gone (replay)", async () => {
    const { tenantId, principalId, calendar, event, command } = await seed();
    const writer = new FakeProviderEventWriter();
    // Simulate a prior attempt having already removed the local event.
    await events.deleteById(tenantId, principalId, event._id);

    const result = await executeProviderDelete(
      providerDeleteDeps(repos, writer),
      command,
      event,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("confirmed");
    // Nothing to re-delete at the provider — the local absence proves it landed.
    expect(writer.deleteCalls).toHaveLength(0);
  });

  it("cascades local series exceptions when deleting a provider series", async () => {
    // Staging repro: Google-side instance override stays in Sync after the
    // master is deleted with scope=all, and keeps resurfacing in range reads.
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const connectionId = objectId() as ConnectionId;
    const calendar: ProviderCalendarRecord = {
      _id: objectId() as never,
      tenantId,
      principalId,
      connectionId,
      providerCalendarId: "primary@google.com" as never,
      displayName: "Google",
      color: null,
      active: true,
      primary: true,
      accessRole: "owner",
      capabilities: [],
      createdAt: now(),
      updatedAt: now(),
    } as never;
    const masterId = objectId() as EventId;
    await events.put({
      _id: masterId,
      tenantId,
      principalId,
      origin: "provider",
      calendarId: calendar._id,
      clientEventId: null,
      connectionId,
      providerEventId: "g-series-1" as never,
      providerVersion: "etag-1" as never,
      providerUpdatedAt: null,
      deliveryState: "confirmed",
      providerMetadata: null,
      content: {
        title: "Weekly",
        description: "",
        location: null,
        organizer: null,
        attendees: [],
        conference: null,
      },
      schedule,
      recurrence: {
        kind: "seriesMaster",
        rules: ["RRULE:FREQ=WEEKLY;COUNT=4"],
      },
      lifecycleState: "active",
      generation: 0,
      createdAt: now(),
      updatedAt: now(),
      confirmedAt: now(),
    } as never);
    const master = await events.findById(tenantId, principalId, masterId);
    if (!master) throw new Error("seed failed to read back the master");
    const exceptionId = objectId() as EventId;
    await events.put({
      _id: exceptionId,
      tenantId,
      principalId,
      origin: "provider",
      calendarId: calendar._id,
      clientEventId: null,
      connectionId,
      providerEventId: "g-inst-override" as never,
      providerVersion: "etag-1" as never,
      providerUpdatedAt: null,
      deliveryState: "confirmed",
      providerMetadata: null,
      content: {
        title: "Moved instance",
        description: "",
        location: null,
        organizer: null,
        attendees: [],
        conference: null,
      },
      schedule: {
        kind: "timed",
        start: "2026-07-21T11:00:00-06:00",
        end: "2026-07-21T12:00:00-06:00",
        timeZone: "America/Denver",
      },
      recurrence: {
        kind: "exception",
        seriesId: masterId,
        recurrenceId: "2026-07-21T09:00:00-06:00" as never,
        cancelled: false,
      },
      lifecycleState: "active",
      generation: 0,
      createdAt: now(),
      updatedAt: now(),
      confirmedAt: now(),
    } as never);
    const exception = await events.findById(tenantId, principalId, exceptionId);
    if (!exception) throw new Error("seed failed to read back the exception");
    await reprojectOccurrences(occurrences, master, now);
    await reprojectOccurrences(occurrences, exception, now);
    const { record: command } = await commands.submit({
      tenantId,
      principalId,
      idempotencyKey: `idem-${objectId()}` as IdempotencyKey,
      eventId: masterId as EventId,
      input: { kind: "delete", invitation: "none", scope: "all" } as never,
      expectedVersion: null,
    });

    const result = await executeProviderDelete(
      providerDeleteDeps(repos, new FakeProviderEventWriter()),
      command,
      master,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("confirmed");
    expect(await events.findById(tenantId, principalId, masterId)).toBeNull();
    expect(
      await events.findById(tenantId, principalId, exceptionId),
    ).toBeNull();
    expect(
      await events.findSeriesExceptions(tenantId, principalId, masterId),
    ).toEqual([]);
    expect(
      await mongo.db
        .collection(SYNC_COLLECTIONS.eventOccurrences)
        .countDocuments({ eventId: { $in: [masterId, exceptionId] } }),
    ).toBe(0);
  });

  it("clears leftover series exceptions on an already-gone master replay", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const connectionId = objectId() as ConnectionId;
    const calendar: ProviderCalendarRecord = {
      _id: objectId() as never,
      tenantId,
      principalId,
      connectionId,
      providerCalendarId: "primary@google.com" as never,
      displayName: "Google",
      color: null,
      active: true,
      primary: true,
      accessRole: "owner",
      capabilities: [],
      createdAt: now(),
      updatedAt: now(),
    } as never;
    const masterId = objectId() as EventId;
    const exceptionId = objectId() as EventId;
    // Master already removed (prior attempt); orphan exception remains.
    await events.put({
      _id: exceptionId,
      tenantId,
      principalId,
      origin: "provider",
      calendarId: calendar._id,
      clientEventId: null,
      connectionId,
      providerEventId: "g-inst-orphan" as never,
      providerVersion: "etag-1" as never,
      providerUpdatedAt: null,
      deliveryState: "confirmed",
      providerMetadata: null,
      content: {
        title: "Orphan",
        description: "",
        location: null,
        organizer: null,
        attendees: [],
        conference: null,
      },
      schedule,
      recurrence: {
        kind: "exception",
        seriesId: masterId,
        recurrenceId: "2026-07-21T09:00:00-06:00" as never,
        cancelled: false,
      },
      lifecycleState: "active",
      generation: 0,
      createdAt: now(),
      updatedAt: now(),
      confirmedAt: now(),
    } as never);
    const ghostMaster = {
      _id: masterId,
      tenantId,
      principalId,
      origin: "provider",
      calendarId: calendar._id,
      clientEventId: null,
      connectionId,
      providerEventId: "g-series-1" as never,
      providerVersion: "etag-1" as never,
      providerUpdatedAt: null,
      deliveryState: "confirmed",
      providerMetadata: null,
      content: {
        title: "Weekly",
        description: "",
        location: null,
        organizer: null,
        attendees: [],
        conference: null,
      },
      schedule,
      recurrence: {
        kind: "seriesMaster",
        rules: ["RRULE:FREQ=WEEKLY;COUNT=4"],
      },
      lifecycleState: "active",
      generation: 0,
      createdAt: now(),
      updatedAt: now(),
      confirmedAt: now(),
    } as EventRecord;
    const { record: command } = await commands.submit({
      tenantId,
      principalId,
      idempotencyKey: `idem-${objectId()}` as IdempotencyKey,
      eventId: masterId as EventId,
      input: { kind: "delete", invitation: "none", scope: "all" } as never,
      expectedVersion: null,
    });

    const result = await executeProviderDelete(
      providerDeleteDeps(repos, new FakeProviderEventWriter()),
      command,
      ghostMaster,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("confirmed");
    expect(
      await events.findById(tenantId, principalId, exceptionId),
    ).toBeNull();
  });

  it("keeps the event deletionPending and stays pending on a transient failure", async () => {
    const { tenantId, principalId, calendar, event, command } = await seed();
    const writer = new FakeProviderEventWriter();
    writer.deleteError = new ProviderWriteError("transient", "blip");

    const result = await executeProviderDelete(
      providerDeleteDeps(repos, writer),
      command,
      event,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("pending");
    const stored = await events.findById(tenantId, principalId, event._id);
    expect(stored?.lifecycleState).toBe("deletionPending");
  });

  it("reverts the event to active and fails on a terminal error", async () => {
    const { tenantId, principalId, calendar, event, command } = await seed();
    const writer = new FakeProviderEventWriter();
    writer.deleteError = new ProviderWriteError(
      "readOnlyCalendar",
      "read only",
    );

    const result = await executeProviderDelete(
      providerDeleteDeps(repos, writer),
      command,
      event,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("failed");
    expect(
      result.outcome.state === "failed" && result.outcome.failureReason,
    ).toBe("readOnlyCalendar");
    // The event is restored — a failed delete must not leave it "deleting".
    const stored = await events.findById(tenantId, principalId, event._id);
    expect(stored?.lifecycleState).toBe("active");
  });

  it("reverts and fails without deleting when the credential is revoked", async () => {
    const { tenantId, principalId, calendar, event, command } = await seed();
    const writer = new FakeProviderEventWriter();

    const result = await executeProviderDelete(
      providerDeleteDeps(repos, writer, {
        custody: failingTokenSource(
          new ProviderAuthError("authorizationRevoked", "revoked"),
        ),
      }),
      command,
      event,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("failed");
    expect(writer.deleteCalls).toHaveLength(0);
    const stored = await events.findById(tenantId, principalId, event._id);
    expect(stored?.lifecycleState).toBe("active");
  });
});
