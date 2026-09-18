import { type DateTime, type TimeZone } from "@core/types/domain-primitives";
import { type SyncCommandInput } from "@core/types/sync/command.contracts";
import { type ProviderEventVersion } from "@core/types/sync/event.contracts";
import { type ProviderEventId } from "@core/types/sync/identity.contracts";
import {
  bindCommandRepos,
  COMMAND_NOW,
  FakeProviderEventWriter,
  failingTokenSource,
  newCommandIds,
  providerMutationDeps,
  RevokedAuthAdapter,
  seedCommandCalendar,
  seedLinkedEvent,
  storeCommandCredential,
  stubConnectionLookup,
  TEST_CREDENTIAL_ENCRYPTION_KEY,
  tokenSource,
} from "@sync/__tests__/helpers/command-scenario";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { CredentialCustody } from "@sync/credentials/credential-custody.service";
import { executeProviderUpdate } from "@sync/domain/provider-command.update";
import { ProviderAuthError } from "@sync/providers/provider-auth.port";
import { type ProviderEvent } from "@sync/providers/provider-event.port";
import { ProviderWriteError } from "@sync/providers/provider-event-writer.port";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import { type CommandRepository } from "@sync/storage/repositories/command.repository";
import { type CredentialRepository } from "@sync/storage/repositories/credential.repository";
import { type EventRepository } from "@sync/storage/repositories/event.repository";
import { type EventOccurrenceRepository } from "@sync/storage/repositories/event-occurrence.repository";
import { type ProviderCalendarRepository } from "@sync/storage/repositories/provider-calendar.repository";
import { type SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";
import { type SyncMongoService } from "@sync/storage/sync-mongo.service";
import { beforeEach, describe, expect, it } from "bun:test";

const storage = setupSyncStorage(import.meta.url);
const repos = bindCommandRepos(storage);
const now = COMMAND_NOW;

let mongo: SyncMongoService;
let commands: CommandRepository;
let events: EventRepository;
let occurrences: EventOccurrenceRepository;
let resources: SyncResourceRepository;
let calendars: ProviderCalendarRepository;
let credentials: CredentialRepository;

beforeEach(() => {
  mongo = repos.mongo;
  commands = repos.commands;
  events = repos.events;
  occurrences = repos.occurrences;
  resources = repos.resources;
  calendars = repos.calendars;
  credentials = repos.credentials;
});

describe("executeProviderUpdate", () => {
  const schedule = {
    kind: "timed" as const,
    start: "2026-07-14T09:00:00-06:00" as DateTime,
    end: "2026-07-14T10:00:00-06:00" as DateTime,
    timeZone: "America/Denver" as TimeZone,
  };
  const content = (title: string) => ({
    title,
    description: "",
    location: null,
    organizer: null,
    attendees: [],
    conference: null,
  });
  const providerEvent = (title: string, version: string): ProviderEvent => ({
    kind: "event",
    providerEventId: "g-evt-1" as ProviderEventId,
    providerVersion: version,
    providerUpdatedAt: null,
    content: content(title),
    schedule,
    busy: true,
    recurrence: { kind: "single" },
  });

  // Seed a provider-linked event plus an update command that renames it to
  // "New". The provider currently holds "Old" at etag-1.
  const seed = async () => {
    const ids = newCommandIds();
    const calendar = await seedCommandCalendar(calendars, ids);
    const event = await seedLinkedEvent(events, {
      ids,
      calendarId: calendar._id,
      content: content("Old"),
      schedule,
      recurrence: { kind: "single" },
      now: now(),
    });
    const { record: command } = await commands.submit({
      tenantId: ids.tenantId,
      principalId: ids.principalId,
      idempotencyKey: ids.idempotencyKey,
      eventId: event._id,
      input: {
        kind: "update",
        invitation: "all",
        content: content("New"),
        schedule,
        recurrence: { kind: "preserve" },
        scope: "all",
      } as unknown as SyncCommandInput,
      expectedVersion: "etag-1" as never,
    });
    return {
      tenantId: ids.tenantId,
      principalId: ids.principalId,
      calendar,
      event,
      command,
    };
  };

  it("patches the provider and commits the new version and content", async () => {
    const { tenantId, principalId, calendar, event, command } = await seed();
    const writer = new FakeProviderEventWriter();
    // The provider still holds the old content, so this is a real edit.
    writer.fetched = providerEvent("Old", "etag-1");

    const result = await executeProviderUpdate(
      {
        commands,
        events,
        occurrences,
        resources,
        connections: stubConnectionLookup(),
        writer,
        custody: tokenSource(),
      },
      command,
      event,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("confirmed");
    expect(writer.patchCalls).toHaveLength(1);
    expect(writer.patchCalls[0]!.expectedVersion).toBe("etag-1");
    expect(writer.patchCalls[0]!.invitation).toBe("all");
    const stored = await events.findById(tenantId, principalId, event._id);
    expect(stored?.content.title).toBe("New");
    expect(stored?.providerVersion).toBe("etag-2" as ProviderEventVersion);

    // The occurrence projection is rebuilt with the edited title.
    const occ = await mongo.db
      .collection(SYNC_COLLECTIONS.eventOccurrences)
      .find({ eventId: event._id })
      .toArray();
    expect(occ).toHaveLength(1);
    expect(occ[0]?.["title"]).toBe("New");
  });

  it("confirms without re-patching when the edit already landed (replay)", async () => {
    const { tenantId, principalId, calendar, event, command } = await seed();
    const writer = new FakeProviderEventWriter();
    // The provider already holds this command's intended content at a new
    // version — a prior attempt landed before the crash.
    writer.fetched = providerEvent("New", "etag-2");

    const result = await executeProviderUpdate(
      {
        commands,
        events,
        occurrences,
        resources,
        connections: stubConnectionLookup(),
        writer,
        custody: tokenSource(),
      },
      command,
      event,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("confirmed");
    // No second write — the replay is recognized from the fetch.
    expect(writer.patchCalls).toHaveLength(0);
    const stored = await events.findById(tenantId, principalId, event._id);
    expect(stored?.providerVersion).toBe("etag-2" as ProviderEventVersion);
  });

  it("recognizes a replay even when read-reflected fields drifted", async () => {
    const { calendar, event, command } = await seed();
    const writer = new FakeProviderEventWriter();
    // The written fields (title/description/location/schedule) match this
    // command's edit, but an attendee RSVP'd after our patch landed — a field
    // the patch never writes. This must still count as a replay, not a false
    // conflict on an edit that already succeeded.
    writer.fetched = {
      kind: "event",
      providerEventId: "g-evt-1" as ProviderEventId,
      providerVersion: "etag-2",
      providerUpdatedAt: null,
      content: {
        title: "New",
        description: "",
        location: null,
        organizer: null,
        attendees: [
          {
            email: "guest@example.com",
            displayName: null,
            responseStatus: "accepted",
          },
        ],
        conference: null,
      },
      schedule,
      busy: true,
      recurrence: { kind: "single" },
    };

    const result = await executeProviderUpdate(
      {
        commands,
        events,
        occurrences,
        resources,
        connections: stubConnectionLookup(),
        writer,
        custody: tokenSource(),
      },
      command,
      event,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("confirmed");
    expect(writer.patchCalls).toHaveLength(0);
  });

  it("patches against the fresh version when only the provider's version key drifted", async () => {
    const { tenantId, principalId, calendar, event, command } = await seed();
    const writer = new FakeProviderEventWriter();
    // The provider rotated the version on its own (Exchange rewrites a change
    // key seconds after a create) but still holds exactly what Compass stored,
    // so nobody edited it elsewhere and the stale etag-1 must not block the
    // edit.
    writer.fetched = providerEvent("Old", "etag-1-rotated");

    const result = await executeProviderUpdate(
      {
        commands,
        events,
        occurrences,
        resources,
        connections: stubConnectionLookup(),
        writer,
        custody: tokenSource(),
      },
      command,
      event,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("confirmed");
    expect(writer.patchCalls).toHaveLength(1);
    expect(writer.patchCalls[0]!.expectedVersion).toBe("etag-1-rotated");
    const stored = await events.findById(tenantId, principalId, event._id);
    expect(stored?.content.title).toBe("New");
    expect(stored?.providerVersion).toBe("etag-2" as ProviderEventVersion);
  });

  it("fails with a conflict on a genuine concurrent external edit", async () => {
    const { calendar, event, command } = await seed();
    const writer = new FakeProviderEventWriter();
    // The provider was edited externally (different content, and the
    // conditional patch is rejected).
    writer.fetched = providerEvent("Someone else's edit", "etag-9");
    writer.patchError = new ProviderWriteError("versionConflict", "stale");

    const result = await executeProviderUpdate(
      {
        commands,
        events,
        occurrences,
        resources,
        connections: stubConnectionLookup(),
        writer,
        custody: tokenSource(),
      },
      command,
      event,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("failed");
    expect(
      result.outcome.state === "failed" && result.outcome.failureReason,
    ).toBe("versionConflict");
    // The drifted version is NOT adopted when the content changed too: the
    // patch stays conditioned on the stale version so it cannot overwrite
    // the external edit.
    expect(writer.patchCalls[0]!.expectedVersion).toBe("etag-1");
  });

  it("fails when the provider event no longer exists", async () => {
    const { calendar, event, command } = await seed();
    const writer = new FakeProviderEventWriter();
    writer.fetched = null;

    const result = await executeProviderUpdate(
      {
        commands,
        events,
        occurrences,
        resources,
        connections: stubConnectionLookup(),
        writer,
        custody: tokenSource(),
      },
      command,
      event,
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
    const { calendar, event, command } = await seed();
    const writer = new FakeProviderEventWriter();
    writer.fetched = providerEvent("Old", "etag-1");
    writer.patchError = new ProviderWriteError("transient", "blip");

    const result = await executeProviderUpdate(
      {
        commands,
        events,
        occurrences,
        resources,
        connections: stubConnectionLookup(),
        writer,
        custody: tokenSource(),
      },
      command,
      event,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("pending");
  });

  it("fails without touching the provider when the credential is revoked", async () => {
    const { calendar, event, command } = await seed();
    const writer = new FakeProviderEventWriter();

    const result = await executeProviderUpdate(
      providerMutationDeps(repos, writer, {
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
    expect(writer.fetchCalls).toHaveLength(0);
    expect(writer.patchCalls).toHaveLength(0);
  });

  it("discards the credential when a writer 401 classifies as authorizationRevoked", async () => {
    const { calendar, event, command } = await seed();
    await storeCommandCredential(credentials, calendar.connectionId, {
      token: "still-cached",
      expiresAt: new Date("2099-01-01T00:00:00Z"),
    });
    const custody = new CredentialCustody(
      credentials,
      () => new RevokedAuthAdapter(),
      undefined,
      undefined,
      TEST_CREDENTIAL_ENCRYPTION_KEY,
    );
    const writer = new FakeProviderEventWriter();
    writer.fetchError = new ProviderWriteError(
      "authorizationRevoked",
      "token rejected",
    );

    const result = await executeProviderUpdate(
      providerMutationDeps(repos, writer, { custody }),
      command,
      event,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("failed");
    expect(
      result.outcome.state === "failed" && result.outcome.failureReason,
    ).toBe("authorizationRevoked");
    expect(
      await credentials.findByConnection(calendar.connectionId),
    ).toBeNull();
  });
});
