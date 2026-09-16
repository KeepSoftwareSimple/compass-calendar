import { faker } from "@faker-js/faker";
import {
  type DateTime,
  type EventId,
  type TimeZone,
} from "@core/types/domain-primitives";
import { type Attendee } from "@core/types/event-attendance.contracts";
import { type SyncCommandInput } from "@core/types/sync/command.contracts";
import {
  type ConnectionId,
  type IdempotencyKey,
  type PrincipalId,
  type ProviderEventId,
  type TenantId,
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
import { executeProviderCreate } from "@sync/domain/provider-command.create";
import { type ProviderConnectionLookup } from "@sync/domain/provider-command.deps";
import { executeProviderOccurrenceUpdate } from "@sync/domain/provider-command.occurrence";
import { executeProviderSeriesFollowingUpdate } from "@sync/domain/provider-command.series-following";
import { executeProviderSeriesUpdate } from "@sync/domain/provider-command.series-update";
import { type ProviderEvent } from "@sync/providers/provider-event.port";
import { type ProviderEventWriter } from "@sync/providers/provider-event-writer.port";
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

let _mongo: SyncMongoService;
let commands: CommandRepository;
let events: EventRepository;
let occurrences: EventOccurrenceRepository;
let resources: SyncResourceRepository;
let calendars: ProviderCalendarRepository;
let _markers: DeletionMarkerRepository;
let _credentials: CredentialRepository;

beforeEach(() => {
  _mongo = repos.mongo;
  commands = repos.commands;
  events = repos.events;
  occurrences = repos.occurrences;
  resources = repos.resources;
  calendars = repos.calendars;
  _markers = repos.markers;
  _credentials = repos.credentials;
});

describe("attendeesEdit replace", () => {
  const OWNER = "owner@example.com";

  const schedule = {
    kind: "timed" as const,
    start: "2026-07-14T09:00:00-06:00" as DateTime,
    end: "2026-07-14T10:00:00-06:00" as DateTime,
    timeZone: "America/Denver" as TimeZone,
  };

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
    } = {},
  ) => ({
    title,
    description: "",
    location: null,
    organizer: opts.organizer ?? null,
    attendees: opts.attendees ?? [],
    conference: null,
  });

  const connectionsWith = (email: string | null): ProviderConnectionLookup => ({
    findById: async () => ({ account: { email }, provider: "google" }),
  });
  const _missingConnection: ProviderConnectionLookup = {
    findById: async () => null,
  };

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

  const seedLinked = async (opts: {
    organizer?: { email: string; displayName: string | null } | null;
    storedAttendees?: Attendee[];
    recurrence?: { kind: "seriesMaster"; rules: string[] };
  }) => {
    const ids = newCommandIds();
    const calendar = await seedCommandCalendar(calendars, ids);
    const event = await seedLinkedEvent(events, {
      ids,
      calendarId: calendar._id,
      content: contentWith("Old", {
        organizer: opts.organizer,
        attendees: opts.storedAttendees,
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

  const replaceCommand = async (
    event: EventRecord,
    opts: {
      title?: string;
      attendees: Attendee[];
      attendeesEdit?: "replace" | "preserve";
      scope?: string;
      recurrenceId?: string | null;
      recurrence?: unknown;
    },
  ) =>
    (
      await commands.submit({
        tenantId: event.tenantId,
        principalId: event.principalId,
        idempotencyKey: `idem-${objectId()}` as IdempotencyKey,
        eventId: event._id,
        input: {
          kind: "update",
          invitation: "all",
          attendeesEdit: opts.attendeesEdit ?? "replace",
          content: contentWith(opts.title ?? "Old", {
            attendees: opts.attendees,
          }),
          schedule,
          recurrence: opts.recurrence ?? { kind: "preserve" },
          scope: opts.scope ?? "all",
          recurrenceId: opts.recurrenceId ?? null,
        } as unknown as SyncCommandInput,
        expectedVersion: "etag-1" as never,
      })
    ).record;

  const providerSingle = (
    title: string,
    version: string,
    attendees: Attendee[],
  ): ProviderEvent => ({
    kind: "event",
    providerEventId: "g-evt-1" as ProviderEventId,
    providerVersion: version,
    providerUpdatedAt: null,
    content: contentWith(title, {
      organizer: { email: OWNER, displayName: null },
      attendees,
    }),
    schedule,
    busy: true,
    recurrence: { kind: "single" },
  });

  it("merges and patches the guest list on a series edit-all", async () => {
    const weekly4 = ["RRULE:FREQ=WEEKLY;COUNT=4"];
    const { tenantId, principalId, calendar, event } = await seedLinked({
      organizer: { email: OWNER, displayName: null },
      storedAttendees: [attendee("a@example.com")],
      recurrence: { kind: "seriesMaster", rules: weekly4 },
    });
    const command = await replaceCommand(event, {
      attendees: [attendee("a@example.com"), attendee("b@example.com")],
    });
    const writer = new FakeProviderEventWriter();
    writer.fetched = {
      ...providerSingle("Old", "etag-1", [
        attendee("a@example.com", "accepted"),
      ]),
      recurrence: { kind: "seriesMaster", rules: weekly4 },
    };

    const result = await executeProviderSeriesUpdate(
      deps(writer, connectionsWith(OWNER)),
      command,
      event,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("confirmed");
    expect(writer.patchCalls).toHaveLength(1);
    expect(writer.patchCalls[0]!.attendees).toEqual([
      attendee("a@example.com", "accepted"),
      attendee("b@example.com"),
    ]);
    const stored = await events.findById(tenantId, principalId, event._id);
    expect(stored?.content.attendees).toEqual([
      attendee("a@example.com", "accepted"),
      attendee("b@example.com"),
    ]);
  });

  it("fails a non-organizer series edit-all replace before any provider call", async () => {
    const { calendar, event } = await seedLinked({
      organizer: { email: "someone-else@example.com", displayName: null },
      recurrence: {
        kind: "seriesMaster",
        rules: ["RRULE:FREQ=WEEKLY;COUNT=4"],
      },
    });
    const command = await replaceCommand(event, {
      attendees: [attendee("a@example.com")],
    });
    const writer = new FakeProviderEventWriter();

    const result = await executeProviderSeriesUpdate(
      deps(writer, connectionsWith(OWNER)),
      command,
      event,
      calendar,
      now,
    );

    expect(result.outcome).toEqual({
      state: "failed",
      failureReason: "unsupportedCapability",
    });
    expect(writer.fetchCalls).toHaveLength(0);
    expect(writer.patchCalls).toHaveLength(0);
  });

  it("refuses a replace on a scope-this occurrence edit (whole-event only in v1)", async () => {
    const { calendar, event } = await seedLinked({
      organizer: { email: OWNER, displayName: null },
      recurrence: {
        kind: "seriesMaster",
        rules: ["RRULE:FREQ=WEEKLY;COUNT=4"],
      },
    });
    const command = await replaceCommand(event, {
      attendees: [attendee("a@example.com")],
      scope: "this",
      recurrenceId: "2026-07-21T15:00:00.000Z",
    });
    const writer = new FakeProviderEventWriter();

    const result = await executeProviderOccurrenceUpdate(
      deps(writer, connectionsWith(OWNER)),
      command,
      event,
      calendar,
      now,
    );

    expect(result.outcome).toEqual({
      state: "failed",
      failureReason: "unsupportedCapability",
    });
    expect(writer.patchCalls).toHaveLength(0);
  });

  it("refuses a replace on a thisAndFollowing split", async () => {
    const { tenantId, principalId, calendar, event } = await seedLinked({
      organizer: { email: OWNER, displayName: null },
      recurrence: {
        kind: "seriesMaster",
        rules: ["RRULE:FREQ=WEEKLY;COUNT=4"],
      },
    });
    const command = await replaceCommand(event, {
      attendees: [attendee("a@example.com")],
      scope: "thisAndFollowing",
      recurrenceId: "2026-07-21T15:00:00.000Z",
    });
    const writer = new FakeProviderEventWriter();

    const result = await executeProviderSeriesFollowingUpdate(
      deps(writer, connectionsWith(OWNER)),
      command,
      event,
      calendar,
      now,
    );

    expect(result.outcome).toEqual({
      state: "failed",
      failureReason: "unsupportedCapability",
    });
    expect(writer.patchCalls).toHaveLength(0);
    // Refused before the split touched anything: the master's rules are
    // untruncated.
    const stored = await events.findById(tenantId, principalId, event._id);
    expect(stored?.recurrence).toEqual({
      kind: "seriesMaster",
      rules: ["RRULE:FREQ=WEEKLY;COUNT=4"],
    });
  });

  it("emits every intended guest as needsAction on create and stores them", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const connectionId = objectId() as ConnectionId;
    const calendar = await seedCommandCalendar(calendars, {
      tenantId,
      principalId,
      connectionId,
    });
    const { record: command } = await commands.submit({
      tenantId,
      principalId,
      idempotencyKey: `idem-${objectId()}` as IdempotencyKey,
      eventId: objectId() as EventId,
      input: {
        kind: "create",
        calendarId: calendar._id,
        invitation: "all",
        attendeesEdit: "replace",
        // The command may carry stray statuses; a create normalizes every
        // guest to needsAction (nobody has answered a brand-new invitation).
        content: contentWith("Kickoff", {
          attendees: [
            attendee("a@example.com", "accepted", "Aye"),
            attendee("b@example.com"),
          ],
        }),
        schedule,
        recurrence: { kind: "single" },
      } as unknown as SyncCommandInput,
      expectedVersion: null,
    });
    const writer = new FakeProviderEventWriter();

    const result = await executeProviderCreate(
      deps(writer, connectionsWith(OWNER)),
      command,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("confirmed");
    const expected = [
      attendee("a@example.com", "needsAction", "Aye"),
      attendee("b@example.com"),
    ];
    expect(writer.calls).toHaveLength(1);
    expect(writer.calls[0]!.attendees).toEqual(expected);
    expect(writer.calls[0]!.invitation).toBe("all");
    const stored = await events.findById(
      tenantId,
      principalId,
      command.eventId,
    );
    expect(stored?.content.attendees).toEqual(expected);
  });

  it("keeps a legacy create byte-identical: no attendees on the provider write", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const connectionId = objectId() as ConnectionId;
    const calendar = await seedCommandCalendar(calendars, {
      tenantId,
      principalId,
      connectionId,
    });
    const { record: command } = await commands.submit({
      tenantId,
      principalId,
      idempotencyKey: `idem-${objectId()}` as IdempotencyKey,
      eventId: objectId() as EventId,
      // No attendeesEdit: the schema defaults it to "preserve" (legacy).
      input: {
        kind: "create",
        calendarId: calendar._id,
        invitation: "none",
        content: contentWith("Plain"),
        schedule,
        recurrence: { kind: "single" },
      } as unknown as SyncCommandInput,
      expectedVersion: null,
    });
    const writer = new FakeProviderEventWriter();

    const result = await executeProviderCreate(
      deps(writer, connectionsWith(OWNER)),
      command,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("confirmed");
    expect(command.input.kind === "create" && command.input.attendeesEdit).toBe(
      "preserve",
    );
    expect(writer.calls[0]).not.toHaveProperty("attendees");
  });
});

// WP-07: rsvp command execution — rewrite ONLY the self attendee entry
// (matched case-insensitively by the connection's account email) against
// freshly fetched provider state, patch the full merged list with
// sendUpdates "none", target the master for scope "all" and the resolved
// Google instance for scope "this", replay without a second write, and fail
// typed (unsupportedCapability) on every guard.
