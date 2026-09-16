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
import {
  executeProviderOccurrenceDelete,
  executeProviderOccurrenceUpdate,
} from "@sync/domain/provider-command.occurrence";
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
  const providerInstance = (
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

  const _otherSeriesMaster = (principalId: PrincipalId, masterId: EventId) =>
    mongo.db
      .collection(SYNC_COLLECTIONS.events)
      .find({
        principalId,
        "recurrence.kind": "seriesMaster",
        _id: { $ne: masterId },
      } as unknown as Filter<Document>)
      .toArray();

  const thisScopeCommand = async (
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

  const _followingCommand = async (
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

  describe("executeProviderOccurrenceUpdate", () => {
    it("resolves the instance, patches IT (not the master), and stores its own provider identity", async () => {
      const { tenantId, principalId, calendar, master } = await seedMaster();
      const command = await thisScopeCommand(master, "update", "Moved");
      const writer = new FakeProviderEventWriter();
      writer.fetchInstanceResult = providerInstance(
        "g-inst-1",
        "Old",
        "etag-1",
      );

      const result = await executeProviderOccurrenceUpdate(
        deps(writer),
        command,
        master,
        calendar,
        now,
      );

      expect(result.outcome.state).toBe("confirmed");
      expect(writer.fetchInstanceCalls[0]).toMatchObject({
        seriesProviderEventId: "g-series-1",
        originalStartAt: SECOND_START,
        scheduleKind: "timed",
      });
      // Patched the INSTANCE's own resolved id, never the master's.
      expect(writer.patchCalls[0]?.providerEventId).toBe("g-inst-1");
      // "instance", not "single" — Google rejects a recurrence key at all on
      // an event resolved off a series via fetchInstanceAt.
      expect(writer.patchCalls[0]?.recurrence).toEqual({ kind: "instance" });

      const exceptions = await events.findSeriesExceptions(
        tenantId,
        principalId,
        master._id,
      );
      expect(exceptions).toHaveLength(1);
      // The exception carries the INSTANCE's own provider identity, not the
      // master's — sharing the master's would collide the unique
      // provider_event_identity index.
      expect(exceptions[0]?.providerEventId).toBe(
        "g-inst-1" as ProviderEventId,
      );
      expect(exceptions[0]?.content.title).toBe("Moved");
      // The master no longer projects the overridden instant.
      expect(await occurrenceStartsFor(master._id)).not.toContain(
        SECOND_START_UTC,
      );
    });

    it("confirms without re-patching when the edit already landed (replay)", async () => {
      const { calendar, master } = await seedMaster();
      const command = await thisScopeCommand(master, "update", "Moved");
      const writer = new FakeProviderEventWriter();
      // The instance already carries this command's intended content.
      writer.fetchInstanceResult = providerInstance(
        "g-inst-1",
        "Moved",
        "etag-2",
      );

      const result = await executeProviderOccurrenceUpdate(
        deps(writer),
        command,
        master,
        calendar,
        now,
      );

      expect(result.outcome.state).toBe("confirmed");
      expect(writer.patchCalls).toHaveLength(0);
    });

    it("fails without writing when no instance exists at that instant", async () => {
      const { calendar, master } = await seedMaster();
      const command = await thisScopeCommand(master, "update");
      const writer = new FakeProviderEventWriter();
      writer.fetchInstanceResult = null;

      const result = await executeProviderOccurrenceUpdate(
        deps(writer),
        command,
        master,
        calendar,
        now,
      );

      expect(result.outcome.state).toBe("failed");
      expect(
        result.outcome.state === "failed" && result.outcome.failureReason,
      ).toBe("permanentProviderError");
      expect(writer.patchCalls).toHaveLength(0);
    });

    it("leaves the command pending on a transient patch failure", async () => {
      const { calendar, master } = await seedMaster();
      const command = await thisScopeCommand(master, "update");
      const writer = new FakeProviderEventWriter();
      writer.fetchInstanceResult = providerInstance(
        "g-inst-1",
        "Old",
        "etag-1",
      );
      writer.patchError = new ProviderWriteError("transient", "blip");

      const result = await executeProviderOccurrenceUpdate(
        deps(writer),
        command,
        master,
        calendar,
        now,
      );

      expect(result.outcome.state).toBe("pending");
    });
  });

  describe("executeProviderOccurrenceDelete", () => {
    it("deletes the resolved instance at the provider and tombstones it locally", async () => {
      const { tenantId, principalId, calendar, master } = await seedMaster();
      const command = await thisScopeCommand(master, "delete");
      const writer = new FakeProviderEventWriter();
      writer.fetchInstanceResult = providerInstance(
        "g-inst-1",
        "Old",
        "etag-1",
      );

      const result = await executeProviderOccurrenceDelete(
        deleteDeps(writer),
        command,
        master,
        calendar,
        now,
      );

      expect(result.outcome.state).toBe("confirmed");
      expect(writer.deleteCalls[0]?.providerEventId).toBe("g-inst-1");
      const exceptions = await events.findSeriesExceptions(
        tenantId,
        principalId,
        master._id,
      );
      expect(exceptions).toHaveLength(1);
      expect(
        exceptions[0]?.recurrence.kind === "exception" &&
          exceptions[0]?.recurrence.cancelled,
      ).toBe(true);
      // The master no longer projects the cancelled instant; the whole
      // series and every OTHER instance are untouched.
      expect(await occurrenceStartsFor(master._id)).toEqual([
        "2026-07-14T15:00:00.000Z",
        "2026-07-28T15:00:00.000Z",
      ]);
    });

    it("converges without a second provider call when the instance is already gone", async () => {
      const { tenantId, principalId, calendar, master } = await seedMaster();
      const command = await thisScopeCommand(master, "delete");
      const writer = new FakeProviderEventWriter();
      writer.fetchInstanceResult = null;

      const result = await executeProviderOccurrenceDelete(
        deleteDeps(writer),
        command,
        master,
        calendar,
        now,
      );

      expect(result.outcome.state).toBe("confirmed");
      expect(writer.deleteCalls).toHaveLength(0);
      const exceptions = await events.findSeriesExceptions(
        tenantId,
        principalId,
        master._id,
      );
      expect(exceptions).toHaveLength(1);
      // Regression lock: the tombstone must NOT mirror the master's own
      // providerEventId (master.providerEventId is non-null here, since this
      // is a provider-linked series) — doing so would collide the
      // provider_event_identity unique index the master document already
      // occupies. There is no live provider counterpart, so it's null.
      expect(exceptions[0]?.providerEventId).toBeNull();
    });

    it("leaves the command pending on a transient delete failure", async () => {
      const { calendar, master } = await seedMaster();
      const command = await thisScopeCommand(master, "delete");
      const writer = new FakeProviderEventWriter();
      writer.fetchInstanceResult = providerInstance(
        "g-inst-1",
        "Old",
        "etag-1",
      );
      writer.deleteError = new ProviderWriteError("transient", "blip");

      const result = await executeProviderOccurrenceDelete(
        deleteDeps(writer),
        command,
        master,
        calendar,
        now,
      );

      expect(result.outcome.state).toBe("pending");
    });

    it("fails without tombstoning when the provider declines the delete (unsupportedCapability)", async () => {
      // Google 400s a well-formed instance delete for special events (e.g. a
      // contact-linked birthday occurrence). The event still exists at the
      // provider, so hiding it locally would desync until the next pull
      // resurrected it — the command fails honestly instead.
      const { tenantId, principalId, calendar, master } = await seedMaster();
      const command = await thisScopeCommand(master, "delete");
      const writer = new FakeProviderEventWriter();
      writer.fetchInstanceResult = providerInstance(
        "g-inst-1",
        "Old",
        "etag-1",
      );
      writer.deleteError = new ProviderWriteError(
        "unsupportedCapability",
        "declined",
      );

      const result = await executeProviderOccurrenceDelete(
        deleteDeps(writer),
        command,
        master,
        calendar,
        now,
      );

      expect(result.outcome.state).toBe("failed");
      expect(
        result.outcome.state === "failed" && result.outcome.failureReason,
      ).toBe("unsupportedCapability");
      // No local trace of the refused delete: no cancelled exception, and the
      // occurrence still projects.
      const exceptions = await events.findSeriesExceptions(
        tenantId,
        principalId,
        master._id,
      );
      expect(exceptions).toHaveLength(0);
      expect(await occurrenceStartsFor(master._id)).toContain(SECOND_START_UTC);
    });

    it("still deletes when the resolved instance is identity-only (unreadable content)", async () => {
      const { tenantId, principalId, calendar, master } = await seedMaster();
      const command = await thisScopeCommand(master, "delete");
      const writer = new FakeProviderEventWriter();
      writer.fetchInstanceResult = {
        ...providerInstance("g-inst-unreadable", "", "etag-1"),
        content: content(""),
      };

      const result = await executeProviderOccurrenceDelete(
        deleteDeps(writer),
        command,
        master,
        calendar,
        now,
      );

      expect(result.outcome.state).toBe("confirmed");
      expect(writer.deleteCalls[0]?.providerEventId).toBe("g-inst-unreadable");
      const exceptions = await events.findSeriesExceptions(
        tenantId,
        principalId,
        master._id,
      );
      expect(exceptions[0]?.providerEventId).toBe(
        "g-inst-unreadable" as ProviderEventId,
      );
    });

    it("does not delete the series master when lookup returns the master's id", async () => {
      const { tenantId, principalId, calendar, master } = await seedMaster();
      const command = await thisScopeCommand(master, "delete");
      const writer = new FakeProviderEventWriter();
      writer.fetchInstanceResult = providerSeries("Old", "etag-1", weekly3);

      const result = await executeProviderOccurrenceDelete(
        deleteDeps(writer),
        command,
        master,
        calendar,
        now,
      );

      expect(result.outcome.state).toBe("confirmed");
      expect(writer.deleteCalls).toHaveLength(0);
      const exceptions = await events.findSeriesExceptions(
        tenantId,
        principalId,
        master._id,
      );
      expect(exceptions).toHaveLength(1);
      expect(exceptions[0]?.providerEventId).toBeNull();
    });
  });
});
