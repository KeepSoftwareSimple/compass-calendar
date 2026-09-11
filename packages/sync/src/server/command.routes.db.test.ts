import { faker } from "@faker-js/faker";
import { NodeEnv } from "@core/constants/core.constants";
import {
  type CalendarId,
  type DateTime,
  type EventId,
  type TimeZone,
} from "@core/types/domain-primitives";
import { type ClientEventId } from "@core/types/sync/event.contracts";
import {
  type ConnectionId,
  type PrincipalId,
  type ProviderAccountId,
  type ProviderCalendarSourceId,
  type ProviderEventId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import {
  seedOauthCredential,
  TEST_CREDENTIAL_ENCRYPTION_KEY,
} from "@sync/__tests__/helpers/credential-encryption";
import { defaultCalendarListFields } from "@sync/__tests__/helpers/fixtures";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { createSyncService, type SyncService } from "@sync/app";
import { signInternalRequest } from "@sync/auth/internal-auth";
import { type SyncConfig } from "@sync/config/sync.config";
import {
  type ProviderAuthAdapter,
  type RefreshedCredential,
} from "@sync/providers/provider-auth.port";
import { type ProviderEvent } from "@sync/providers/provider-event.port";
import {
  type ProviderEventWriter,
  type ProviderPatchInput,
  type ProviderWriteResult,
} from "@sync/providers/provider-event-writer.port";
import { COMMANDS_PATH } from "@sync/server/command.routes";
import { CommandRepository } from "@sync/storage/repositories/command.repository";
import { CredentialRepository } from "@sync/storage/repositories/credential.repository";
import { EventRepository } from "@sync/storage/repositories/event.repository";
import { ProviderCalendarRepository } from "@sync/storage/repositories/provider-calendar.repository";
import { ProviderConnectionRepository } from "@sync/storage/repositories/provider-connection.repository";
import { type SyncMongoService } from "@sync/storage/sync-mongo.service";
import { type AddressInfo } from "node:net";

const uri = process.env["SYNC_MONGO_URI"] as string;
const storage = setupSyncStorage(import.meta.url);
const objectId = () => faker.database.mongodbObjectId();
const SECRET = "internal-secret";

const testConfig = (overrides: Partial<SyncConfig> = {}): SyncConfig =>
  ({
    NODE_ENV: NodeEnv.Test,
    PORT: 0,
    MONGO_URI: uri,
    INTERNAL_AUTH_TOKEN: SECRET,
    CALLBACK_BASE_URL: "http://localhost:3010",
    EXECUTION: "passive",
    MAX_CONCURRENCY: 4,
    CREDENTIAL_ENCRYPTION_KEY: TEST_CREDENTIAL_ENCRYPTION_KEY,
    ...overrides,
  }) as SyncConfig;

const signedHeaders = (
  tenantId: string,
  principalId: string,
): Record<string, string> => {
  const timestamp = Date.now();
  return {
    "content-type": "application/json",
    "x-sync-tenant": tenantId,
    "x-sync-principal": principalId,
    "x-sync-timestamp": String(timestamp),
    "x-sync-signature": signInternalRequest(SECRET, {
      timestamp,
      tenantId,
      principalId,
    }),
  };
};

// A minimal, valid cloud create request. tenant/principal are NOT in the body —
// they ride on the signed headers.
const createRequest = (overrides: Record<string, unknown> = {}) => ({
  idempotencyKey: `idem-${objectId()}`,
  eventId: objectId() as EventId,
  input: {
    kind: "create",
    calendarId: objectId() as CalendarId,
    content: {
      title: "Lunch",
      description: "",
      location: null,
      organizer: null,
      attendees: [],
      conference: null,
    },
    schedule: {
      kind: "timed",
      start: "2026-07-14T12:00:00-06:00" as DateTime,
      end: "2026-07-14T13:00:00-06:00" as DateTime,
      timeZone: "America/Denver" as TimeZone,
    },
    recurrence: { kind: "single" },
  },
  expectedVersion: null,
  ...overrides,
});

describe("POST /internal/commands", () => {
  let mongo: SyncMongoService;
  let service: SyncService;
  let base: string;

  const startService = async (config: SyncConfig = testConfig()) => {
    service = createSyncService(config, { mongo });
    await new Promise<void>((resolve) => service.httpServer.listen(0, resolve));
    const { port } = service.httpServer.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
  };

  const submit = (tenantId: string, principalId: string, body: unknown) =>
    fetch(`${base}${COMMANDS_PATH}`, {
      method: "POST",
      headers: signedHeaders(tenantId, principalId),
      body: JSON.stringify(body),
    });

  beforeEach(() => {
    mongo = storage.mongo();
  });

  afterEach(async () => {
    await service?.stop();
  });

  it("confirms a cloud-only create and writes the canonical event", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const request = createRequest();
    // No connection/provider is seeded and the service is passive: a cloud
    // create needs neither.
    await startService();

    const res = await submit(tenantId, principalId, request);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      command: {
        outcome: { state: string; providerEventId: null };
        eventId: string;
      };
    };
    expect(body.command.outcome.state).toBe("confirmed");
    expect(body.command.outcome.providerEventId).toBeNull();

    const events = new EventRepository(mongo.db);
    const stored = await events.findById(
      tenantId,
      principalId,
      request.eventId as never,
    );
    expect(stored).not.toBeNull();
    expect(stored?.origin).toBe("compass");
    expect(stored?.connectionId).toBeNull();
    expect(stored?.confirmedAt).not.toBeNull();
    // The signed principal owns the event, not anything in the body.
    expect(stored?.principalId).toBe(principalId);
  });

  it("is idempotent on a repeated upload", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const request = createRequest();
    await startService();

    const first = (await (
      await submit(tenantId, principalId, request)
    ).json()) as { command: { id: string } };
    const second = (await (
      await submit(tenantId, principalId, request)
    ).json()) as { command: { id: string; outcome: { state: string } } };

    expect(second.command.id).toBe(first.command.id);
    expect(second.command.outcome.state).toBe("confirmed");
    expect(await mongo.db.collection("commands").countDocuments()).toBe(1);
    expect(await mongo.db.collection("events").countDocuments()).toBe(1);
    expect(await mongo.db.collection("invalidations").countDocuments()).toBe(2);
  });

  it("recovers an interrupted acknowledgement by confirming on retry", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const request = createRequest();
    await startService();

    // Simulate a crash after the command persisted but before it was applied:
    // the command already exists as pending with no event written.
    const commands = new CommandRepository(mongo.db);
    const { record: pending } = await commands.submit({
      tenantId: tenantId as TenantId,
      principalId: principalId as PrincipalId,
      idempotencyKey: request.idempotencyKey as never,
      eventId: request.eventId as never,
      input: request.input as never,
      expectedVersion: null,
    });
    expect(pending.outcome.state).toBe("pending");

    const res = await submit(tenantId, principalId, request);

    const body = (await res.json()) as {
      command: { id: string; outcome: { state: string } };
    };
    expect(body.command.id).toBe(pending._id);
    expect(body.command.outcome.state).toBe("confirmed");
    const events = new EventRepository(mongo.db);
    expect(
      await events.findById(tenantId, principalId, request.eventId as never),
    ).not.toBeNull();
  });

  it("maps a series create to a stored series master", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const request = createRequest({
      input: {
        ...createRequest().input,
        recurrence: { kind: "series", rules: ["RRULE:FREQ=WEEKLY"] },
      },
    });
    await startService();

    await submit(tenantId, principalId, request);

    const events = new EventRepository(mongo.db);
    const stored = await events.findById(
      tenantId,
      principalId,
      request.eventId as never,
    );
    expect(stored?.recurrence).toEqual({
      kind: "seriesMaster",
      rules: ["RRULE:FREQ=WEEKLY"],
    });
  });

  it("refuses a create targeting a provider calendar when the writer is unavailable", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    await startService();

    // A connected provider calendar; a create aimed at it must not be confirmed
    // as a local cloud event.
    const calendars = new ProviderCalendarRepository(mongo.db);
    const calendar = await calendars.upsertByProviderCalendar({
      tenantId: tenantId as TenantId,
      principalId: principalId as PrincipalId,
      connectionId: objectId() as ConnectionId,
      providerCalendarId: objectId() as ProviderCalendarSourceId,
      displayName: "Google",
      color: null,
      ...defaultCalendarListFields,
      active: true,
      primary: true,
      accessRole: "owner",
      capabilities: {
        canReadEvents: true,
        canWriteEvents: true,
        canReadBusy: true,
        canInviteAttendees: true,
      },
    });

    const request = createRequest({
      input: { ...createRequest().input, calendarId: calendar._id },
    });
    const res = await submit(tenantId, principalId, request);

    // 503, not a pending 200: nothing re-dispatches a pending command, so
    // answering OK would tell the caller a write landed that would never reach
    // the provider (the 2026-07-29 production failure).
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "provider_write_unavailable" });
    // No local cloud event is written for a provider-targeted create.
    expect(await mongo.db.collection("events").countDocuments()).toBe(0);
  });

  it("fails a move command as unsupportedCapability rather than stranding it pending", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    // move has no executor anywhere yet - leaving it pending would strand the
    // write forever while the caller sees success (nothing rejects a merely
    // "pending" outcome), so it fails explicitly instead.
    const request = createRequest({
      input: { kind: "move", calendarId: objectId() as CalendarId },
    });
    await startService();

    const res = await submit(tenantId, principalId, request);

    const body = (await res.json()) as {
      command: { outcome: { state: string; failureReason?: string } };
    };
    expect(body.command.outcome).toEqual({
      state: "failed",
      failureReason: "unsupportedCapability",
    });
    // No event is written for a command that was only recorded, not applied.
    expect(await mongo.db.collection("events").countDocuments()).toBe(0);
    expect(await mongo.db.collection("commands").countDocuments()).toBe(1);
  });

  it("updates a cloud event's content and confirms", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    // Create the event, then update it (both keyed on the same event id).
    const created = createRequest();
    await startService();
    await submit(tenantId, principalId, created);

    const update = {
      idempotencyKey: `idem-${objectId()}`,
      eventId: created.eventId,
      input: {
        kind: "update",
        content: {
          title: "Renamed",
          description: "",
          location: null,
          organizer: null,
          attendees: [],
          conference: null,
        },
        schedule: created.input.schedule,
        recurrence: { kind: "preserve" },
        scope: "all",
      },
      expectedVersion: null,
    };
    const res = await submit(tenantId, principalId, update);

    const body = (await res.json()) as {
      command: { outcome: { state: string } };
    };
    expect(body.command.outcome.state).toBe("confirmed");
    const events = new EventRepository(mongo.db);
    const stored = await events.findById(
      tenantId,
      principalId,
      created.eventId as never,
    );
    expect(stored?.content.title).toBe("Renamed");
  });

  it("converts a single event into a series and confirms", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const created = createRequest();
    await startService();
    await submit(tenantId, principalId, created);

    const update = {
      idempotencyKey: `idem-${objectId()}`,
      eventId: created.eventId,
      input: {
        kind: "update",
        content: created.input.content,
        schedule: created.input.schedule,
        recurrence: { kind: "series", rules: ["RRULE:FREQ=WEEKLY"] },
        scope: "all",
      },
      expectedVersion: null,
    };
    const res = await submit(tenantId, principalId, update);

    const body = (await res.json()) as {
      command: { outcome: { state: string } };
    };
    expect(body.command.outcome.state).toBe("confirmed");
    const events = new EventRepository(mongo.db);
    const stored = await events.findById(
      tenantId,
      principalId,
      created.eventId as never,
    );
    expect(stored?.recurrence).toEqual({
      kind: "seriesMaster",
      rules: ["RRULE:FREQ=WEEKLY"],
    });
  });

  it("deletes a cloud event and confirms", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const created = createRequest();
    await startService();
    await submit(tenantId, principalId, created);
    const eventNoticesBefore = await mongo.db
      .collection("invalidations")
      .countDocuments({
        "invalidation.kind": "event",
        "invalidation.eventId": created.eventId,
      });

    const del = {
      idempotencyKey: `idem-${objectId()}`,
      eventId: created.eventId,
      input: { kind: "delete", scope: "all" },
      expectedVersion: null,
    };
    const res = await submit(tenantId, principalId, del);

    const body = (await res.json()) as {
      command: { outcome: { state: string } };
    };
    expect(body.command.outcome.state).toBe("confirmed");
    expect(await mongo.db.collection("events").countDocuments()).toBe(0);
    // Event row is gone, but the outbox still carries eventsChanged so the
    // SPA can drop the tombstone without waiting on a full refetch.
    const eventNoticesAfter = await mongo.db
      .collection("invalidations")
      .find({
        "invalidation.kind": "event",
        "invalidation.eventId": created.eventId,
      })
      .toArray();
    expect(eventNoticesAfter.length).toBe(eventNoticesBefore + 1);
    expect(
      eventNoticesAfter.some(
        (row) =>
          row["invalidation"]?.["calendarId"] === created.input.calendarId,
      ),
    ).toBe(true);
  });

  it("confirms an idempotent delete of an already-absent event", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    await startService();

    const del = {
      idempotencyKey: `idem-${objectId()}`,
      eventId: objectId() as EventId,
      input: { kind: "delete", scope: "all" },
      expectedVersion: null,
    };
    const res = await submit(tenantId, principalId, del);

    const body = (await res.json()) as {
      command: { outcome: { state: string } };
    };
    expect(body.command.outcome.state).toBe("confirmed");
  });

  it("fails an update of a missing event instead of stranding it pending", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    await startService();

    const update = {
      idempotencyKey: `idem-${objectId()}`,
      eventId: objectId() as EventId,
      input: {
        kind: "update",
        content: {
          title: "Nope",
          description: "",
          location: null,
          organizer: null,
          attendees: [],
          conference: null,
        },
        schedule: createRequest().input.schedule,
        recurrence: { kind: "preserve" },
        scope: "all",
      },
      expectedVersion: null,
    };
    const res = await submit(tenantId, principalId, update);

    const body = (await res.json()) as {
      command: { outcome: { state: string } };
    };
    expect(body.command.outcome.state).toBe("failed");
  });

  it("promotes an anonymous device event, preserving its clientEventId", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const clientEventId = `device-${objectId()}` as ClientEventId;
    const request = createRequest({
      input: { ...createRequest().input, clientEventId },
    });
    await startService();

    const res = await submit(tenantId, principalId, request);

    expect(res.status).toBe(200);
    const events = new EventRepository(mongo.db);
    const stored = await events.findById(
      tenantId,
      principalId,
      request.eventId as never,
    );
    expect(stored?.clientEventId).toBe(clientEventId);
  });

  it("converges a resumed promotion to one cloud event via the stable id", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const clientEventId = `device-${objectId()}` as ClientEventId;
    const eventId = objectId() as EventId;
    const input = { ...createRequest().input, clientEventId };
    await startService();

    // A resumed promotion is a fresh attempt (new idempotency key) for the same
    // device event. Two separate commands result, but the stable event id keeps
    // them converging on exactly one cloud event.
    await submit(tenantId, principalId, {
      idempotencyKey: `idem-${objectId()}`,
      eventId,
      input,
      expectedVersion: null,
    });
    await submit(tenantId, principalId, {
      idempotencyKey: `idem-${objectId()}`,
      eventId,
      input,
      expectedVersion: null,
    });

    expect(await mongo.db.collection("commands").countDocuments()).toBe(2);
    expect(await mongo.db.collection("events").countDocuments()).toBe(1);
    const events = new EventRepository(mongo.db);
    const stored = await events.findById(
      tenantId,
      principalId,
      eventId as never,
    );
    expect(stored?.clientEventId).toBe(clientEventId);
  });

  it("refuses to overwrite another principal's event with a reused id", async () => {
    const tenantId = objectId() as TenantId;
    const owner = objectId() as PrincipalId;
    const attacker = objectId();
    const request = createRequest();
    await startService();

    // The owner creates an event.
    await submit(tenantId, owner, request);

    // A different principal submits a create reusing the owner's event id.
    const res = await submit(tenantId, attacker, {
      ...request,
      idempotencyKey: `idem-${objectId()}`,
    });

    // The write is refused (the scoped filter collides on the unique _id),
    // never a silent clobber.
    expect(res.status).toBe(500);
    const events = new EventRepository(mongo.db);
    const stored = await events.findById(
      tenantId,
      owner,
      request.eventId as never,
    );
    // The owner still owns the untouched event.
    expect(stored?.principalId).toBe(owner);
  });

  it("rejects a malformed command body", async () => {
    await startService();

    const res = await submit(objectId(), objectId(), { not: "a command" });

    expect(res.status).toBe(400);
  });

  it("rejects a create carrying an expectedVersion", async () => {
    await startService();
    const request = createRequest({ expectedVersion: "v1" });

    const res = await submit(objectId(), objectId(), request);

    expect(res.status).toBe(400);
  });

  it("confirms a provider-linked rsvp end-to-end and appends the change-feed invalidations", async () => {
    // WP-07: the full inline path — signed request → rsvp dispatch → self
    // entry rewrite at the (fake) provider → confirm → invalidation outbox
    // rows, which are what the Compass API's SSE eventsChanged derives from.
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const connections = new ProviderConnectionRepository(mongo.db);
    const connection = await connections.upsertByProviderAccount({
      tenantId: tenantId as TenantId,
      principalId: principalId as PrincipalId,
      provider: "google",
      account: {
        providerAccountId: objectId() as ProviderAccountId,
        email: "self@example.com",
        displayName: null,
      },
      capabilities: ["readEvents"],
      state: "healthy",
      stateReason: null,
    });
    const calendars = new ProviderCalendarRepository(mongo.db);
    const calendar = await calendars.upsertByProviderCalendar({
      tenantId: tenantId as TenantId,
      principalId: principalId as PrincipalId,
      connectionId: connection._id,
      providerCalendarId: "primary@google.com" as ProviderCalendarSourceId,
      displayName: "Google",
      color: null,
      ...defaultCalendarListFields,
      active: true,
      primary: true,
      accessRole: "editor",
      capabilities: {
        canReadEvents: true,
        canWriteEvents: true,
        canReadBusy: true,
        canInviteAttendees: true,
      },
    });
    const credentials = new CredentialRepository(mongo.db);
    await seedOauthCredential(credentials, {
      connectionId: connection._id,
      provider: "google",
      refreshToken: "stored-refresh-token",
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
    });
    const events = new EventRepository(mongo.db);
    const eventId = objectId() as EventId;
    const self = {
      email: "self@example.com",
      displayName: null,
      responseStatus: "needsAction" as const,
    };
    const schedule = {
      kind: "timed" as const,
      start: "2026-07-14T09:00:00-06:00" as DateTime,
      end: "2026-07-14T10:00:00-06:00" as DateTime,
      timeZone: "America/Denver" as TimeZone,
    };
    const content = {
      title: "Invited",
      description: "",
      location: null,
      organizer: { email: "organizer@example.com", displayName: null },
      attendees: [self],
      conference: null,
    };
    await events.put({
      _id: eventId,
      tenantId,
      principalId,
      origin: "compass",
      calendarId: calendar._id,
      clientEventId: null,
      connectionId: connection._id,
      providerEventId: "g-evt-1",
      providerVersion: "etag-1",
      providerUpdatedAt: null,
      deliveryState: "confirmed",
      providerMetadata: null,
      content,
      schedule,
      recurrence: { kind: "single" },
      lifecycleState: "active",
      generation: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      confirmedAt: new Date(),
    } as never);

    const patchCalls: ProviderPatchInput[] = [];
    const writer: ProviderEventWriter = {
      createEvent: async () => {
        throw new Error("unused");
      },
      deleteEvent: async () => {
        throw new Error("unused");
      },
      patchEvent: async (
        input: ProviderPatchInput,
      ): Promise<ProviderWriteResult> => {
        patchCalls.push(input);
        return {
          providerEventId: "g-evt-1" as ProviderEventId,
          providerVersion: "etag-2",
        };
      },
      fetchEvent: async (): Promise<ProviderEvent> => ({
        kind: "event",
        providerEventId: "g-evt-1" as ProviderEventId,
        providerVersion: "etag-1",
        providerUpdatedAt: null,
        content,
        schedule,
        busy: true,
        recurrence: { kind: "single" },
      }),
      fetchInstanceAt: async () => null,
    };
    const authAdapter: ProviderAuthAdapter = {
      buildAuthorizationUrl: () => {
        throw new Error("unused");
      },
      exchangeAuthorizationCode: async () => {
        throw new Error("unused");
      },
      refreshAccessToken: async (): Promise<RefreshedCredential> => ({
        accessToken: "fresh-access-token",
        expiresAt: new Date("2099-01-01T00:00:00Z"),
        grantedScopes: [],
      }),
      revoke: async () => {},
    };
    service = createSyncService(testConfig({ EXECUTION: "active" }), {
      mongo,
      writer,
      authAdapter,
    });
    await new Promise<void>((resolve) => service.httpServer.listen(0, resolve));
    const { port } = service.httpServer.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;

    const res = await submit(tenantId, principalId, {
      idempotencyKey: `idem-${objectId()}`,
      eventId,
      input: {
        kind: "rsvp",
        responseStatus: "accepted",
        scope: "all",
        recurrenceId: null,
      },
      expectedVersion: null,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      command: { outcome: { state: string } };
    };
    expect(body.command.outcome.state).toBe("confirmed");
    // The single patch rewrote only the self entry, silently.
    expect(patchCalls).toHaveLength(1);
    expect(patchCalls[0]?.invitation).toBe("none");
    expect(patchCalls[0]?.attendees).toEqual([
      { ...self, responseStatus: "accepted" },
    ]);
    // The stored record reflects the answer before any Google round-trip.
    const stored = await events.findById(
      tenantId,
      principalId as never,
      eventId as never,
    );
    expect(stored?.content.attendees).toEqual([
      { ...self, responseStatus: "accepted" },
    ]);
    // The change-feed outbox got both notices — the source of the Compass
    // API's SSE eventsChanged for this calendar.
    const invalidations = await mongo.db
      .collection("invalidations")
      .find({ tenantId, principalId })
      .toArray();
    expect(
      invalidations.some(
        (row) =>
          row["invalidation"]?.["kind"] === "event" &&
          row["invalidation"]?.["eventId"] === eventId &&
          row["invalidation"]?.["calendarId"] === calendar._id,
      ),
    ).toBe(true);
    expect(
      invalidations.some((row) => row["invalidation"]?.["kind"] === "command"),
    ).toBe(true);
  });

  it("rejects an rsvp to needsAction (unrepresentable by contract)", async () => {
    // WP-07 acceptance "Incomplete input": a user answers an invitation,
    // they don't un-answer it — RsvpResponseStatusSchema excludes
    // needsAction, so the request never becomes a command.
    await startService();

    const res = await submit(objectId(), objectId(), {
      idempotencyKey: `idem-${objectId()}`,
      eventId: objectId() as EventId,
      input: {
        kind: "rsvp",
        responseStatus: "needsAction",
        scope: "all",
        recurrenceId: null,
      },
      expectedVersion: null,
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_command" });
  });

  it("rejects an unsigned request", async () => {
    await startService();

    const res = await fetch(`${base}${COMMANDS_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(createRequest()),
    });

    expect(res.status).toBe(401);
  });
});
