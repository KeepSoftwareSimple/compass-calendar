import { faker } from "@faker-js/faker";
import { type DateTime, type TimeZone } from "@core/types/domain-primitives";
import { type Attendee } from "@core/types/event-attendance.contracts";
import { type EventColorSlot } from "@core/types/event-color.contracts";
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
  seedCommandCalendar,
  seedLinkedEvent,
  tokenSource,
} from "@sync/__tests__/helpers/command-scenario";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { type ProviderConnectionLookup } from "@sync/domain/provider-command.deps";
import { executeProviderRsvp } from "@sync/domain/provider-command.rsvp";
import { type ProviderEvent } from "@sync/providers/provider-event.port";
import { type ProviderEventWriter } from "@sync/providers/provider-event-writer.port";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";
import { type CommandRepository } from "@sync/storage/repositories/command.repository";
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

beforeEach(() => {
  mongo = repos.mongo;
  commands = repos.commands;
  events = repos.events;
  occurrences = repos.occurrences;
  resources = repos.resources;
  calendars = repos.calendars;
});

describe("executeProviderRsvp", () => {
  const SELF = "self@example.com";

  const schedule = {
    kind: "timed" as const,
    start: "2026-07-14T09:00:00-06:00" as DateTime,
    end: "2026-07-14T10:00:00-06:00" as DateTime,
    timeZone: "America/Denver" as TimeZone,
  };
  const weekly3 = ["RRULE:FREQ=WEEKLY;COUNT=3"];
  const SECOND_START_UTC = "2026-07-21T15:00:00.000Z";

  const attendee = (
    email: string,
    responseStatus: Attendee["responseStatus"] = "needsAction",
    displayName: string | null = null,
  ): Attendee => ({ email, displayName, responseStatus });

  const contentWith = (
    title: string,
    opts: {
      organizer?: { email: string; displayName: string | null } | null;
      attendees?: Attendee[];
      color?: EventColorSlot;
    } = {},
  ) => ({
    title,
    description: "",
    location: null,
    organizer: opts.organizer ?? null,
    attendees: opts.attendees ?? [],
    conference: null,
    ...(opts.color ? { color: opts.color } : {}),
  });

  const connectionsWith = (email: string | null): ProviderConnectionLookup => ({
    findById: async () => ({ account: { email }, provider: "google" }),
  });

  const deps = (
    writer: ProviderEventWriter,
    connections: ProviderConnectionLookup,
  ) => ({
    commands,
    events,
    occurrences,
    resources,
    connections,
    writer,
    custody: tokenSource(),
  });

  const seedLinked = async (
    opts: {
      organizer?: { email: string; displayName: string | null } | null;
      storedAttendees?: Attendee[];
      recurrence?: { kind: "seriesMaster"; rules: string[] };
    } = {},
  ) => {
    const ids = newCommandIds();
    const calendar = await seedCommandCalendar(calendars, ids);
    const event = await seedLinkedEvent(events, {
      ids,
      calendarId: calendar._id,
      content: contentWith("Invited", {
        organizer: opts.organizer ?? {
          email: "organizer@example.com",
          displayName: null,
        },
        attendees: opts.storedAttendees ?? [
          attendee("organizer@example.com", "accepted"),
          attendee(SELF, "accepted"),
        ],
      }),
      schedule,
      recurrence: opts.recurrence ?? { kind: "single" },
      now: now(),
    });
    return {
      tenantId: ids.tenantId,
      principalId: ids.principalId,
      calendar,
      event,
    };
  };

  const rsvpCommand = async (
    event: EventRecord,
    opts: {
      responseStatus?: "accepted" | "declined" | "tentative";
      scope?: string;
      recurrenceId?: string | null;
    } = {},
  ) =>
    (
      await commands.submit({
        tenantId: event.tenantId,
        principalId: event.principalId,
        idempotencyKey: `idem-${objectId()}` as IdempotencyKey,
        eventId: event._id,
        input: {
          kind: "rsvp",
          responseStatus: opts.responseStatus ?? "declined",
          scope: opts.scope ?? "all",
          recurrenceId: opts.recurrenceId ?? null,
        } as unknown as SyncCommandInput,
        expectedVersion: null,
      })
    ).record;

  const providerSingle = (
    version: string,
    attendees: Attendee[],
    opts: { color?: EventColorSlot } = {},
  ): ProviderEvent => ({
    kind: "event",
    providerEventId: "g-evt-1" as ProviderEventId,
    providerVersion: version,
    providerUpdatedAt: null,
    content: contentWith("Invited", {
      organizer: { email: "organizer@example.com", displayName: null },
      attendees,
      color: opts.color,
    }) as ProviderEvent["content"],
    schedule,
    busy: true,
    recurrence: { kind: "single" },
  });

  const providerInstance = (attendees: Attendee[]): ProviderEvent => ({
    kind: "event",
    providerEventId: "g-inst-1" as ProviderEventId,
    providerVersion: "etag-inst-1",
    providerUpdatedAt: null,
    content: contentWith("Invited", {
      organizer: { email: "organizer@example.com", displayName: null },
      attendees,
    }) as ProviderEvent["content"],
    schedule: {
      kind: "timed",
      start: "2026-07-21T09:00:00-06:00" as DateTime,
      end: "2026-07-21T10:00:00-06:00" as DateTime,
      timeZone: "America/Denver" as TimeZone,
    },
    busy: true,
    recurrence: {
      kind: "instance",
      seriesProviderId: "g-evt-1",
      recurrenceId: SECOND_START_UTC,
    },
  });

  it("patches the resolved Google instance on a scope-this rsvp, leaving the master untouched", async () => {
    // Acceptance "Normal": declined on ONE occurrence leaves the master and
    // sibling occurrences untouched. The instance id comes from the writer's
    // own fetchInstanceAt resolution — never hand-built.
    const { tenantId, principalId, calendar, event } = await seedLinked({
      recurrence: { kind: "seriesMaster", rules: weekly3 },
    });
    const command = await rsvpCommand(event, {
      responseStatus: "declined",
      scope: "this",
      recurrenceId: SECOND_START_UTC,
    });
    const writer = new FakeProviderEventWriter();
    writer.fetchInstanceResult = providerInstance([
      attendee("organizer@example.com", "accepted"),
      attendee(SELF, "accepted"),
    ]);
    writer.patchResult = {
      providerEventId: "g-inst-1" as ProviderEventId,
      providerVersion: "etag-inst-2",
    };

    const result = await executeProviderRsvp(
      deps(writer, connectionsWith(SELF)),
      command,
      event,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("confirmed");
    // The occurrence was resolved off the series via fetchInstanceAt, by the
    // master's provider id and the occurrence's original start.
    expect(writer.fetchInstanceCalls).toHaveLength(1);
    expect(writer.fetchInstanceCalls[0]).toMatchObject({
      calendarId: calendar.providerCalendarId,
      seriesProviderEventId: "g-evt-1",
      originalStartAt: SECOND_START_UTC,
      scheduleKind: "timed",
    });
    // The master itself was never fetched and never patched: the single
    // patch targets the RESOLVED instance id, with no recurrence key.
    expect(writer.fetchEventCalls).toHaveLength(0);
    expect(writer.patchCalls).toHaveLength(1);
    expect(writer.patchCalls[0]!.providerEventId).toBe("g-inst-1");
    expect(writer.patchCalls[0]!.recurrence).toEqual({ kind: "instance" });
    expect(writer.patchCalls[0]!.invitation).toBe("none");
    expect(writer.patchCalls[0]!.attendees).toEqual([
      attendee("organizer@example.com", "accepted"),
      attendee(SELF, "declined"),
    ]);

    // Locally: the master's stored guest list is untouched; the answer lives
    // on the instance's exception record, carrying the instance's own
    // provider identity.
    const master = await events.findById(tenantId, principalId, event._id);
    expect(master?.content.attendees).toEqual([
      attendee("organizer@example.com", "accepted"),
      attendee(SELF, "accepted"),
    ]);
    expect(master?.providerVersion).toBe("etag-1" as ProviderEventVersion);
    const exceptions = await events.findSeriesExceptions(
      tenantId,
      principalId,
      event._id,
    );
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0]?.providerEventId).toBe("g-inst-1" as ProviderEventId);
    expect(exceptions[0]?.providerVersion).toBe(
      "etag-inst-2" as ProviderEventVersion,
    );
    expect(exceptions[0]?.content.attendees).toEqual([
      attendee("organizer@example.com", "accepted"),
      attendee(SELF, "declined"),
    ]);

    // Sibling occurrences are untouched: the master still projects 07-14 and
    // 07-28, and the answered instant projects from the exception.
    const masterRows = await mongo.db
      .collection(SYNC_COLLECTIONS.eventOccurrences)
      .find({ eventId: event._id })
      .toArray();
    expect(
      masterRows.map((row) => (row["startAt"] as Date).toISOString()).sort(),
    ).toEqual(["2026-07-14T15:00:00.000Z", "2026-07-28T15:00:00.000Z"]);
    const exceptionRows = await mongo.db
      .collection(SYNC_COLLECTIONS.eventOccurrences)
      .find({ eventId: exceptions[0]?._id })
      .toArray();
    expect(
      exceptionRows.map((row) => (row["startAt"] as Date).toISOString()),
    ).toEqual([SECOND_START_UTC]);
  });

  it("patches the series master on a scope-all rsvp, never resolving an instance", async () => {
    // The other half of the targeting proof: "all events" answers on the
    // master itself.
    const { tenantId, principalId, calendar, event } = await seedLinked({
      recurrence: { kind: "seriesMaster", rules: weekly3 },
    });
    const command = await rsvpCommand(event, { responseStatus: "declined" });
    const writer = new FakeProviderEventWriter();
    writer.fetchEventResult = {
      ...providerSingle("etag-1", [
        attendee("organizer@example.com", "accepted"),
        attendee(SELF, "accepted"),
      ]),
      recurrence: { kind: "seriesMaster", rules: weekly3 },
    };
    writer.patchResult = {
      providerEventId: "g-evt-1" as ProviderEventId,
      providerVersion: "etag-2",
    };

    const result = await executeProviderRsvp(
      deps(writer, connectionsWith(SELF)),
      command,
      event,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("confirmed");
    expect(writer.fetchInstanceCalls).toHaveLength(0);
    expect(writer.fetchEventCalls).toHaveLength(1);
    expect(writer.patchCalls).toHaveLength(1);
    expect(writer.patchCalls[0]!.providerEventId).toBe("g-evt-1");
    // The master's own current rules are re-written unchanged
    // (self-describing), mirroring how a "preserve" series edit writes.
    expect(writer.patchCalls[0]!.recurrence).toEqual({
      kind: "series",
      rules: weekly3,
    });
    expect(writer.patchCalls[0]!.attendees).toEqual([
      attendee("organizer@example.com", "accepted"),
      attendee(SELF, "declined"),
    ]);
    const master = await events.findById(tenantId, principalId, event._id);
    expect(master?.content.attendees).toEqual([
      attendee("organizer@example.com", "accepted"),
      attendee(SELF, "declined"),
    ]);
  });

  it("keeps a scope-all rsvp from resurrecting a cancelled occurrence", async () => {
    // The commit reprojects through reprojectMaster, so a previously deleted
    // occurrence's instant stays excluded.
    const { calendar, event } = await seedLinked({
      recurrence: { kind: "seriesMaster", rules: weekly3 },
    });
    await events.upsertException(
      event,
      SECOND_START_UTC as never,
      {
        content: event.content,
        schedule,
        cancelled: true,
        providerIdentity: null,
      },
      now(),
    );
    const command = await rsvpCommand(event, { responseStatus: "declined" });
    const writer = new FakeProviderEventWriter();
    writer.fetchEventResult = {
      ...providerSingle("etag-1", [attendee(SELF, "accepted")]),
      recurrence: { kind: "seriesMaster", rules: weekly3 },
    };

    const result = await executeProviderRsvp(
      deps(writer, connectionsWith(SELF)),
      command,
      event,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("confirmed");
    const masterRows = await mongo.db
      .collection(SYNC_COLLECTIONS.eventOccurrences)
      .find({ eventId: event._id })
      .toArray();
    expect(
      masterRows.map((row) => (row["startAt"] as Date).toISOString()).sort(),
    ).toEqual(["2026-07-14T15:00:00.000Z", "2026-07-28T15:00:00.000Z"]);
  });

  it("confirms a scope-this replay without a second write when the instance already holds the answer", async () => {
    const { tenantId, principalId, calendar, event } = await seedLinked({
      recurrence: { kind: "seriesMaster", rules: weekly3 },
    });
    const command = await rsvpCommand(event, {
      responseStatus: "declined",
      scope: "this",
      recurrenceId: SECOND_START_UTC,
    });
    const writer = new FakeProviderEventWriter();
    writer.fetchInstanceResult = providerInstance([attendee(SELF, "declined")]);

    const result = await executeProviderRsvp(
      deps(writer, connectionsWith(SELF)),
      command,
      event,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("confirmed");
    expect(writer.patchCalls).toHaveLength(0);
    expect(
      result.outcome.state === "confirmed" && result.outcome.providerVersion,
    ).toBe("etag-inst-1" as ProviderEventVersion);
    // The already-landed answer still converges locally onto the exception.
    const exceptions = await events.findSeriesExceptions(
      tenantId,
      principalId,
      event._id,
    );
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0]?.content.attendees).toEqual([
      attendee(SELF, "declined"),
    ]);
  });
});
