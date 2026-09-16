import { faker } from "@faker-js/faker";
import { type SyncCommandInput } from "@core/types/sync/command.contracts";
import { type ProviderEventVersion } from "@core/types/sync/event.contracts";
import {
  type ProviderCalendarSourceId,
  type ProviderEventId,
} from "@core/types/sync/identity.contracts";
import {
  bindCommandRepos,
  COMMAND_NOW,
  FakeProviderEventWriter,
  failingTokenSource,
  newCommandIds,
  providerMutationDeps,
  RevokedAuthAdapter,
  seedCommandCalendar,
  storeCommandCredential,
  stubConnectionLookup,
  TEST_CREDENTIAL_ENCRYPTION_KEY,
  tokenSource,
} from "@sync/__tests__/helpers/command-scenario";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { CredentialCustody } from "@sync/credentials/credential-custody.service";
import { executeProviderCreate } from "@sync/domain/provider-command.create";
import { ProviderAuthError } from "@sync/providers/provider-auth.port";
import { ProviderWriteError } from "@sync/providers/provider-event-writer.port";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
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
const _objectId = () => faker.database.mongodbObjectId();
const now = COMMAND_NOW;

let mongo: SyncMongoService;
let commands: CommandRepository;
let events: EventRepository;
let occurrences: EventOccurrenceRepository;
let resources: SyncResourceRepository;
let calendars: ProviderCalendarRepository;
let _markers: DeletionMarkerRepository;
let credentials: CredentialRepository;

beforeEach(() => {
  mongo = repos.mongo;
  commands = repos.commands;
  events = repos.events;
  occurrences = repos.occurrences;
  resources = repos.resources;
  calendars = repos.calendars;
  _markers = repos.markers;
  credentials = repos.credentials;
});

