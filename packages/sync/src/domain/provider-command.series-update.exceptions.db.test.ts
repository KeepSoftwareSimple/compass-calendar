import { faker } from "@faker-js/faker";
import {
  type DateTime,
  type EventId,
  type TimeZone,
} from "@core/types/domain-primitives";
import { type RecurrenceEdit } from "@core/types/event-command.contracts";
import { type SyncCommandInput } from "@core/types/sync/command.contracts";
import {
  type IdempotencyKey,
  type ProviderEventId,
} from "@core/types/sync/identity.contracts";
import {
  bindCommandRepos,
  COMMAND_NOW,
  FakeProviderEventWriter,
  newCommandIds,
  providerMutationDeps,
  seedCommandCalendar,
  seedLinkedEvent,
} from "@sync/__tests__/helpers/command-scenario";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { executeProviderSeriesUpdate } from "@sync/domain/provider-command.series-update";
import { reprojectOccurrences } from "@sync/domain/reproject";
import { type ProviderEvent } from "@sync/providers/provider-event.port";
import {
  type ProviderEventWriter,
  ProviderWriteError,
} from "@sync/providers/provider-event-writer.port";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";
import { type CommandRepository } from "@sync/storage/repositories/command.repository";
import { type EventRepository } from "@sync/storage/repositories/event.repository";
import { type EventOccurrenceRepository } from "@sync/storage/repositories/event-occurrence.repository";
import { type ProviderCalendarRepository } from "@sync/storage/repositories/provider-calendar.repository";
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
let calendars: ProviderCalendarRepository;

beforeEach(() => {
  mongo = repos.mongo;
  commands = repos.commands;
  events = repos.events;
  occurrences = repos.occurrences;
  calendars = repos.calendars;
});

