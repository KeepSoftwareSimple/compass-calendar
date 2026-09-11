import { faker } from "@faker-js/faker";
import { ObjectId } from "mongodb";
import { NodeEnv } from "@core/constants/core.constants";
import {
  type ConnectionId,
  type PrincipalId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { createSyncService, type SyncService } from "@sync/app";
import {
  signInternalRequest,
  signServiceRequest,
} from "@sync/auth/internal-auth";
import { type SyncConfig } from "@sync/config/sync.config";
import {
  CHANGES_ALL_PATH,
  CHANGES_PATH,
} from "@sync/server/change-feed.routes";
import { InvalidationRepository } from "@sync/storage/repositories/invalidation.repository";
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
    ...overrides,
  }) as SyncConfig;

const signedHeaders = (
  tenantId: string,
  principalId: string,
): Record<string, string> => {
  const timestamp = Date.now();
  return {
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

const serviceHeaders = (): Record<string, string> => {
  const timestamp = Date.now();
  return {
    "x-sync-timestamp": String(timestamp),
    "x-sync-signature": signServiceRequest(SECRET, timestamp),
  };
};

describe("GET /internal/changes", () => {
  let mongo: SyncMongoService;
  let invalidations: InvalidationRepository;
  let service: SyncService;
  let base: string;

  const startService = async (config: SyncConfig = testConfig()) => {
    service = createSyncService(config, { mongo });
    await new Promise<void>((resolve) => service.httpServer.listen(0, resolve));
    const { port } = service.httpServer.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
  };

  const get = (tenantId: string, principalId: string, query = "") =>
    fetch(`${base}${CHANGES_PATH}${query}`, {
      headers: signedHeaders(tenantId, principalId),
    });

  beforeEach(() => {
    mongo = storage.mongo();
    invalidations = new InvalidationRepository(mongo.db);
  });

  afterEach(async () => {
    await service?.stop();
  });

  it("returns an empty page and watermark cursor when resuming from now", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    await startService();

    const res = await get(tenantId, principalId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      kind: string;
      invalidations: unknown[];
      nextCursor: string;
    };
    expect(body.kind).toBe("ok");
    expect(body.invalidations).toEqual([]);
    expect(ObjectId.isValid(body.nextCursor)).toBe(true);
  });

  it("delivers appended invalidations on resume and advances the cursor", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const connectionId = objectId() as ConnectionId;
    await startService();

    // Seed so "from now" watermarks at a real outbox id (avoids same-second
    // ObjectId races against a freshly minted empty-outbox cursor).
    await invalidations.append({
      tenantId: tenantId,
      principalId: principalId,
      invalidation: {
        kind: "command",
        commandId: objectId() as never,
      },
      emittedAt: new Date(),
    });

    const boot = (await (await get(tenantId, principalId)).json()) as {
      nextCursor: string;
    };

    await invalidations.append({
      tenantId: tenantId,
      principalId: principalId,
      invalidation: { kind: "connection", connectionId },
      emittedAt: new Date(),
    });
    await invalidations.append({
      tenantId: tenantId,
      principalId: principalId,
      invalidation: {
        kind: "event",
        eventId: objectId() as never,
        calendarId: objectId() as never,
      },
      emittedAt: new Date(),
    });

    const page = (await (
      await get(tenantId, principalId, `?cursor=${boot.nextCursor}`)
    ).json()) as {
      kind: string;
      invalidations: Array<{
        invalidation: { kind: string };
        emittedAt: string;
      }>;
      nextCursor: string;
    };

    expect(page.kind).toBe("ok");
    expect(page.invalidations.map((e) => e.invalidation.kind)).toEqual([
      "connection",
      "event",
    ]);
    expect(typeof page.invalidations[0]!.emittedAt).toBe("string");
    // Wire envelopes never carry event content — only the invalidation union.
    expect(Object.keys(page.invalidations[0]!).sort()).toEqual([
      "emittedAt",
      "invalidation",
    ]);

    const idle = (await (
      await get(tenantId, principalId, `?cursor=${page.nextCursor}`)
    ).json()) as { invalidations: unknown[] };
    expect(idle.invalidations).toEqual([]);
  });

  it("never leaks another principal's invalidations", async () => {
    const tenantId = objectId() as TenantId;
    const mine = objectId();
    const other = objectId() as PrincipalId;
    await startService();

    const boot = (await (await get(tenantId, mine)).json()) as {
      nextCursor: string;
    };
    await invalidations.append({
      tenantId: tenantId,
      principalId: other,
      invalidation: {
        kind: "connection",
        connectionId: objectId() as ConnectionId,
      },
      emittedAt: new Date(),
    });

    const page = (await (
      await get(tenantId, mine, `?cursor=${boot.nextCursor}`)
    ).json()) as { invalidations: unknown[] };
    expect(page.invalidations).toEqual([]);
  });

  it("returns resyncRequired for a malformed or expired cursor", async () => {
    await startService();
    const tenantId = objectId();
    const principalId = objectId();

    const bad = await get(tenantId, principalId, "?cursor=not-an-object-id");
    expect(await bad.json()).toEqual({ kind: "resyncRequired" });

    // ObjectId from ~8 days ago is outside the 7-day retention window.
    const stale = ObjectId.createFromTime(
      Math.floor((Date.now() - 8 * 24 * 60 * 60 * 1000) / 1000),
    ).toHexString();
    const expired = await get(tenantId, principalId, `?cursor=${stale}`);
    expect(await expired.json()).toEqual({ kind: "resyncRequired" });
  });

  it("serves the feed in passive mode", async () => {
    await startService(testConfig({ EXECUTION: "passive" }));
    const res = await get(objectId(), objectId());
    expect(res.status).toBe(200);
    expect((await res.json()) as { kind: string }).toMatchObject({
      kind: "ok",
    });
  });

  it("rejects an unsigned request", async () => {
    await startService();
    const res = await fetch(`${base}${CHANGES_PATH}`);
    expect(res.status).toBe(401);
  });
});