describe("executeProviderCreate", () => {
  const createInput = (
    calendarId: string,
    invitation = "none",
  ): SyncCommandInput =>
    ({
      kind: "create",
      calendarId,
      invitation,
      content: {
        title: "Sync me",
        description: "",
        location: null,
        organizer: null,
        attendees: [],
        conference: null,
      },
      schedule: {
        kind: "timed",
        start: "2026-07-14T09:00:00-06:00",
        end: "2026-07-14T10:00:00-06:00",
        timeZone: "America/Denver",
      },
      recurrence: { kind: "single" },
    }) as unknown as SyncCommandInput;

  // Seed a pending create command plus its target provider calendar, and return
  // both with the fake dependencies wired up.
  const seed = async (invitation = "none") => {
    const ids = newCommandIds();
    const calendar = await seedCommandCalendar(calendars, ids, {
      providerCalendarId:
        "primary@group.calendar.google.com" as ProviderCalendarSourceId,
    });
    const { record: command } = await commands.submit({
      tenantId: ids.tenantId,
      principalId: ids.principalId,
      idempotencyKey: ids.idempotencyKey,
      eventId: ids.eventId,
      input: createInput(calendar._id, invitation),
      expectedVersion: null,
    });
    return {
      tenantId: ids.tenantId,
      principalId: ids.principalId,
      calendar,
      command,
    };
  };

  it("writes to the provider, commits its identity, and confirms", async () => {
    const { tenantId, principalId, calendar, command } = await seed();
    const writer = new FakeProviderEventWriter();

    const result = await executeProviderCreate(
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
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("confirmed");
    expect(
      result.outcome.state === "confirmed" && result.outcome.providerEventId,
    ).toBe("g-evt-1" as ProviderEventId);

    // Called with the raw provider calendar id and the deterministic event id.
    expect(writer.calls).toHaveLength(1);
    expect(writer.calls[0]!.calendarId).toBe(calendar.providerCalendarId);
    expect(writer.calls[0]!.providerEventId).toBe(command.eventId);

    const stored = await events.findById(
      tenantId,
      principalId,
      command.eventId,
    );
    expect(stored?.connectionId).toBe(calendar.connectionId);
    expect(stored?.providerEventId).toBe("g-evt-1" as ProviderEventId);
    expect(stored?.providerVersion).toBe("etag-1" as ProviderEventVersion);
    expect(stored?.deliveryState).toBe("confirmed");
    expect(stored?.providerMetadata).toBeNull();

    // The provider-linked event is projected into the read model.
    const occ = await mongo.db
      .collection(SYNC_COLLECTIONS.eventOccurrences)
      .find({ eventId: command.eventId })
      .toArray();
    expect(occ.map((o) => (o["startAt"] as Date).toISOString())).toEqual([
      "2026-07-14T15:00:00.000Z",
    ]);
  });

  it("stores iCalUID from the write result on create", async () => {
    const { tenantId, principalId, calendar, command } = await seed();
    const writer = new FakeProviderEventWriter();
    writer.result = {
      providerEventId: "g-evt-1" as ProviderEventId,
      providerVersion: "etag-1",
      icalUid: "g-evt-1@google.com",
    };

    await executeProviderCreate(
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
      calendar,
      now,
    );

    const stored = await events.findById(
      tenantId,
      principalId,
      command.eventId,
    );
    expect(stored?.providerMetadata).toEqual({ iCalUID: "g-evt-1@google.com" });
  });

  it("stores the Meet URL Google minted on create, not the command's null", async () => {
    const { tenantId, principalId, calendar, command } = await seed();
    const writer = new FakeProviderEventWriter();
    writer.result = {
      providerEventId: "g-evt-1" as ProviderEventId,
      providerVersion: "etag-1",
      conference: {
        url: "https://meet.google.com/abc-defg-hij",
        label: "Google Meet",
      },
    };

    await executeProviderCreate(
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
      calendar,
      now,
    );

    const stored = await events.findById(
      tenantId,
      principalId,
      command.eventId,
    );
    expect(
      command.input.kind === "create" && command.input.content.conference,
    ).toBe(null);
    expect(stored?.content.conference).toEqual({
      url: "https://meet.google.com/abc-defg-hij",
      label: "Google Meet",
    });
  });

  it("passes the caller's invitation intent through to the writer", async () => {
    const { calendar, command } = await seed("all");
    const writer = new FakeProviderEventWriter();

    await executeProviderCreate(
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
      calendar,
      now,
    );

    expect(writer.calls[0]!.invitation).toBe("all");
  });

  it("converges on one event when executed twice (idempotent write)", async () => {
    const { tenantId, principalId, calendar, command } = await seed();
    const writer = new FakeProviderEventWriter();
    const deps = {
      commands,
      events,
      occurrences,
      resources,
      connections: stubConnectionLookup(),
      writer,
      custody: tokenSource(),
    };

    await executeProviderCreate(deps, command, calendar, now);
    await executeProviderCreate(deps, command, calendar, now);

    const owned = await mongo.db
      .collection(SYNC_COLLECTIONS.events)
      .find({ tenantId, principalId, calendarId: calendar._id })
      .toArray();
    expect(owned).toHaveLength(1);
  });

  it("projects a create at the calendar's active generation, not zero", async () => {
    // 2026-08-01: a repaired calendar reads at generation 1, but creates
    // hardcoded their occurrences to generation 0, so a new event saved
    // successfully to Google and was then invisible in Compass. That was
    // meant to self-heal on the next incremental pull; when the sweeps froze,
    // the window stayed open for a day.
    const { tenantId, principalId, calendar, command } = await seed();
    const resource = await resources.ensure({
      tenantId,
      principalId,
      connectionId: calendar.connectionId,
      resourceKind: "events",
      calendarId: calendar._id,
    });
    await resources.startNewGeneration(tenantId, principalId, resource._id);
    await resources.activateGeneration(tenantId, principalId, resource._id, 1);

    await executeProviderCreate(
      providerMutationDeps(
        { commands, events, occurrences, resources },
        new FakeProviderEventWriter(),
      ),
      command,
      calendar,
      now,
    );

    // Visible to a read at the generation the calendar actually serves.
    const atActive = await mongo.db
      .collection(SYNC_COLLECTIONS.events)
      .find({ tenantId, principalId, calendarId: calendar._id, generation: 1 })
      .toArray();
    expect(atActive).toHaveLength(1);
    expect(String(atActive[0]?.["_id"])).toBe(command.eventId);
  });

  it("leaves the command pending on a transient write failure", async () => {
    const { tenantId, principalId, calendar, command } = await seed();
    const writer = new FakeProviderEventWriter();
    writer.error = new ProviderWriteError("transient", "network blip");

    const result = await executeProviderCreate(
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
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("pending");
    expect(
      await events.findById(tenantId, principalId, command.eventId),
    ).toBeNull();
  });

  it("fails the command on a terminal write error", async () => {
    const { tenantId, principalId, calendar, command } = await seed();
    const writer = new FakeProviderEventWriter();
    writer.error = new ProviderWriteError("readOnlyCalendar", "read only");

    const result = await executeProviderCreate(
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
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("failed");
    expect(
      result.outcome.state === "failed" && result.outcome.failureReason,
    ).toBe("readOnlyCalendar");
    expect(
      await events.findById(tenantId, principalId, command.eventId),
    ).toBeNull();
  });

  it("fails the command when the credential is revoked, without writing", async () => {
    const { calendar, command } = await seed();
    const writer = new FakeProviderEventWriter();
    await storeCommandCredential(credentials, calendar.connectionId);
    const custody = new CredentialCustody(
      credentials,
      () =>
        new RevokedAuthAdapter({
          refreshError: new ProviderAuthError(
            "authorizationRevoked",
            "revoked",
          ),
        }),
      undefined,
      undefined,
      TEST_CREDENTIAL_ENCRYPTION_KEY,
    );

    const result = await executeProviderCreate(
      providerMutationDeps(
        { commands, events, occurrences, resources },
        writer,
        { custody },
      ),
      command,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("failed");
    expect(
      result.outcome.state === "failed" && result.outcome.failureReason,
    ).toBe("authorizationRevoked");
    expect(writer.calls).toHaveLength(0);
    expect(
      await credentials.findByConnection(calendar.connectionId),
    ).toBeNull();
  });

  it("leaves the command pending on a transient refresh failure", async () => {
    const { calendar, command } = await seed();
    const writer = new FakeProviderEventWriter();

    const result = await executeProviderCreate(
      providerMutationDeps(
        { commands, events, occurrences, resources },
        writer,
        {
          custody: failingTokenSource(
            new ProviderAuthError("refreshFailed", "temporary"),
          ),
        },
      ),
      command,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("pending");
    expect(writer.calls).toHaveLength(0);
  });
});