describe("executeProviderSeriesUpdate", () => {
  // A weekly series of four occurrences starting 2026-07-14 09:00 Denver.
  const schedule = {
    kind: "timed" as const,
    start: "2026-07-14T09:00:00-06:00" as DateTime,
    end: "2026-07-14T10:00:00-06:00" as DateTime,
    timeZone: "America/Denver" as TimeZone,
  };
  const weekly4 = ["RRULE:FREQ=WEEKLY;COUNT=4"];
  const weekly2 = ["RRULE:FREQ=WEEKLY;COUNT=2"];
  const content = (title: string) => ({
    title,
    description: "",
    location: null,
    organizer: null,
    attendees: [],
    conference: null,
  });
  // The provider's view of the series master, with its current rules.
  const providerSeries = (
    title: string,
    version: string,
    rules: readonly string[],
  ): ProviderEvent => ({
    kind: "event",
    providerEventId: "g-evt-1" as ProviderEventId,
    providerVersion: version,
    providerUpdatedAt: null,
    content: content(title),
    schedule,
    busy: true,
    recurrence: { kind: "seriesMaster", rules: [...rules] },
  });

  // Seed a provider-linked series master ("Old", weekly x4 at etag-1).
  const seedMaster = async () => {
    const ids = newCommandIds();
    const calendar = await seedCommandCalendar(calendars, ids);
    const master = await seedLinkedEvent(events, {
      ids,
      calendarId: calendar._id,
      content: content("Old"),
      schedule,
      recurrence: { kind: "seriesMaster", rules: [...weekly4] },
      now: now(),
    });
    await reprojectOccurrences(occurrences, master, now);
    return {
      tenantId: ids.tenantId,
      principalId: ids.principalId,
      calendar,
      master,
    };
  };

  // An edit-all update command for the seeded master.
  const editAllCommand = async (
    master: EventRecord,
    edit: {
      title: string;
      recurrence: RecurrenceEdit;
      schedule?: typeof schedule;
    },
  ) =>
    (
      await commands.submit({
        tenantId: master.tenantId,
        principalId: master.principalId,
        idempotencyKey: `idem-${objectId()}` as IdempotencyKey,
        eventId: master._id,
        input: {
          kind: "update",
          invitation: "all",
          content: content(edit.title),
          schedule: edit.schedule ?? schedule,
          recurrence: edit.recurrence,
          scope: "all",
          recurrenceId: null,
        } as unknown as SyncCommandInput,
        expectedVersion: "etag-1" as never,
      })
    ).record;

  const masterOccurrences = (eventId: EventId) =>
    mongo.db
      .collection(SYNC_COLLECTIONS.eventOccurrences)
      .find({ eventId })
      .sort({ startAt: 1 })
      .toArray();

  // Seed a provider-linked series exception. Real provider exceptions come from
  // import (a later slice) and each carries its OWN provider event id, so this
  // seeds a distinct providerEventId rather than reusing the master's — the
  // provider-identity unique index forbids sharing it.
  const putException = async (
    master: EventRecord,
    opts: {
      providerEventId: string;
      recurrenceId: string;
      cancelled: boolean;
      title: string;
    },
  ): Promise<EventRecord> => {
    const id = objectId() as EventId;
    await events.put({
      _id: id,
      tenantId: master.tenantId,
      principalId: master.principalId,
      origin: "compass",
      calendarId: master.calendarId,
      clientEventId: null,
      connectionId: master.connectionId,
      providerEventId: opts.providerEventId as never,
      providerVersion: "etag-1" as never,
      providerUpdatedAt: null,
      deliveryState: "confirmed",
      providerMetadata: null,
      content: content(opts.title),
      schedule,
      recurrence: {
        kind: "exception",
        seriesId: master._id,
        recurrenceId: opts.recurrenceId as never,
        cancelled: opts.cancelled,
      },
      lifecycleState: "active",
      generation: 0,
      createdAt: now(),
      updatedAt: now(),
      confirmedAt: now(),
    } as never);
    const stored = await events.findById(
      master.tenantId,
      master.principalId,
      id,
    );
    if (!stored) throw new Error("seed failed to read back the exception");
    return stored;
  };

  const deps = (writer: ProviderEventWriter) =>
    providerMutationDeps(repos, writer);

  it("discards override exceptions but keeps cancelled tombstones", async () => {
    const { tenantId, principalId, calendar, master } = await seedMaster();
    // An override on the 2nd instant and a cancellation on the 3rd.
    const override = await putException(master, {
      providerEventId: "g-inst-override" as ProviderEventId,
      recurrenceId: "2026-07-21T09:00:00-06:00",
      cancelled: false,
      title: "Moved",
    });
    await putException(master, {
      providerEventId: "g-inst-cancelled" as ProviderEventId,
      recurrenceId: "2026-07-28T09:00:00-06:00",
      cancelled: true,
      title: "Old",
    });
    const command = await editAllCommand(master, {
      title: "New",
      recurrence: { kind: "preserve" },
    });
    const writer = new FakeProviderEventWriter();
    writer.fetched = providerSeries("Old", "etag-1", weekly4);

    const result = await executeProviderSeriesUpdate(
      deps(writer),
      command,
      master,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("confirmed");
    // Align the content override at the provider (do not cancel it); leave the
    // kept tombstone untouched.
    expect(writer.deleteCalls).toHaveLength(0);
    const overridePatch = writer.patchCalls.find(
      (call) => call.providerEventId === "g-inst-override",
    );
    expect(overridePatch).toMatchObject({
      providerEventId: "g-inst-override" as ProviderEventId,
      expectedVersion: null,
      invitation: "all",
      calendarId: calendar.providerCalendarId,
      recurrence: { kind: "instance" },
      content: expect.objectContaining({ title: "New" }),
      schedule: {
        kind: "timed",
        start: "2026-07-21T09:00:00-06:00" as DateTime,
        end: "2026-07-21T10:00:00-06:00" as DateTime,
        timeZone: "America/Denver" as TimeZone,
      },
    });
    // The override is gone; the cancelled tombstone survives the edit.
    expect(
      await events.findById(tenantId, principalId, override._id),
    ).toBeNull();
    const remaining = await events.findSeriesExceptions(
      tenantId,
      principalId,
      master._id,
    );
    expect(remaining).toHaveLength(1);
    expect(
      remaining[0]?.recurrence.kind === "exception" &&
        remaining[0]?.recurrence.cancelled,
    ).toBe(true);
    // The reprojected master excludes the cancelled instant (2026-07-28 15:00Z)
    // but re-covers the formerly-overridden instant, so three master rows remain.
    const occ = await masterOccurrences(master._id);
    const starts = occ.map((o) => (o["startAt"] as Date).toISOString());
    expect(starts).toEqual([
      "2026-07-14T15:00:00.000Z",
      "2026-07-21T15:00:00.000Z",
      "2026-08-04T15:00:00.000Z",
    ]);
  });

  it("leaves the override local when provider override align is transient", async () => {
    const { tenantId, principalId, calendar, master } = await seedMaster();
    const override = await putException(master, {
      providerEventId: "g-inst-override" as ProviderEventId,
      recurrenceId: "2026-07-21T09:00:00-06:00",
      cancelled: false,
      title: "Moved",
    });
    const command = await editAllCommand(master, {
      title: "New",
      recurrence: { kind: "preserve" },
    });
    const writer = new FakeProviderEventWriter();
    writer.fetched = providerSeries("Old", "etag-1", weekly4);
    writer.instancePatchError = new ProviderWriteError(
      "transient",
      "rate limited",
    );

    const result = await executeProviderSeriesUpdate(
      deps(writer),
      command,
      master,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("pending");
    expect(writer.deleteCalls).toHaveLength(0);
    expect(
      writer.patchCalls.some(
        (call) => call.providerEventId === "g-inst-override",
      ),
    ).toBe(true);
    expect(
      await events.findById(tenantId, principalId, override._id),
    ).not.toBeNull();
  });

  it("aligns discarded overrides to a series time change", async () => {
    const { calendar, master } = await seedMaster();
    await putException(master, {
      providerEventId: "g-inst-override" as ProviderEventId,
      recurrenceId: "2026-07-21T09:00:00-06:00",
      cancelled: false,
      title: "Moved",
    });
    const movedSchedule = {
      kind: "timed" as const,
      start: "2026-07-14T10:00:00-06:00" as DateTime,
      end: "2026-07-14T11:00:00-06:00" as DateTime,
      timeZone: "America/Denver" as TimeZone,
    };
    const command = await editAllCommand(master, {
      title: "New",
      recurrence: { kind: "preserve" },
      schedule: movedSchedule,
    });
    const writer = new FakeProviderEventWriter();
    writer.fetched = providerSeries("Old", "etag-1", weekly4);

    const result = await executeProviderSeriesUpdate(
      deps(writer),
      command,
      master,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("confirmed");
    const overridePatch = writer.patchCalls.find(
      (call) => call.providerEventId === "g-inst-override",
    );
    expect(overridePatch?.schedule).toEqual({
      kind: "timed",
      start: "2026-07-21T10:00:00-06:00" as DateTime,
      end: "2026-07-21T11:00:00-06:00" as DateTime,
      timeZone: "America/Denver" as TimeZone,
    });
  });

  it("continues edit-all when the override is already gone at the provider", async () => {
    const { tenantId, principalId, calendar, master } = await seedMaster();
    const override = await putException(master, {
      providerEventId: "g-inst-override" as ProviderEventId,
      recurrenceId: "2026-07-21T09:00:00-06:00",
      cancelled: false,
      title: "Moved",
    });
    const command = await editAllCommand(master, {
      title: "New",
      recurrence: { kind: "preserve" },
    });
    const writer = new FakeProviderEventWriter();
    writer.fetched = providerSeries("Old", "etag-1", weekly4);
    writer.instancePatchError = new ProviderWriteError(
      "permanentProviderError",
      "Google rejected the write",
    );

    const result = await executeProviderSeriesUpdate(
      deps(writer),
      command,
      master,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("confirmed");
    expect(
      writer.fetchCalls.some(
        (call) => call.providerEventId === "g-inst-override",
      ),
    ).toBe(true);
    expect(
      await events.findById(tenantId, principalId, override._id),
    ).toBeNull();
    const starts = (await masterOccurrences(master._id)).map((o) =>
      (o["startAt"] as Date).toISOString(),
    );
    expect(starts).toContain("2026-07-21T15:00:00.000Z");
  });

  it("converts a series to a single event, dropping every exception", async () => {
    const { tenantId, principalId, calendar, master } = await seedMaster();
    await putException(master, {
      providerEventId: "g-inst-cancelled" as ProviderEventId,
      recurrenceId: "2026-07-28T09:00:00-06:00",
      cancelled: true,
      title: "Old",
    });
    const command = await editAllCommand(master, {
      title: "Just once",
      recurrence: { kind: "single" },
    });
    const writer = new FakeProviderEventWriter();
    writer.fetched = providerSeries("Old", "etag-1", weekly4);

    const result = await executeProviderSeriesUpdate(
      deps(writer),
      command,
      master,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("confirmed");
    // The provider write removes recurrence.
    expect(writer.patchCalls[0]!.recurrence).toEqual({ kind: "single" });
    // Convert-to-single also cancels every discarded exception at the provider
    // (including former cancellations) so a later pull cannot resurrect them.
    expect(writer.deleteCalls).toEqual([
      expect.objectContaining({
        providerEventId: "g-inst-cancelled" as ProviderEventId,
      }),
    ]);
    const stored = await events.findById(tenantId, principalId, master._id);
    expect(stored?.recurrence).toEqual({ kind: "single" });
    // No exceptions survive a conversion to a single event, and the master
    // projects exactly one occurrence.
    expect(
      await events.findSeriesExceptions(tenantId, principalId, master._id),
    ).toHaveLength(0);
    expect(await masterOccurrences(master._id)).toHaveLength(1);
  });

  it("converges when executed twice (idempotent retry)", async () => {
    const { tenantId, principalId, calendar, master } = await seedMaster();
    const command = await editAllCommand(master, {
      title: "New",
      recurrence: { kind: "series", rules: weekly2 },
    });
    const writer = new FakeProviderEventWriter();
    writer.fetched = providerSeries("Old", "etag-1", weekly4);
    writer.patchResult = {
      providerEventId: "g-evt-1" as ProviderEventId,
      providerVersion: "etag-2",
    };

    await executeProviderSeriesUpdate(
      deps(writer),
      command,
      master,
      calendar,
      now,
    );
    // The provider now reflects the landed edit, so a retry is a replay.
    writer.fetched = providerSeries("New", "etag-2", weekly2);
    const second = await executeProviderSeriesUpdate(
      deps(writer),
      command,
      master,
      calendar,
      now,
    );

    expect(second.outcome.state).toBe("confirmed");
    // Only the first attempt wrote; the retry recognized the replay.
    expect(writer.patchCalls).toHaveLength(1);
    const owned = await mongo.db
      .collection(SYNC_COLLECTIONS.events)
      .find({ tenantId, principalId, calendarId: calendar._id })
      .toArray();
    expect(owned).toHaveLength(1);
    expect(await masterOccurrences(master._id)).toHaveLength(2);
  });

  it("leaves the command pending on a transient patch failure", async () => {
    const { calendar, master } = await seedMaster();
    const command = await editAllCommand(master, {
      title: "New",
      recurrence: { kind: "preserve" },
    });
    const writer = new FakeProviderEventWriter();
    writer.fetched = providerSeries("Old", "etag-1", weekly4);
    writer.patchError = new ProviderWriteError("transient", "blip");

    const result = await executeProviderSeriesUpdate(
      deps(writer),
      command,
      master,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("pending");
  });
});
