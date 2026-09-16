import { faker } from "@faker-js/faker";
import { type DateTime, type TimeZone } from "@core/types/domain-primitives";
import { type Attendee } from "@core/types/event-attendance.contracts";
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
import { executeProviderUpdate } from "@sync/domain/provider-command.update";
import { type ProviderEvent } from "@sync/providers/provider-event.port";
import {
  type ProviderEventWriter,
  ProviderWriteError,
} from "@sync/providers/provider-event-writer.port";
import { findSafetyCanaryHit } from "@sync/safety/safety-canary";
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
  const missingConnection: ProviderConnectionLookup = {
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

  it("merges the intent against freshly fetched provider state and patches the full set", async () => {
    // Acceptance "Normal": add one attendee to an event with three existing.
    // The stored record is STALE (everyone needsAction); the provider copy has
    // newer RSVPs that must survive the replace.
    const { tenantId, principalId, calendar, event } = await seedLinked({
      organizer: { email: OWNER, displayName: null },
      storedAttendees: [
        attendee("a@example.com"),
        attendee("b@example.com"),
        attendee("c@example.com"),
      ],
    });
    const command = await replaceCommand(event, {
      attendees: [
        attendee("a@example.com"),
        attendee("b@example.com"),
        attendee("c@example.com"),
        attendee("d@example.com", "needsAction", "Dee"),
      ],
    });
    const writer = new FakeProviderEventWriter();
    writer.fetched = providerSingle("Old", "etag-1", [
      attendee("a@example.com", "accepted"),
      attendee("b@example.com", "needsAction"),
      attendee("c@example.com", "declined", "Cee"),
    ]);

    const result = await executeProviderUpdate(
      // Case-insensitive: the connection reports the account email cased
      // differently than the stored organizer.
      deps(writer, connectionsWith("Owner@Example.COM")),
      command,
      event,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("confirmed");
    const expectedMerged = [
      attendee("a@example.com", "accepted"),
      attendee("b@example.com", "needsAction"),
      attendee("c@example.com", "declined", "Cee"),
      attendee("d@example.com", "needsAction", "Dee"),
    ];
    expect(writer.patchCalls).toHaveLength(1);
    expect(writer.patchCalls[0]!.attendees).toEqual(expectedMerged);
    expect(writer.patchCalls[0]!.invitation).toBe("all");
    // The merged membership lands on the sync record at confirm, so reads
    // reflect it before the next Google round-trip.
    const stored = await events.findById(tenantId, principalId, event._id);
    expect(stored?.content.attendees).toEqual(expectedMerged);
  });

  it("replaces with an empty set to remove every guest", async () => {
    const { tenantId, principalId, calendar, event } = await seedLinked({
      organizer: { email: OWNER, displayName: null },
      storedAttendees: [attendee("a@example.com", "accepted")],
    });
    const command = await replaceCommand(event, { attendees: [] });
    const writer = new FakeProviderEventWriter();
    writer.fetched = providerSingle("Old", "etag-1", [
      attendee("a@example.com", "accepted"),
    ]);

    const result = await executeProviderUpdate(
      deps(writer, connectionsWith(OWNER)),
      command,
      event,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("confirmed");
    expect(writer.patchCalls[0]!.attendees).toEqual([]);
    const stored = await events.findById(tenantId, principalId, event._id);
    expect(stored?.content.attendees).toEqual([]);
  });

  it("fails a non-organizer replace typed, before any provider call", async () => {
    const { calendar, event } = await seedLinked({
      organizer: { email: "someone-else@example.com", displayName: null },
      storedAttendees: [attendee("a@example.com", "accepted")],
    });
    const command = await replaceCommand(event, {
      attendees: [attendee("a@example.com"), attendee("b@example.com")],
    });
    const writer = new FakeProviderEventWriter();

    const result = await executeProviderUpdate(
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
    // No provider call of any kind — not even the replay-detection fetch.
    expect(writer.fetchCalls).toHaveLength(0);
    expect(writer.patchCalls).toHaveLength(0);
    // The failure surface the command route logs from (and the SSE notices
    // derive from) carries no attendee JSON or event content.
    expect(findSafetyCanaryHit(result.outcome)).toBeNull();
    expect(
      findSafetyCanaryHit(
        `Command ${result._id} (${result.input.kind} ${result.eventId}) failed: ${
          result.outcome.state === "failed" && result.outcome.failureReason
        }`,
      ),
    ).toBeNull();
  });

  it("fails closed when the connection cannot be resolved", async () => {
    const { calendar, event } = await seedLinked({
      organizer: { email: OWNER, displayName: null },
    });
    const command = await replaceCommand(event, {
      attendees: [attendee("a@example.com")],
    });
    const writer = new FakeProviderEventWriter();

    const result = await executeProviderUpdate(
      deps(writer, missingConnection),
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
  });

  it("allows a replace when no organizer is stored yet", async () => {
    // A Compass-created event that has never had guests carries no organizer;
    // the connection's own account organizes it.
    const { calendar, event } = await seedLinked({ organizer: null });
    const command = await replaceCommand(event, {
      attendees: [attendee("a@example.com")],
    });
    const writer = new FakeProviderEventWriter();
    writer.fetched = providerSingle("Old", "etag-1", []);

    const result = await executeProviderUpdate(
      deps(writer, connectionsWith(OWNER)),
      command,
      event,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("confirmed");
    expect(writer.patchCalls[0]!.attendees).toEqual([
      attendee("a@example.com"),
    ]);
  });

  it("confirms a landed attendee-only edit on replay — email sets, order- and status-insensitive", async () => {
    const { calendar, event } = await seedLinked({
      organizer: { email: OWNER, displayName: null },
      storedAttendees: [attendee("a@example.com")],
    });
    const command = await replaceCommand(event, {
      attendees: [attendee("a@example.com"), attendee("b@example.com")],
    });
    const writer = new FakeProviderEventWriter();
    // The prior attempt landed; since then the provider reordered the list
    // and one guest RSVP'd. Same membership => replay, never a second write.
    writer.fetched = providerSingle("Old", "etag-7", [
      attendee("b@example.com", "accepted"),
      attendee("A@Example.com", "declined"),
    ]);

    const result = await executeProviderUpdate(
      deps(writer, connectionsWith(OWNER)),
      command,
      event,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("confirmed");
    expect(writer.patchCalls).toHaveLength(0);
    expect(
      result.outcome.state === "confirmed" && result.outcome.providerVersion,
    ).toBe("etag-7" as ProviderEventVersion);
  });

  it("still patches when the landed membership differs from the intent", async () => {
    const { calendar, event } = await seedLinked({
      organizer: { email: OWNER, displayName: null },
    });
    const command = await replaceCommand(event, {
      attendees: [attendee("a@example.com"), attendee("b@example.com")],
    });
    const writer = new FakeProviderEventWriter();
    writer.fetched = providerSingle("Old", "etag-1", [
      attendee("a@example.com", "accepted"),
      attendee("c@example.com", "accepted"),
    ]);

    const result = await executeProviderUpdate(
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
  });

  it("keeps a preserve command byte-identical: no attendees on the patch, stored list untouched", async () => {
    const storedAttendees = [attendee("kept@example.com", "accepted")];
    const { tenantId, principalId, calendar, event } = await seedLinked({
      organizer: { email: OWNER, displayName: null },
      storedAttendees,
    });
    // The browser echoes full content on legacy updates — attendees included —
    // but "preserve" must not turn that into a guest write.
    const command = await replaceCommand(event, {
      title: "Renamed",
      attendees: [attendee("stray@example.com")],
      attendeesEdit: "preserve",
    });
    const writer = new FakeProviderEventWriter();
    writer.fetched = providerSingle("Old", "etag-1", [
      attendee("kept@example.com", "accepted"),
      attendee("provider-only@example.com", "tentative"),
    ]);

    const result = await executeProviderUpdate(
      deps(writer, connectionsWith(OWNER)),
      command,
      event,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("confirmed");
    expect(writer.patchCalls).toHaveLength(1);
    expect(writer.patchCalls[0]).not.toHaveProperty("attendees");
    expect(writer.patchCalls[0]!.content.attendees).toEqual(storedAttendees);
    // The stored record keeps its own attendee list (mergeUpdateContent), not
    // the command's echoed one.
    const stored = await events.findById(tenantId, principalId, event._id);
    expect(stored?.content.attendees).toEqual(storedAttendees);
    expect(stored?.content.title).toBe("Renamed");
  });

  it("leaves a replace pending on a transient fetch failure, with no patch", async () => {
    // Acceptance "Tool failure": the provider fetch fails transiently.
    const { calendar, event } = await seedLinked({
      organizer: { email: OWNER, displayName: null },
    });
    const command = await replaceCommand(event, {
      attendees: [attendee("a@example.com")],
    });
    const writer = new FakeProviderEventWriter();
    writer.fetchError = new ProviderWriteError("transient", "blip");

    const result = await executeProviderUpdate(
      deps(writer, connectionsWith(OWNER)),
      command,
      event,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("pending");
    expect(writer.patchCalls).toHaveLength(0);
  });
});
