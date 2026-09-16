import { faker } from "@faker-js/faker";
import { type Document, type Filter } from "mongodb";
import {
  type DateTime,
  type EventId,
  type TimeZone,
} from "@core/types/domain-primitives";
import { type SyncCommandInput } from "@core/types/sync/command.contracts";
import {
  type IdempotencyKey,
  type PrincipalId,
  type ProviderEventId,
} from "@core/types/sync/identity.contracts";
import {
  bindCommandRepos,
  COMMAND_NOW,
  FakeProviderEventWriter,
  newCommandIds,
  providerDeleteDeps,
  providerMutationDeps,
  seedCommandCalendar,
  seedLinkedEvent,
} from "@sync/__tests__/helpers/command-scenario";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { truncateRulesBefore } from "@sync/domain/occurrence-projection";
import {
  executeProviderSeriesFollowingDelete,
  executeProviderSeriesFollowingUpdate,
} from "@sync/domain/provider-command.series-following";
import { reprojectOccurrences } from "@sync/domain/reproject";
import { type ProviderEvent } from "@sync/providers/provider-event.port";
import { ProviderWriteError } from "@sync/providers/provider-event-writer.port";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";
import { type CommandRepository } from "@sync/storage/repositories/command.repository";
import { type CredentialRepository } from "@sync/storage/repositories/credential.repository";
import { type DeletionMarkerRepository } from "@sync/storage/repositories/deletion-marker.repository";
import { type EventRepository } from "@sync/storage/repositories/event.repository";
import { type EventOccurrenceRepository } from "@sync/storage/repositories/event-occurrence.repository";
import { type ProviderCalendarRepository } from "@sync/storage/repositories/provider-calendar.repository";
import { type SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";
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
let resources: SyncResourceRepository;
let calendars: ProviderCalendarRepository;
let markers: DeletionMarkerRepository;
let _credentials: CredentialRepository;

beforeEach(() => {
  mongo = repos.mongo;
  commands = repos.commands;
  events = repos.events;
  occurrences = repos.occurrences;
  resources = repos.resources;
  calendars = repos.calendars;
  markers = repos.markers;
  _credentials = repos.credentials;
});

describe("provider-linked recurring scopes (this / thisAndFollowing)", () => {
  // A weekly series of three occurrences starting 2026-07-14 09:00 Denver:
  // 07-14, 07-21, 07-28 (all 15:00Z). Matches the cloud-path test fixtures
  // exactly, so results are directly comparable.
  const schedule = {
    kind: "timed" as const,
    start: "2026-07-14T09:00:00-06:00" as DateTime,
    end: "2026-07-14T10:00:00-06:00" as DateTime,
    timeZone: "America/Denver" as TimeZone,
  };
  const weekly3 = ["RRULE:FREQ=WEEKLY;COUNT=3"];
  const SECOND_START = "2026-07-21T09:00:00-06:00";
  const SECOND_START_UTC = "2026-07-21T15:00:00.000Z";
  const content = (title: string) => ({
    title,
    description: "",
    location: null,
    organizer: null,
    attendees: [],
    conference: null,
  });
  const _providerInstance = (
    providerEventId: string,
    title: string,
    version: string,
    instanceSchedule = {
      kind: "timed" as const,
      start: SECOND_START as DateTime,
      end: "2026-07-21T10:00:00-06:00" as DateTime,
      timeZone: "America/Denver" as TimeZone,
    },
  ): ProviderEvent => ({
    kind: "event",
    providerEventId,
    providerVersion: version,
    providerUpdatedAt: null,
    content: content(title),
    schedule: instanceSchedule,
    busy: true,
    // Matches what the real normalizer reports for an event resolved off a
    // series via fetchInstanceAt — NOT "single". A prior version of this
    // fixture used "single", which papered over a bug where the replay
    // short-circuit could never match a real instance read.
    recurrence: {
      kind: "instance",
      seriesProviderId: "g-series-1",
      recurrenceId: SECOND_START,
    },
  });
  const providerSeries = (
    title: string,
    version: string,
    rules: readonly string[],
  ): ProviderEvent => ({
    kind: "event",
    providerEventId: "g-series-1" as ProviderEventId,
    providerVersion: version,
    providerUpdatedAt: null,
    content: content(title),
    schedule,
    busy: true,
    recurrence: { kind: "seriesMaster", rules: [...rules] },
  });

  const seedMaster = async () => {
    const ids = newCommandIds();
    const calendar = await seedCommandCalendar(calendars, ids);
    const master = await seedLinkedEvent(events, {
      ids,
      calendarId: calendar._id,
      providerEventId: "g-series-1" as ProviderEventId,
      content: content("Old"),
      schedule,
      recurrence: { kind: "seriesMaster", rules: [...weekly3] },
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

  const occurrenceStartsFor = async (eventId: EventId): Promise<string[]> => {
    const docs = await mongo.db
      .collection(SYNC_COLLECTIONS.eventOccurrences)
      .find({ eventId })
      .sort({ startAt: 1 })
      .toArray();
    return docs.map((doc) => (doc["startAt"] as Date).toISOString());
  };

  const otherSeriesMaster = (principalId: PrincipalId, masterId: EventId) =>
    mongo.db
      .collection(SYNC_COLLECTIONS.events)
      .find({
        principalId,
        "recurrence.kind": "seriesMaster",
        _id: { $ne: masterId },
      } as unknown as Filter<Document>)
      .toArray();

  const _thisScopeCommand = async (
    master: EventRecord,
    kind: "update" | "delete",
    title = "Edited",
  ) =>
    (
      await commands.submit({
        tenantId: master.tenantId,
        principalId: master.principalId,
        idempotencyKey: `idem-${objectId()}` as IdempotencyKey,
        eventId: master._id,
        input:
          kind === "update"
            ? ({
                kind: "update",
                invitation: "none",
                content: content(title),
                schedule: {
                  kind: "timed",
                  start: SECOND_START,
                  end: "2026-07-21T10:00:00-06:00",
                  timeZone: "America/Denver",
                },
                recurrence: { kind: "preserve" },
                scope: "this",
                recurrenceId: SECOND_START,
              } as unknown as SyncCommandInput)
            : ({
                kind: "delete",
                invitation: "none",
                scope: "this",
                recurrenceId: SECOND_START,
              } as unknown as SyncCommandInput),
        expectedVersion: null,
      })
    ).record;

  const followingCommand = async (
    master: EventRecord,
    kind: "update" | "delete",
    splitAt = SECOND_START,
    title = "Split",
  ) =>
    (
      await commands.submit({
        tenantId: master.tenantId,
        principalId: master.principalId,
        idempotencyKey: `idem-${objectId()}` as IdempotencyKey,
        eventId: master._id,
        input:
          kind === "update"
            ? ({
                kind: "update",
                invitation: "none",
                content: content(title),
                schedule: {
                  kind: "timed",
                  start: splitAt,
                  end: "2026-07-21T10:00:00-06:00",
                  timeZone: "America/Denver",
                },
                recurrence: {
                  kind: "series",
                  rules: ["RRULE:FREQ=WEEKLY;COUNT=2"],
                },
                scope: "thisAndFollowing",
                recurrenceId: splitAt,
              } as unknown as SyncCommandInput)
            : ({
                kind: "delete",
                invitation: "none",
                scope: "thisAndFollowing",
                recurrenceId: splitAt,
              } as unknown as SyncCommandInput),
        expectedVersion: null,
      })
    ).record;

  const deps = (writer: FakeProviderEventWriter) =>
    providerMutationDeps({ commands, events, occurrences, resources }, writer);
  const deleteDeps = (writer: FakeProviderEventWriter) =>
    providerDeleteDeps(
      { commands, events, occurrences, resources, markers },
      writer,
    );

  describe("executeProviderSeriesFollowingDelete", () => {
    it("truncates the provider master and drops following occurrences", async () => {
      const { tenantId, principalId, calendar, master } = await seedMaster();
      const command = await followingCommand(master, "delete");
      const writer = new FakeProviderEventWriter();
      writer.fetchEventResult = providerSeries("Old", "etag-1", weekly3);

      const result = await executeProviderSeriesFollowingDelete(
        deleteDeps(writer),
        command,
        master,
        calendar,
        now,
      );

      expect(result.outcome.state).toBe("confirmed");
      expect(writer.patchCalls[0]?.recurrence.kind).toBe("series");
      // Content/schedule are unchanged — only the rules were patched.
      expect(writer.patchCalls[0]?.content.title).toBe("Old");
      const stored = await events.findById(tenantId, principalId, master._id);
      expect(stored?.recurrence.kind).toBe("seriesMaster");
      expect(await occurrenceStartsFor(master._id)).toEqual([
        "2026-07-14T15:00:00.000Z",
      ]);
    });

    it("confirms without re-patching when the truncation already landed", async () => {
      const { calendar, master } = await seedMaster();
      const command = await followingCommand(master, "delete");
      const writer = new FakeProviderEventWriter();
      // Provider already reflects the truncated rules — the exact UNTIL-based
      // form truncateRulesBefore itself produces, not just an equivalent
      // COUNT-based rule (matchesIntendedEdit compares rule strings, not
      // recurrence semantics, so only this form is recognized as a replay).
      writer.fetchEventResult = providerSeries(
        "Old",
        "etag-2",
        truncateRulesBefore(weekly3, new Date(SECOND_START)),
      );

      const result = await executeProviderSeriesFollowingDelete(
        deleteDeps(writer),
        command,
        master,
        calendar,
        now,
      );

      expect(result.outcome.state).toBe("confirmed");
      expect(writer.patchCalls).toHaveLength(0);
    });

    it("collapses to the whole-series provider delete at the first occurrence", async () => {
      const { tenantId, principalId, calendar, master } = await seedMaster();
      const command = await followingCommand(
        master,
        "delete",
        "2026-07-14T09:00:00-06:00",
      );
      const writer = new FakeProviderEventWriter();

      const result = await executeProviderSeriesFollowingDelete(
        deleteDeps(writer),
        command,
        master,
        calendar,
        now,
      );

      expect(result.outcome.state).toBe("confirmed");
      // executeProviderDelete's path was taken: the whole event is gone.
      expect(writer.deleteCalls).toHaveLength(1);
      expect(
        await events.findById(tenantId, principalId, master._id),
      ).toBeNull();
    });

    it("leaves the command pending on a transient patch failure", async () => {
      const { calendar, master } = await seedMaster();
      const command = await followingCommand(master, "delete");
      const writer = new FakeProviderEventWriter();
      writer.fetchEventResult = providerSeries("Old", "etag-1", weekly3);
      writer.patchError = new ProviderWriteError("transient", "blip");

      const result = await executeProviderSeriesFollowingDelete(
        deleteDeps(writer),
        command,
        master,
        calendar,
        now,
      );

      expect(result.outcome.state).toBe("pending");
    });
  });

  describe("executeProviderSeriesFollowingUpdate", () => {
    it("truncates the original and creates a deterministic remainder at the provider", async () => {
      const { principalId, calendar, master } = await seedMaster();
      const command = await followingCommand(master, "update");
      const writer = new FakeProviderEventWriter();
      writer.fetchEventResult = providerSeries("Old", "etag-1", weekly3);
      writer.createResult = {
        providerEventId: "g-remainder-1" as ProviderEventId,
        providerVersion: "etag-1",
      };

      const result = await executeProviderSeriesFollowingUpdate(
        deps(writer),
        command,
        master,
        calendar,
        now,
      );

      expect(result.outcome.state).toBe("confirmed");
      // Original truncated to just the pre-split occurrence.
      expect(await occurrenceStartsFor(master._id)).toEqual([
        "2026-07-14T15:00:00.000Z",
      ]);
      // Remainder created at the provider with the deterministic id.
      expect(writer.createCalls).toHaveLength(1);
      const remainders = await otherSeriesMaster(principalId, master._id);
      expect(remainders).toHaveLength(1);
      expect(writer.createCalls[0]?.providerEventId).toBe(
        String(remainders[0]?.["_id"]),
      );
      expect(remainders[0]?.["content"]).toMatchObject({ title: "Split" });
      const remainderId = String(remainders[0]?.["_id"]) as EventId;
      expect(await occurrenceStartsFor(remainderId)).toEqual([
        SECOND_START_UTC,
        "2026-07-28T15:00:00.000Z",
      ]);
    });

    it("upserts a single remainder across two splits at the same point (idempotent retry)", async () => {
      // Two distinct commands (fresh idempotency keys), same split point —
      // mirrors the cloud path's own convergence test. The deterministic
      // remainder id (remainderMasterId) means deps.events.put upserts the
      // SAME Mongo document both times, regardless of whether each call's
      // own provider-replay check fires — that Mongo-level convergence is
      // what this test locks in.
      const { principalId, calendar, master } = await seedMaster();
      const first = await followingCommand(
        master,
        "update",
        SECOND_START,
        "First",
      );
      const writerA = new FakeProviderEventWriter();
      writerA.fetchEventResult = providerSeries("Old", "etag-1", weekly3);
      await executeProviderSeriesFollowingUpdate(
        deps(writerA),
        first,
        master,
        calendar,
        now,
      );

      const second = await followingCommand(
        master,
        "update",
        SECOND_START,
        "Second",
      );
      const writerB = new FakeProviderEventWriter();
      writerB.fetchEventResult = providerSeries("Old", "etag-1", weekly3);

      await executeProviderSeriesFollowingUpdate(
        deps(writerB),
        second,
        master,
        calendar,
        now,
      );

      expect(await otherSeriesMaster(principalId, master._id)).toHaveLength(1);
    });

    it("collapses to the provider edit-all at the first occurrence", async () => {
      const { tenantId, principalId, calendar, master } = await seedMaster();
      const command = await followingCommand(
        master,
        "update",
        "2026-07-14T09:00:00-06:00",
        "Whole",
      );
      const writer = new FakeProviderEventWriter();
      writer.fetchEventResult = providerSeries("Old", "etag-1", weekly3);

      const result = await executeProviderSeriesFollowingUpdate(
        deps(writer),
        command,
        master,
        calendar,
        now,
      );

      expect(result.outcome.state).toBe("confirmed");
      expect(writer.createCalls).toHaveLength(0);
      const stored = await events.findById(tenantId, principalId, master._id);
      expect(stored?.content.title).toBe("Whole");
      expect(await otherSeriesMaster(principalId, master._id)).toHaveLength(0);
    });

    it("leaves the command pending on a transient create failure for the remainder", async () => {
      const { calendar, master } = await seedMaster();
      const command = await followingCommand(master, "update");
      const writer = new FakeProviderEventWriter();
      writer.fetchEventResult = providerSeries("Old", "etag-1", weekly3);
      writer.createError = new ProviderWriteError("transient", "blip");

      const result = await executeProviderSeriesFollowingUpdate(
        deps(writer),
        command,
        master,
        calendar,
        now,
      );

      expect(result.outcome.state).toBe("pending");
    });
  });
});

// WP-02: attendeesEdit "replace" — merge-by-email against freshly fetched
// provider state, organizer guard, replay by email set, and byte-identical
// "preserve"/legacy behavior.
