import { faker } from "@faker-js/faker";
import { NodeEnv } from "@core/constants/core.constants";
import {
  type PrincipalId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import { mongoObjectId } from "@sync/__tests__/helpers/mongo-id";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { createSyncService, type SyncService } from "@sync/app";
import { signInternalRequest } from "@sync/auth/internal-auth";
import { type SyncConfig } from "@sync/config/sync.config";
import { AVAILABILITY_BUSY_PATH } from "@sync/server/connection.routes";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import { ProviderConnectionRepository } from "@sync/storage/repositories/provider-connection.repository";
import { SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";
import { type SyncMongoService } from "@sync/storage/sync-mongo.service";
import { type AddressInfo } from "node:net";

const storage = setupSyncStorage(import.meta.url);
const uri = process.env["SYNC_MONGO_URI"] as string;
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

describe("POST /internal/availability/busy", () => {
  let mongo: SyncMongoService;
  let connections: ProviderConnectionRepository;
  let resources: SyncResourceRepository;
  let service: SyncService;
  let base: string;
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
    accountSeq = 0;
  });

  afterEach(async () => {
    await service?.stop();
  });

  const seedConnection = async (
    tenantId: TenantId,
    principalId: PrincipalId,
    state: "healthy" | "importing",
  ) => {
    accountSeq += 1;
    const c = await connections.upsertByProviderAccount({
      tenantId,
      principalId,
      provider: "google",
      account: {
        providerAccountId: `acct-${accountSeq}`,
        email: `u${accountSeq}@gmail.com`,
        displayName: "User",
      },
      capabilities: ["readEvents"],
      state,
      stateReason: null,
    });
    return c._id;
  };

  // Ensure a fresh events resource on a connection, plus busy occurrences.
  const seedCalendar = async (
    tenantId: TenantId,
    principalId: PrincipalId,
    connectionId: string,
    intervals: Array<[string, string]>,
  ) => {
    const calendarId = objectId();
    const resource = await resources.ensure({
      tenantId,
      principalId,
      connectionId: connectionId as never,
      resourceKind: "events",
      calendarId: calendarId as never,
    });
    await resources.advanceCursor(
      tenantId,
      principalId,
      resource._id,
      "cursor",
      new Date(),
    );
    for (const [start, end] of intervals) {
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
        title: "secret meeting",
      });
    }
    return calendarId;
  };

  const post = (headers: Record<string, string>, body: unknown) =>
    fetch(`${base}${AVAILABILITY_BUSY_PATH}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

  const validBody = (calendarIds: string[]) => ({
    calendarIds,
    start: "2026-07-14T09:00:00.000Z",
    end: "2026-07-14T17:00:00.000Z",
    maxAgeMs: 15 * 60_000,
    purpose: "booking_confirmation" as const,
  });

  it("rejects a request that is not signed", async () => {
    await startService();
    const res = await post(
      { "content-type": "application/json" },
      validBody([objectId()]),
    );
    expect(res.status).toBe(401);
  });

  it("rejects a window longer than 60 days", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    await startService();
    const res = await post(signedHeaders(tenantId, principalId), {
      ...validBody([objectId()]),
      start: "2026-07-01T00:00:00.000Z",
      end: "2026-10-01T00:00:00.000Z", // ~92 days
    });
    expect(res.status).toBe(400);
  });

  it("rejects an empty calendar list", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    await startService();
    const res = await post(signedHeaders(tenantId, principalId), validBody([]));
    expect(res.status).toBe(400);
  });

  it("returns merged busy intervals with freshness evidence and no event content", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    await startService();
    const conn = await seedConnection(tenantId, principalId, "healthy");
    const cal = await seedCalendar(tenantId, principalId, conn, [
      ["2026-07-14T09:00:00.000Z", "2026-07-14T10:00:00.000Z"],
      ["2026-07-14T09:30:00.000Z", "2026-07-14T11:00:00.000Z"],
    ]);

    const res = await post(
      signedHeaders(tenantId, principalId),
      validBody([cal]),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.intervals).toEqual([
      {
        start: "2026-07-14T09:00:00.000Z",
        end: "2026-07-14T11:00:00.000Z",
        hostIsOrganizer: true,
        hostResponseStatus: null,
      },
    ]);
    expect(body.complete).toBe(true);
    expect(body.bookable).toBe(true);
    expect(body.issues).toEqual([]);
    expect(body.connections).toHaveLength(1);
    expect(body.connections[0].state).toBe("healthy");
    // Event content must never leak into the availability response.
    expect(JSON.stringify(body)).not.toContain("secret meeting");
  });
});