describe("GET /internal/changes/all (the multiplexed, cross-tenant feed)", () => {
  let mongo: SyncMongoService;
  let invalidations: InvalidationRepository;
  let service: SyncService;
  let base: string;

  const startService = async (config: SyncConfig = testConfig()) => {
    service = createSyncService(config, { mongo });
    await new Promise<void>((resolve) => service.httpServer.listen(0, resolve));
    const { port } = service.httpServer.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
  };

  const getGlobal = (query = "") =>
    fetch(`${base}${CHANGES_ALL_PATH}${query}`, { headers: serviceHeaders() });

  beforeEach(() => {
    mongo = storage.mongo();
    invalidations = new InvalidationRepository(mongo.db);
  });

  afterEach(async () => {
    await service?.stop();
  });

  it("returns an empty page and watermark cursor when resuming from now", async () => {
    await startService();
    const res = await getGlobal();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      kind: string;
      invalidations: unknown[];
      nextCursor: string;
    };
    expect(body.kind).toBe("ok");
    expect(body.invalidations).toEqual([]);
    expect(ObjectId.isValid(body.nextCursor)).toBe(true);
  });

  it("delivers invalidations across DIFFERENT tenants/principals, each tagged with its owner", async () => {
    await startService();
    const tenantA = objectId() as TenantId;
    const principalA = objectId() as PrincipalId;
    const tenantB = objectId() as TenantId;
    const principalB = objectId() as PrincipalId;

    const boot = (await (await getGlobal()).json()) as { nextCursor: string };

    await invalidations.append({
      tenantId: tenantA,
      principalId: principalA,
      invalidation: { kind: "connection", connectionId: objectId() as never },
      emittedAt: new Date(),
    });
    await invalidations.append({
      tenantId: tenantB,
      principalId: principalB,
      invalidation: {
        kind: "event",
        eventId: objectId() as never,
        calendarId: objectId() as never,
      },
      emittedAt: new Date(),
    });

    const page = (await (
      await getGlobal(`?cursor=${boot.nextCursor}`)
    ).json()) as {
      kind: string;
      invalidations: Array<{
        invalidation: { kind: string };
        tenantId: string;
        principalId: string;
      }>;
    };

    expect(page.kind).toBe("ok");
    expect(
      page.invalidations.map((e) => [
        e.invalidation.kind,
        e.tenantId,
        e.principalId,
      ]),
    ).toEqual([
      ["connection", tenantA, principalA],
      ["event", tenantB, principalB],
    ]);
  });

  it("returns resyncRequired for a malformed or expired cursor", async () => {
    await startService();

    const bad = await getGlobal("?cursor=not-an-object-id");
    expect(await bad.json()).toEqual({ kind: "resyncRequired" });

    const stale = ObjectId.createFromTime(
      Math.floor((Date.now() - 8 * 24 * 60 * 60 * 1000) / 1000),
    ).toHexString();
    const expired = await getGlobal(`?cursor=${stale}`);
    expect(await expired.json()).toEqual({ kind: "resyncRequired" });
  });

  it("serves the feed in passive mode", async () => {
    await startService(testConfig({ EXECUTION: "passive" }));
    const res = await getGlobal();
    expect(res.status).toBe(200);
  });

  it("rejects an unsigned request", async () => {
    await startService();
    const res = await fetch(`${base}${CHANGES_ALL_PATH}`);
    expect(res.status).toBe(401);
  });

  it("rejects a per-principal-signed request (wrong scheme)", async () => {
    await startService();
    const res = await fetch(`${base}${CHANGES_ALL_PATH}`, {
      headers: signedHeaders(objectId(), objectId()),
    });
    expect(res.status).toBe(401);
  });
});
