import { faker } from "@faker-js/faker";
import { NodeEnv } from "@core/constants/core.constants";
import {
  type ConnectionId,
  type PrincipalId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import { mongoObjectId } from "@sync/__tests__/helpers/mongo-id";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { createSyncService, type SyncService } from "@sync/app";
import { signInternalRequest } from "@sync/auth/internal-auth";
import { type SyncConfig } from "@sync/config/sync.config";
import { COMMANDS_PATH } from "@sync/server/command.routes";
import {
  AVAILABILITY_BUSY_PATH,
  CONNECTIONS_PATH,
} from "@sync/server/connection.routes";
import { PRINCIPAL_PATH } from "@sync/server/principal.routes";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import { CommandRepository } from "@sync/storage/repositories/command.repository";
import { EventRepository } from "@sync/storage/repositories/event.repository";
import { ProviderConnectionRepository } from "@sync/storage/repositories/provider-connection.repository";
import { SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";
import { type SyncMongoService } from "@sync/storage/sync-mongo.service";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { type AddressInfo } from "node:net";

/**
 * R-SEC-03 isolation matrix (S43).
 *
 * Existing route/repo suites already cover many principal-scoped reads. This
 * file consolidates the remaining high-value probes: availability busy with
 * foreign calendar ids, command update/delete of a foreign event, wrong-tenant
 * ownership on id-scoped writes, and principal purge not affecting strangers.
 */

const uri = process.env["SYNC_MONGO_URI"] as string;
const storage = setupSyncStorage(import.meta.url);
const objectId = () => faker.database.mongodbObjectId();
const SECRET = "internal-secret";

const testConfig = (): SyncConfig =>
  ({
    NODE_ENV: NodeEnv.Test,
    PORT: 0,
    MONGO_URI: uri,
    INTERNAL_AUTH_TOKEN: SECRET,
    CALLBACK_BASE_URL: "http://localhost:3010",
    EXECUTION: "passive",
    MAX_CONCURRENCY: 4,
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

describe("R-SEC-03 isolation matrix", () => {
  let mongo: SyncMongoService;
  let service: SyncService;
  let base: string;
  let connections: ProviderConnectionRepository;
  let resources: SyncResourceRepository;
  let events: EventRepository;
  let accountSeq: number;

  const startService = async () => {
    service = createSyncService(testConfig(), { mongo });
    await new Promise<void>((resolve) => service.httpServer.listen(0, resolve));
    const { port } = service.httpServer.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
  };

  beforeEach(() => {
    mongo = storage.mongo();
    connections = new ProviderConnectionRepository(mongo.db);
    resources = new SyncResourceRepository(mongo.db);
    events = new EventRepository(mongo.db);
    accountSeq = 0;
  });

  afterEach(async () => {
    await service?.stop();
  });

  const seedConnection = async (
    tenantId: string,
    principalId: string,
  ): Promise<ConnectionId> => {
    accountSeq += 1;
    const connection = await connections.upsertByProviderAccount({
      tenantId: tenantId as TenantId,
      principalId: principalId as PrincipalId,
      provider: "google",
      account: {
        providerAccountId: `acct-${accountSeq}`,
        email: `u${accountSeq}@example.com`,
        displayName: null,
      },
      capabilities: ["readEvents"],
      state: "healthy",
      stateReason: null,
    });
    return connection._id;
  };

  const seedBusyCalendar = async (
    tenantId: string,
    principalId: string,
    connectionId: ConnectionId,
  ): Promise<string> => {
    const calendarId = objectId();
    const resource = await resources.ensure({
      tenantId: tenantId as TenantId,
      principalId: principalId as PrincipalId,
      connectionId,
      resourceKind: "events",
      calendarId: calendarId as never,
    });
    await resources.advanceCursor(
      tenantId as TenantId,
      principalId as PrincipalId,
      resource._id,
      "cursor",
      new Date(),
    );
    const start = "2026-07-14T09:00:00.000Z";
    const end = "2026-07-14T10:00:00.000Z";
    const eventId = objectId();
    await mongo.db.collection(SYNC_COLLECTIONS.eventOccurrences).insertOne({
      _id: mongoObjectId(objectId()),
      tenantId,
      principalId,
      eventId,
      occurrenceKey: `${eventId}:${start}`,
      calendarId,
      generation: 0,
      startAt: new Date(start),
      endAt: new Date(end),
      busy: true,
      cancelled: false,
      title: "owner-secret-meeting",
      schedule: {
        kind: "timed",
        start: "2026-07-14T09:00:00-06:00",
        end: "2026-07-14T10:00:00-06:00",
        timeZone: "America/Denver",
      },
    });
    return calendarId;
  };

  const createCloudEvent = async (
    tenantId: string,
    principalId: string,
    eventId = objectId(),
  ) => {
    const body = {
      idempotencyKey: `idem-${objectId()}`,
      eventId,
      input: {
        kind: "create",
        calendarId: objectId(),
        content: {
          title: "Owner event",
          description: "",
          location: null,
          organizer: null,
          attendees: [],
          conference: null,
        },
        schedule: {
          kind: "timed",
          start: "2026-07-14T12:00:00-06:00",
          end: "2026-07-14T13:00:00-06:00",
          timeZone: "America/Denver",
        },
        recurrence: { kind: "single" },
      },
      expectedVersion: null,
    };
    const res = await fetch(`${base}${COMMANDS_PATH}`, {
      method: "POST",
      headers: signedHeaders(tenantId, principalId),
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(200);
    return eventId;
  };

  describe("POST /internal/availability/busy", () => {
    it("does not return another principal's busy intervals for their calendar id", async () => {
      const tenantId = objectId();
      const owner = objectId();
      const attacker = objectId();
      await startService();

      const connectionId = await seedConnection(tenantId, owner);
      const calendarId = await seedBusyCalendar(tenantId, owner, connectionId);

      const res = await fetch(`${base}${AVAILABILITY_BUSY_PATH}`, {
        method: "POST",
        headers: signedHeaders(tenantId, attacker),
        body: JSON.stringify({
          calendarIds: [calendarId],
          start: "2026-07-14T09:00:00.000Z",
          end: "2026-07-14T17:00:00.000Z",
          maxAgeMs: 15 * 60_000,
          purpose: "booking_confirmation",
        }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        intervals: unknown[];
        issues: Array<{ calendarId: string; reason: string }>;
        connections: unknown[];
        bookable: boolean;
      };
      // A calendar id this principal does not own has no events resource here.
      // Treat that as notImported and fail closed; do not return the owner's
      // intervals under an empty Compass-unbacked result.
      expect(body.intervals).toEqual([]);
      expect(body.connections).toEqual([]);
      expect(body.bookable).toBe(false);
      expect(body.issues).toEqual([{ calendarId, reason: "notImported" }]);
      expect(JSON.stringify(body)).not.toContain("owner-secret-meeting");
    });

    it("does not return busy data when the tenant header is wrong", async () => {
      const ownerTenant = objectId();
      const wrongTenant = objectId();
      const principalId = objectId();
      await startService();

      const connectionId = await seedConnection(ownerTenant, principalId);
      const calendarId = await seedBusyCalendar(
        ownerTenant,
        principalId,
        connectionId,
      );

      const res = await fetch(`${base}${AVAILABILITY_BUSY_PATH}`, {
        method: "POST",
        headers: signedHeaders(wrongTenant, principalId),
        body: JSON.stringify({
          calendarIds: [calendarId],
          start: "2026-07-14T09:00:00.000Z",
          end: "2026-07-14T17:00:00.000Z",
          maxAgeMs: 15 * 60_000,
          purpose: "booking_confirmation",
        }),
      });

      const body = (await res.json()) as { intervals: unknown[] };
      expect(body.intervals).toEqual([]);
      expect(JSON.stringify(body)).not.toContain("owner-secret-meeting");
    });
  });

  describe("POST /internal/commands", () => {
    it("cannot update another principal's event", async () => {
      const tenantId = objectId();
      const owner = objectId();
      const attacker = objectId();
      await startService();
      const eventId = await createCloudEvent(tenantId, owner);

      const res = await fetch(`${base}${COMMANDS_PATH}`, {
        method: "POST",
        headers: signedHeaders(tenantId, attacker),
        body: JSON.stringify({
          idempotencyKey: `idem-${objectId()}`,
          eventId,
          input: {
            kind: "update",
            content: {
              title: "Hijacked",
              description: "",
              location: null,
              organizer: null,
              attendees: [],
              conference: null,
            },
            schedule: {
              kind: "timed",
              start: "2026-07-14T12:00:00-06:00",
              end: "2026-07-14T13:00:00-06:00",
              timeZone: "America/Denver",
            },
            recurrence: { kind: "preserve" },
            scope: "all",
          },
          expectedVersion: null,
        }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        command: { outcome: { state: string } };
      };
      // Foreign event looks missing to the attacker — never confirmed mutate.
      // (The lookup is tenant/principal-scoped, so the attacker's update
      // resolves no target and fails the same way a genuinely missing event
      // would — versionConflict, not a side channel that would let them
      // distinguish "exists but not mine" from "doesn't exist".)
      expect(body.command.outcome.state).toBe("failed");
      const stored = await events.findById(
        tenantId as TenantId,
        owner as PrincipalId,
        eventId as never,
      );
      expect(stored?.content.title).toBe("Owner event");
    });

    it("cannot delete another principal's event", async () => {
      const tenantId = objectId();
      const owner = objectId();
      const attacker = objectId();
      await startService();
      const eventId = await createCloudEvent(tenantId, owner);

      const res = await fetch(`${base}${COMMANDS_PATH}`, {
        method: "POST",
        headers: signedHeaders(tenantId, attacker),
        body: JSON.stringify({
          idempotencyKey: `idem-${objectId()}`,
          eventId,
          input: { kind: "delete", scope: "all" },
          expectedVersion: null,
        }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        command: { outcome: { state: string } };
      };
      // Idempotent delete of an absent (to the attacker) event confirms locally
      // without touching the owner's row.
      expect(body.command.outcome.state).toBe("confirmed");
      const stored = await events.findById(
        tenantId as TenantId,
        owner as PrincipalId,
        eventId as never,
      );
      expect(stored).not.toBeNull();
      expect(stored?.content.title).toBe("Owner event");
    });

    it("cannot update an event under the wrong tenant", async () => {
      const ownerTenant = objectId();
      const wrongTenant = objectId();
      const principalId = objectId();
      await startService();
      const eventId = await createCloudEvent(ownerTenant, principalId);

      const res = await fetch(`${base}${COMMANDS_PATH}`, {
        method: "POST",
        headers: signedHeaders(wrongTenant, principalId),
        body: JSON.stringify({
          idempotencyKey: `idem-${objectId()}`,
          eventId,
          input: {
            kind: "update",
            content: {
              title: "Wrong tenant",
              description: "",
              location: null,
              organizer: null,
              attendees: [],
              conference: null,
            },
            schedule: {
              kind: "timed",
              start: "2026-07-14T12:00:00-06:00",
              end: "2026-07-14T13:00:00-06:00",
              timeZone: "America/Denver",
            },
            recurrence: { kind: "preserve" },
            scope: "all",
          },
          expectedVersion: null,
        }),
      });

      const body = (await res.json()) as {
        command: { outcome: { state: string } };
      };
      // Same as the cross-principal case above: the wrong-tenant lookup
      // resolves no target, so the update fails (versionConflict) rather
      // than leaking existence via a silently pending write.
      expect(body.command.outcome.state).toBe("failed");
      const stored = await events.findById(
        ownerTenant as TenantId,
        principalId as PrincipalId,
        eventId as never,
      );
      expect(stored?.content.title).toBe("Owner event");
    });
  });

  describe("DELETE /internal/principal", () => {
    it("does not purge another principal or another tenant", async () => {
      const tenantId = objectId();
      const owner = objectId();
      const stranger = objectId();
      const otherTenant = objectId();
      await startService();

      const ownerConn = await seedConnection(tenantId, owner);
      const strangerConn = await seedConnection(tenantId, stranger);
      const otherTenantConn = await seedConnection(otherTenant, owner);

      const res = await fetch(`${base}${PRINCIPAL_PATH}`, {
        method: "DELETE",
        headers: signedHeaders(tenantId, owner),
      });
      expect(res.status).toBe(200);

      expect(
        await connections.findById(
          tenantId as TenantId,
          owner as PrincipalId,
          ownerConn,
        ),
      ).toBeNull();
      expect(
        await connections.findById(
          tenantId as TenantId,
          stranger as PrincipalId,
          strangerConn,
        ),
      ).not.toBeNull();
      expect(
        await connections.findById(
          otherTenant as TenantId,
          owner as PrincipalId,
          otherTenantConn,
        ),
      ).not.toBeNull();
    });
  });

  describe("repository ownership probes", () => {
    it("refuses markDisconnected / deleteById under the wrong principal or tenant", async () => {
      const tenantId = objectId();
      const owner = objectId();
      const attacker = objectId();
      const wrongTenant = objectId();
      const connectionId = await seedConnection(tenantId, owner);

      expect(
        await connections.markDisconnected(
          tenantId as TenantId,
          attacker as PrincipalId,
          connectionId,
        ),
      ).toBe(false);
      expect(
        await connections.markDisconnected(
          wrongTenant as TenantId,
          owner as PrincipalId,
          connectionId,
        ),
      ).toBe(false);
      expect(
        await connections.deleteById(
          tenantId as TenantId,
          attacker as PrincipalId,
          connectionId,
        ),
      ).toBe(false);
      expect(
        await connections.deleteById(
          wrongTenant as TenantId,
          owner as PrincipalId,
          connectionId,
        ),
      ).toBe(false);
      expect(
        await connections.findById(
          tenantId as TenantId,
          owner as PrincipalId,
          connectionId,
        ),
      ).not.toBeNull();
    });

    it("does not let a foreign principal advance a sync-resource cursor", async () => {
      const tenantId = objectId();
      const owner = objectId();
      const attacker = objectId();
      const connectionId = await seedConnection(tenantId, owner);
      const resource = await resources.ensure({
        tenantId: tenantId as TenantId,
        principalId: owner as PrincipalId,
        connectionId,
        resourceKind: "calendarList",
        calendarId: null,
      });

      // Owner-scoped filter matches nothing for the attacker — silent no-op.
      await resources.advanceCursor(
        tenantId as TenantId,
        attacker as PrincipalId,
        resource._id,
        "stolen-cursor",
        new Date(),
      );

      const still = await resources.findById(
        tenantId as TenantId,
        owner as PrincipalId,
        resource._id,
      );
      expect(still?.syncCursor).toBeNull();
    });

    it("scopes command findById to the owning principal and tenant", async () => {
      const tenantId = objectId();
      const owner = objectId();
      const attacker = objectId();
      const wrongTenant = objectId();
      await startService();
      const eventId = await createCloudEvent(tenantId, owner);

      const commands = new CommandRepository(mongo.db);
      const mine = await commands.listNonterminal(
        tenantId as TenantId,
        owner as PrincipalId,
        10,
      );
      // Create confirms immediately, so list nonterminal may be empty — look up
      // by scanning the collection for the owner's command id instead.
      const row = await mongo.db.collection(SYNC_COLLECTIONS.commands).findOne({
        tenantId,
        principalId: owner,
        eventId,
      });
      expect(row).not.toBeNull();
      const commandId = String(row?._id);

      expect(
        await commands.findById(
          tenantId as TenantId,
          attacker as PrincipalId,
          commandId as never,
        ),
      ).toBeNull();
      expect(
        await commands.findById(
          wrongTenant as TenantId,
          owner as PrincipalId,
          commandId as never,
        ),
      ).toBeNull();
      expect(
        await commands.findById(
          tenantId as TenantId,
          owner as PrincipalId,
          commandId as never,
        ),
      ).not.toBeNull();
      expect(mine).toBeDefined();
    });
  });

  describe("GET /internal/connections wrong tenant", () => {
    it("does not list connections stored under a different tenant", async () => {
      const ownerTenant = objectId();
      const wrongTenant = objectId();
      const principalId = objectId();
      await startService();
      await seedConnection(ownerTenant, principalId);

      const res = await fetch(`${base}${CONNECTIONS_PATH}`, {
        headers: signedHeaders(wrongTenant, principalId),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ connections: [] });
    });
  });
});
