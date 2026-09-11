import { faker } from "@faker-js/faker";
import {
  type ConnectionId,
  type PrincipalId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import {
  INVALIDATION_RETENTION_MS,
  InvalidationRepository,
} from "@sync/storage/repositories/invalidation.repository";
import { beforeEach, describe, expect, it } from "bun:test";

const objectId = () => faker.database.mongodbObjectId();

describe("InvalidationRepository", () => {
  const storage = setupSyncStorage(import.meta.url);
  let repo: InvalidationRepository;

  beforeEach(() => {
    repo = new InvalidationRepository(storage.db());
  });

  it("appends a content-free invalidation with TTL expiry", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const connectionId = objectId() as ConnectionId;
    const emittedAt = new Date("2026-07-24T12:00:00.000Z");

    const row = await repo.append({
      tenantId: tenantId,
      principalId: principalId,
      invalidation: { kind: "connection", connectionId },
      emittedAt,
    });

    expect(row.invalidation).toEqual({
      kind: "connection",
      connectionId,
    });
    expect(row.emittedAt).toEqual(emittedAt);
    expect(row.expiresAt.getTime()).toBe(
      emittedAt.getTime() + INVALIDATION_RETENTION_MS,
    );
    // Never store event content on the outbox row.
    expect(Object.keys(row.invalidation).sort()).toEqual([
      "connectionId",
      "kind",
    ]);
  });

  it("appendMany writes every invalidation with the same emittedAt/TTL", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const connectionId = objectId() as ConnectionId;
    const eventId = objectId() as never;
    const calendarId = objectId() as never;
    const emittedAt = new Date("2026-07-24T12:00:00.000Z");

    const rows = await repo.appendMany(
      tenantId,
      principalId,
      [
        { kind: "connection", connectionId },
        { kind: "event", eventId, calendarId },
      ],
      emittedAt,
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.invalidation.kind).sort()).toEqual([
      "connection",
      "event",
    ]);
    for (const row of rows) {
      expect(row.emittedAt).toEqual(emittedAt);
      expect(row.expiresAt.getTime()).toBe(
        emittedAt.getTime() + INVALIDATION_RETENTION_MS,
      );
    }
    // Every row actually landed in storage, not just returned in memory.
    const listed = await repo.listAfter(tenantId, principalId, null, 10);
    expect(listed).toHaveLength(2);
  });

  it("appendMany is a no-op for an empty list", async () => {
    const rows = await repo.appendMany(
      objectId() as TenantId,
      objectId() as PrincipalId,
      [],
    );
    expect(rows).toEqual([]);
  });

  it("keyset-lists only the caller's rows after a cursor", async () => {
    const tenantId = objectId() as TenantId;
    const mine = objectId() as PrincipalId;
    const other = objectId() as PrincipalId;
    const connectionId = objectId() as ConnectionId;

    const first = await repo.append({
      tenantId: tenantId,
      principalId: mine,
      invalidation: { kind: "connection", connectionId },
      emittedAt: new Date(),
    });
    const second = await repo.append({
      tenantId: tenantId,
      principalId: mine,
      invalidation: {
        kind: "event",
        eventId: objectId() as never,
        calendarId: objectId() as never,
      },
      emittedAt: new Date(),
    });
    await repo.append({
      tenantId: tenantId,
      principalId: other,
      invalidation: { kind: "connection", connectionId },
      emittedAt: new Date(),
    });

    const page = await repo.listAfter(tenantId, mine, first._id, 10);
    expect(page.map((r) => r._id)).toEqual([second._id]);
  });

  it("has a TTL index that expires rows by expiresAt", async () => {
    const indexes = await storage
      .db()
      .collection(SYNC_COLLECTIONS.invalidations)
      .indexes();
    const ttl = indexes.find((i) => i.name === "ttl_expiry");
    expect(ttl?.key).toEqual({ expiresAt: 1 });
    expect(ttl?.expireAfterSeconds).toBe(0);
  });

  describe("global (cross-tenant) scan — backs the multiplexed change-feed poll", () => {
    it("keyset-lists rows across every tenant/principal after a cursor", async () => {
      const connectionId = objectId() as ConnectionId;
      const first = await repo.append({
        tenantId: objectId() as TenantId,
        principalId: objectId() as PrincipalId,
        invalidation: { kind: "connection", connectionId },
        emittedAt: new Date(),
      });
      const second = await repo.append({
        tenantId: objectId() as TenantId,
        principalId: objectId() as PrincipalId,
        invalidation: { kind: "connection", connectionId },
        emittedAt: new Date(),
      });
      const third = await repo.append({
        tenantId: objectId() as TenantId,
        principalId: objectId() as PrincipalId,
        invalidation: { kind: "connection", connectionId },
        emittedAt: new Date(),
      });

      const fromStart = await repo.listAfterGlobal(null, 10);
      expect(fromStart.map((r) => r._id)).toEqual([
        first._id,
        second._id,
        third._id,
      ]);

      const page = await repo.listAfterGlobal(first._id, 10);
      expect(page.map((r) => r._id)).toEqual([second._id, third._id]);
    });

    it("bounds the global page to the given limit", async () => {
      const connectionId = objectId() as ConnectionId;
      for (let i = 0; i < 3; i += 1) {
        await repo.append({
          tenantId: objectId() as TenantId,
          principalId: objectId() as PrincipalId,
          invalidation: { kind: "connection", connectionId },
          emittedAt: new Date(),
        });
      }

      const page = await repo.listAfterGlobal(null, 2);
      expect(page).toHaveLength(2);
    });

    it("reports the highest retained id across every tenant/principal, or null when empty", async () => {
      expect(await repo.latestIdGlobal()).toBeNull();

      const connectionId = objectId() as ConnectionId;
      await repo.append({
        tenantId: objectId() as TenantId,
        principalId: objectId() as PrincipalId,
        invalidation: { kind: "connection", connectionId },
        emittedAt: new Date(),
      });
      const last = await repo.append({
        tenantId: objectId() as TenantId,
        principalId: objectId() as PrincipalId,
        invalidation: { kind: "connection", connectionId },
        emittedAt: new Date(),
      });

      expect(await repo.latestIdGlobal()).toBe(last._id);
    });
  });
});
