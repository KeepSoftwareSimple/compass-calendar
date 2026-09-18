import { faker } from "@faker-js/faker";
import {
  type DateTime,
  type EventId,
  type TimeZone,
} from "@core/types/domain-primitives";
import { type RecurrenceEdit } from "@core/types/event-command.contracts";
import { type SyncCommandInput } from "@core/types/sync/command.contracts";
import { type ProviderEventVersion } from "@core/types/sync/event.contracts";
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

  const deps = (writer: ProviderEventWriter) =>
    providerMutationDeps(repos, writer);

  it("patches the whole series and reprojects with the edited content", async () => {
    const { tenantId, principalId, calendar, master } = await seedMaster();
    const command = await editAllCommand(master, {
      title: "New",
      recurrence: { kind: "preserve" },
    });
    const writer = new FakeProviderEventWriter();
    writer.fetched = providerSeries("Old", "etag-1", weekly4);
    writer.patchResult = {
      providerEventId: "g-evt-1" as ProviderEventId,
      providerVersion: "etag-2",
    };

    const result = await executeProviderSeriesUpdate(
      deps(writer),
      command,
      master,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("confirmed");
    // Preserve re-writes the master's own rules; the whole series is patched.
    expect(writer.patchCalls).toHaveLength(1);
    expect(writer.patchCalls[0]!.recurrence).toEqual({
      kind: "series",
      rules: [...weekly4],
    });
    const stored = await events.findById(tenantId, principalId, master._id);
    expect(stored?.content.title).toBe("New");
    expect(stored?.providerVersion).toBe("etag-2" as ProviderEventVersion);
    expect(stored?.recurrence).toEqual({
      kind: "seriesMaster",
      rules: [...weekly4],
    });
    // All four occurrences carry the edited title.
    const occ = await masterOccurrences(master._id);
    expect(occ).toHaveLength(4);
    expect(occ.every((o) => o["title"] === "New")).toBe(true);
  });

  it("patches on a rules-only edit instead of treating it as a replay", async () => {
    const { tenantId, principalId, calendar, master } = await seedMaster();
    // Same title and schedule, only the recurrence rule shrinks 4 -> 2. Without
    // comparing recurrence this would look identical to the provider's current
    // state and be confirmed WITHOUT ever writing the new rule.
    const command = await editAllCommand(master, {
      title: "Old",
      recurrence: { kind: "series", rules: weekly2 },
    });
    const writer = new FakeProviderEventWriter();
    writer.fetched = providerSeries("Old", "etag-1", weekly4);
    writer.patchResult = {
      providerEventId: "g-evt-1" as ProviderEventId,
      providerVersion: "etag-2",
    };

    const result = await executeProviderSeriesUpdate(
      deps(writer),
      command,
      master,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("confirmed");
    expect(writer.patchCalls).toHaveLength(1);
    expect(writer.patchCalls[0]!.recurrence).toEqual({
      kind: "series",
      rules: [...weekly2],
    });
    const stored = await events.findById(tenantId, principalId, master._id);
    expect(stored?.recurrence).toEqual({
      kind: "seriesMaster",
      rules: [...weekly2],
    });
    // The horizon now holds only the two remaining occurrences.
    expect(await masterOccurrences(master._id)).toHaveLength(2);
  });

  it("confirms without re-patching when the whole edit already landed", async () => {
    const { calendar, master } = await seedMaster();
    const command = await editAllCommand(master, {
      title: "New",
      recurrence: { kind: "series", rules: weekly2 },
    });
    const writer = new FakeProviderEventWriter();
    // Provider already holds the edited content AND the new rules at a fresh
    // version — a prior attempt landed before the crash.
    writer.fetched = providerSeries("New", "etag-2", weekly2);

    const result = await executeProviderSeriesUpdate(
      deps(writer),
      command,
      master,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("confirmed");
    expect(writer.patchCalls).toHaveLength(0);
  });

  it("treats a reformatted-but-equivalent rule echo as a replay", async () => {
    const { calendar, master } = await seedMaster();
    const command = await editAllCommand(master, {
      title: "New",
      recurrence: {
        kind: "series",
        rules: ["RRULE:FREQ=WEEKLY;COUNT=4;INTERVAL=1"],
      },
    });
    const writer = new FakeProviderEventWriter();
    // The provider echoes the same rule reordered and lowercased at a new
    // version — our edit landed on a prior attempt. A byte-for-byte compare
    // would miss it and re-patch with a now-stale version, failing a write that
    // already succeeded.
    writer.fetched = providerSeries("New", "etag-2", [
      "rrule:interval=1;count=4;freq=weekly",
    ]);

    const result = await executeProviderSeriesUpdate(
      deps(writer),
      command,
      master,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("confirmed");
    expect(writer.patchCalls).toHaveLength(0);
  });

  it("patches against the fresh version when only the master's version key drifted", async () => {
    const { calendar, master } = await seedMaster();
    const command = await editAllCommand(master, {
      title: "New",
      recurrence: { kind: "preserve" },
    });
    const writer = new FakeProviderEventWriter();
    // Same content, schedule, and rules as stored; only the version rotated.
    writer.fetched = providerSeries("Old", "etag-1-rotated", weekly4);

    const result = await executeProviderSeriesUpdate(
      deps(writer),
      command,
      master,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("confirmed");
    expect(writer.patchCalls).toHaveLength(1);
    expect(writer.patchCalls[0]!.expectedVersion).toBe("etag-1-rotated");
  });

  it("fails with a conflict on a genuine concurrent external edit", async () => {
    const { calendar, master } = await seedMaster();
    const command = await editAllCommand(master, {
      title: "New",
      recurrence: { kind: "preserve" },
    });
    const writer = new FakeProviderEventWriter();
    writer.fetched = providerSeries("Someone else", "etag-9", weekly4);
    writer.patchError = new ProviderWriteError("versionConflict", "stale");

    const result = await executeProviderSeriesUpdate(
      deps(writer),
      command,
      master,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("failed");
    expect(
      result.outcome.state === "failed" && result.outcome.failureReason,
    ).toBe("versionConflict");
    // Content changed too, so the stale version stays on the patch.
    expect(writer.patchCalls[0]!.expectedVersion).toBe("etag-1");
  });
});
