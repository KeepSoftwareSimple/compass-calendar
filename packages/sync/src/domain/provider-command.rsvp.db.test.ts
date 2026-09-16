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

describe("executeProviderRsvp", () => {
  const SELF = "self@example.com";

  const schedule = {
    kind: "timed" as const,
    start: "2026-07-14T09:00:00-06:00" as DateTime,
    end: "2026-07-14T10:00:00-06:00" as DateTime,
    timeZone: "America/Denver" as TimeZone,
  };
  const _weekly3 = ["RRULE:FREQ=WEEKLY;COUNT=3"];
  const _SECOND_START_UTC = "2026-07-21T15:00:00.000Z";

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

  it("rewrites only the self entry (case-insensitive) and patches the full list with sendUpdates none", async () => {
    // Acceptance "Normal": accepted → declined on a single event. The
    // account email is cased differently than the provider's entry, and the
    // provider list carries fresher sibling RSVPs than the stored copy.
    const { tenantId, principalId, calendar, event } = await seedLinked();
    const command = await rsvpCommand(event, { responseStatus: "declined" });
    const writer = new FakeProviderEventWriter();
    const fetchedList = [
      attendee("organizer@example.com", "accepted", "Org"),
      attendee("Self@Example.COM", "accepted"),
      attendee("other@example.com", "tentative", "Oth"),
    ];
    writer.fetched = providerSingle("etag-1", fetchedList, { color: "coral" });

    const result = await executeProviderRsvp(
      deps(writer, connectionsWith(SELF)),
      command,
      event,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("confirmed");
    expect(writer.patchCalls).toHaveLength(1);
    const patch = writer.patchCalls[0];
    // The full merged list rides the attendee body emission: only the self
    // entry's responseStatus changed; every other entry — and the self
    // entry's own email casing and displayName — is byte-identical to the
    // freshly fetched provider state.
    expect(patch!.attendees).toEqual([
      attendee("organizer@example.com", "accepted", "Org"),
      attendee("Self@Example.COM", "declined"),
      attendee("other@example.com", "tentative", "Oth"),
    ]);
    expect(patch!.attendees?.[0]).toEqual(fetchedList[0] as Attendee);
    expect(patch!.attendees?.[2]).toEqual(fetchedList[2] as Attendee);
    // Never emails the guest list, and never conditions on a version: a
    // concurrent sibling RSVP must not block this one.
    expect(patch!.invitation).toBe("none");
    expect(patch!.expectedVersion).toBeNull();
    expect(patch!.providerEventId).toBe("g-evt-1");
    // The echoed body carries the fetched content minus color/colorHex, so
    // the patch cannot touch Google's color or label state.
    expect(patch!.content.title).toBe("Invited");
    expect(patch!.content).not.toHaveProperty("color");
    expect(patch!.content).not.toHaveProperty("colorHex");

    // The answer lands on the stored record before the next Google
    // round-trip.
    const stored = await events.findById(tenantId, principalId, event._id);
    expect(stored?.content.attendees).toEqual([
      attendee("organizer@example.com", "accepted", "Org"),
      attendee("Self@Example.COM", "declined"),
      attendee("other@example.com", "tentative", "Oth"),
    ]);
    expect(stored?.providerVersion).toBe("etag-2" as ProviderEventVersion);
    expect(
      result.outcome.state === "confirmed" && result.outcome.providerVersion,
    ).toBe("etag-2" as ProviderEventVersion);
  });

  it("confirms a replay without a second write when the provider already holds the answer", async () => {
    const { calendar, event } = await seedLinked();
    const command = await rsvpCommand(event, { responseStatus: "tentative" });
    const writer = new FakeProviderEventWriter();
    // The prior attempt landed (or the user answered from another client).
    writer.fetched = providerSingle("etag-7", [
      attendee("organizer@example.com", "accepted"),
      attendee(SELF, "tentative"),
    ]);

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
    ).toBe("etag-7" as ProviderEventVersion);
  });

  it("allows the organizer to RSVP their own event", async () => {
    // Finish line 4: no organizer guard here — Google lists the organizer as
    // an attendee of their own event, and answering it is theirs to do.
    const { calendar, event } = await seedLinked({
      organizer: { email: SELF, displayName: null },
      storedAttendees: [
        attendee(SELF, "accepted"),
        attendee("guest@example.com", "needsAction"),
      ],
    });
    const command = await rsvpCommand(event, { responseStatus: "tentative" });
    const writer = new FakeProviderEventWriter();
    writer.fetched = providerSingle("etag-1", [
      attendee(SELF, "accepted"),
      attendee("guest@example.com", "needsAction"),
    ]);

    const result = await executeProviderRsvp(
      deps(writer, connectionsWith(SELF)),
      command,
      event,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("confirmed");
    expect(writer.patchCalls[0]!.attendees).toEqual([
      attendee(SELF, "tentative"),
      attendee("guest@example.com", "needsAction"),
    ]);
  });

  it("fails typed when the account is not in the stored guest list, with no provider call", async () => {
    // Acceptance "Policy": self not an attendee → unsupportedCapability
    // BEFORE any provider call, and no attendee JSON anywhere the route
    // logs from.
    const { calendar, event } = await seedLinked({
      storedAttendees: [
        attendee("organizer@example.com", "accepted"),
        attendee("someone-else@example.com", "needsAction"),
      ],
    });
    const command = await rsvpCommand(event);
    const writer = new FakeProviderEventWriter();

    const result = await executeProviderRsvp(
      deps(writer, connectionsWith(SELF)),
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
    const { calendar, event } = await seedLinked();
    const command = await rsvpCommand(event);
    const writer = new FakeProviderEventWriter();

    const result = await executeProviderRsvp(
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

  it("fails closed when the connection has no account email", async () => {
    const { calendar, event } = await seedLinked();
    const command = await rsvpCommand(event);
    const writer = new FakeProviderEventWriter();

    const result = await executeProviderRsvp(
      deps(writer, connectionsWith(null)),
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

  it("fails typed when the provider no longer lists the account, without writing", async () => {
    // The stored list still has SELF, but the fetched state does not
    // (uninvited provider-side since the last pull): same typed refusal,
    // discovered after the fetch — never a write.
    const { calendar, event } = await seedLinked();
    const command = await rsvpCommand(event);
    const writer = new FakeProviderEventWriter();
    writer.fetched = providerSingle("etag-3", [
      attendee("organizer@example.com", "accepted"),
    ]);

    const result = await executeProviderRsvp(
      deps(writer, connectionsWith(SELF)),
      command,
      event,
      calendar,
      now,
    );

    expect(result.outcome).toEqual({
      state: "failed",
      failureReason: "unsupportedCapability",
    });
    expect(writer.fetchCalls).toHaveLength(1);
    expect(writer.patchCalls).toHaveLength(0);
  });

  it("leaves the command pending on a transient fetch failure, with no patch", async () => {
    // Acceptance "Tool failure": fetch 5xx → the command stays retryable.
    const { calendar, event } = await seedLinked();
    const command = await rsvpCommand(event);
    const writer = new FakeProviderEventWriter();
    writer.fetchError = new ProviderWriteError("transient", "blip");

    const result = await executeProviderRsvp(
      deps(writer, connectionsWith(SELF)),
      command,
      event,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("pending");
    expect(writer.patchCalls).toHaveLength(0);
  });

  it("fails permanently when nothing live exists to answer", async () => {
    const { calendar, event } = await seedLinked();
    const command = await rsvpCommand(event);
    const writer = new FakeProviderEventWriter();
    writer.fetched = null;

    const result = await executeProviderRsvp(
      deps(writer, connectionsWith(SELF)),
      command,
      event,
      calendar,
      now,
    );

    expect(result.outcome).toEqual({
      state: "failed",
      failureReason: "permanentProviderError",
    });
    expect(writer.patchCalls).toHaveLength(0);
  });
});
