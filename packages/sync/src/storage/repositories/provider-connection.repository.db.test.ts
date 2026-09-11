import { faker } from "@faker-js/faker";
import { type Db } from "mongodb";
import {
  type PrincipalId,
  type ProviderAccountId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { deriveDiagnosticKey } from "@sync/safety/diagnostic-key";
import { type ProviderConnectionUpsert } from "@sync/storage/contracts/provider-connection.contracts";
import { ProviderConnectionRepository } from "@sync/storage/repositories/provider-connection.repository";

const objectId = () => faker.database.mongodbObjectId();

const baseUpsert = (
  overrides: Partial<ProviderConnectionUpsert> = {},
): ProviderConnectionUpsert =>
  ({
    tenantId: objectId() as TenantId,
    principalId: objectId() as PrincipalId,
    provider: "google",
    account: {
      providerAccountId: "acct-1" as ProviderAccountId,
      email: "user@gmail.com",
      displayName: "User",
    },
    capabilities: ["readEvents"],
    state: "importing",
    stateReason: null,
    ...overrides,
  }) as ProviderConnectionUpsert;

describe("ProviderConnectionRepository", () => {
  const storage = setupSyncStorage(import.meta.url);
  let db: Db;
  let repo: ProviderConnectionRepository;

  beforeEach(() => {
    db = storage.db();
    repo = new ProviderConnectionRepository(db);
  });

  it("assigns a stable id and timestamps on first upsert", async () => {
    const created = await repo.upsertByProviderAccount(baseUpsert());
    expect(created._id).toMatch(/^[0-9a-f]{24}$/);
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created.state).toBe("importing");
    // A fresh connection carries no disconnect evidence.
    expect(created.disconnectedAt).toBeNull();
    expect(created.diagnosticKey).toBe(deriveDiagnosticKey(created._id));
  });

  it("finds a connection by diagnostic key", async () => {
    const created = await repo.upsertByProviderAccount(baseUpsert());
    const found = await repo.findByDiagnosticKey(created.diagnosticKey);
    expect(found?._id).toBe(created._id);
    expect(await repo.findByDiagnosticKey("b".repeat(32))).toBeNull();
  });

  it("clears disconnect evidence when the account reconnects via upsert", async () => {
    const upsert = baseUpsert();
    const created = await repo.upsertByProviderAccount(upsert);
    await repo.markDisconnected(
      created.tenantId,
      created.principalId,
      created._id,
    );

    // Re-authorizing the same account upserts a live state; disconnectedAt must
    // not linger, or the row would be internally contradictory (live state,
    // non-null disconnectedAt) and a re-deriving worker would see it as gone.
    const reconnected = await repo.upsertByProviderAccount({
      ...upsert,
      state: "healthy",
    });

    expect(reconnected._id).toBe(created._id);
    expect(reconnected.state).toBe("healthy");
    expect(reconnected.disconnectedAt).toBeNull();
  });

  it("reconnecting the same account updates one document, not two", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const first = await repo.upsertByProviderAccount(
      baseUpsert({ tenantId, principalId }),
    );
    const second = await repo.upsertByProviderAccount(
      baseUpsert({ tenantId, principalId, state: "healthy" }),
    );

    expect(second._id).toBe(first._id);
    expect(second.createdAt).toEqual(first.createdAt);
    expect(second.state).toBe("healthy");
    const all = await repo.listByPrincipal(tenantId, principalId);
    expect(all).toHaveLength(1);
  });

  it("keeps multiple accounts for one principal isolated", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    await repo.upsertByProviderAccount(
      baseUpsert({
        tenantId,
        principalId,
        account: {
          providerAccountId: "acct-1" as ProviderAccountId,
          email: "a@x.com",
          displayName: null,
        },
      }),
    );
    await repo.upsertByProviderAccount(
      baseUpsert({
        tenantId,
        principalId,
        account: {
          providerAccountId: "acct-2" as ProviderAccountId,
          email: "b@x.com",
          displayName: null,
        },
      }),
    );
    const all = await repo.listByPrincipal(tenantId, principalId);
    expect(all).toHaveLength(2);
  });

  it("updates capabilities on reconnect", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    await repo.upsertByProviderAccount(
      baseUpsert({ tenantId, principalId, capabilities: ["readEvents"] }),
    );
    const updated = await repo.upsertByProviderAccount(
      baseUpsert({
        tenantId,
        principalId,
        capabilities: ["readEvents", "writeEvents", "changeNotifications"],
      }),
    );
    expect(updated.capabilities).toEqual([
      "readEvents",
      "writeEvents",
      "changeNotifications",
    ]);
  });

  it("keeps prior lastHealthyAt when the same account reconnects", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const created = await repo.upsertByProviderAccount(
      baseUpsert({ tenantId, principalId }),
    );
    const healthyAt = new Date("2026-07-01T00:00:00.000Z");
    await repo.updateDerivedState(
      created.tenantId,
      created.principalId,
      created._id,
      {
        state: "healthy",
        stateReason: null,
        lastSyncedAt: healthyAt,
        lastHealthyAt: healthyAt,
      },
      healthyAt,
    );

    const reconnected = await repo.upsertByProviderAccount(
      baseUpsert({ tenantId, principalId, state: "importing" }),
    );

    expect(reconnected._id).toBe(created._id);
    expect(reconnected.state).toBe("importing");
    expect(reconnected.lastHealthyAt).toEqual(healthyAt);
    expect(reconnected.lastSyncedAt).toEqual(healthyAt);
  });

  it("does not leak one principal's connections to another", async () => {
    const tenantId = objectId() as TenantId;
    const mine = objectId() as PrincipalId;
    const theirs = objectId() as PrincipalId;
    const created = await repo.upsertByProviderAccount(
      baseUpsert({ tenantId, principalId: mine }),
    );

    expect(await repo.listByPrincipal(tenantId, theirs)).toHaveLength(0);
    expect(await repo.findById(tenantId, theirs, created._id)).toBeNull();
    expect(await repo.findById(tenantId, mine, created._id)).not.toBeNull();
  });

  it("rejects an actionRequired upsert with no reason before any write lands", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    await expect(
      repo.upsertByProviderAccount(
        baseUpsert({
          tenantId,
          principalId,
          state: "actionRequired",
          stateReason: null,
        }),
      ),
    ).rejects.toThrow();
    // Nothing was persisted — the invalid state never reached Mongo.
    expect(await repo.listByPrincipal(tenantId, principalId)).toHaveLength(0);
  });

  it("rejects a raw duplicate insert violating the unique account identity", async () => {
    const shared = {
      tenantId: objectId() as TenantId,
      principalId: objectId() as PrincipalId,
      provider: "google",
      account: {
        providerAccountId: "dup" as ProviderAccountId,
        email: null,
        displayName: null,
      },
    };
    const collection = db.collection("provider_connections");
    await collection.insertOne({ _id: objectId(), ...shared } as never);
    await expect(
      collection.insertOne({ _id: objectId(), ...shared } as never),
    ).rejects.toThrow();
  });
});
