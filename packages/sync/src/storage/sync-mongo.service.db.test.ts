import { faker } from "@faker-js/faker";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import {
  assertForbiddenDatabaseUnreachable,
  mongoClientPoolOptions,
  SyncMongoService,
} from "@sync/storage/sync-mongo.service";

const uri = process.env["SYNC_MONGO_URI"] as string;

const uniqueDbName = () => `svc_${faker.database.mongodbObjectId()}`;

// The tests that need a healthy connection share ONE — connecting installs the
// ~25-index manifest, so connecting per test made this file needlessly slow and,
// with a per-test dropDatabase, raced other files' DDL on the shared mongod.
// The connection-failure tests connect their own (failed) service, which never
// installs because connect() rejects before the install step.
describe("SyncMongoService when connected", () => {
  let service: SyncMongoService;

  beforeAll(async () => {
    service = new SyncMongoService();
    await service.connect({
      uri,
      databaseName: uniqueDbName(),
      forbiddenDatabaseName: "prod_calendar",
      enforceLeastPrivilege: false,
    });
  });

  afterAll(async () => {
    await service.disconnect();
  });

  it("connects, installs manifests, and exposes the db", async () => {
    expect(service.isConnected).toBe(true);
    const names = new Set(
      (await service.db.listCollections({}, { nameOnly: true }).toArray()).map(
        (c) => c.name,
      ),
    );
    expect(names.has(SYNC_COLLECTIONS.providerConnections)).toBe(true);
  });

  it("opens a warm compressed pool", () => {
    const options = mongoClientPoolOptions();
    expect(service.client.options.minPoolSize).toBe(options.minPoolSize);
    expect(service.client.options.maxIdleTimeMS).toBe(options.maxIdleTimeMS);
    expect(service.client.options.compressors).toEqual(
      options.compressors ?? [],
    );
  });

  it("supports multi-document transactions (replica set)", async () => {
    const collection = service.db.collection(SYNC_COLLECTIONS.jobs);
    const session = service.client.startSession();
    try {
      await session.withTransaction(async () => {
        await collection.insertOne({ coalescingKey: "a" }, { session });
        await collection.insertOne({ coalescingKey: "b" }, { session });
      });
    } finally {
      await session.endSession();
    }
    expect(await collection.countDocuments()).toBe(2);
  });
});

describe("SyncMongoService connection failures", () => {
  it("throws when db is accessed before connecting", () => {
    const service = new SyncMongoService();
    expect(() => service.db).toThrow(/not connected/);
  });

  it("refuses to start in staging when the forbidden database is readable", async () => {
    // The in-memory server has no auth, so the forbidden database IS reachable.
    // With enforcement on (staging), the least-privilege guard must detect the
    // excessive access and abort startup rather than run over-privileged. The
    // guard rejects before the manifest install, so nothing is left connected.
    const service = new SyncMongoService();
    await expect(
      service.connect({
        uri,
        databaseName: uniqueDbName(),
        forbiddenDatabaseName: "prod_calendar",
        enforceLeastPrivilege: true,
      }),
    ).rejects.toThrow(/excessive privileges/);
  });

  it("fails to connect against an unreachable server", async () => {
    const service = new SyncMongoService();
    await expect(
      service.connect({
        // Reserved TEST-NET address; connection is refused quickly.
        uri: "mongodb://192.0.2.1:27017/compass_sync?serverSelectionTimeoutMS=500&connectTimeoutMS=500",
        forbiddenDatabaseName: "prod_calendar",
        enforceLeastPrivilege: false,
      }),
    ).rejects.toThrow();
  });
});

describe("assertForbiddenDatabaseUnreachable (least-privilege logic)", () => {
  it("passes when the probe is denied with an authorization error", async () => {
    await expect(
      assertForbiddenDatabaseUnreachable(() =>
        Promise.reject({ code: 13, message: "Unauthorized" }),
      ),
    ).resolves.toBeUndefined();
  });

  it("passes on an Atlas authorization error code", async () => {
    await expect(
      assertForbiddenDatabaseUnreachable(() =>
        Promise.reject({ code: 8000, message: "AtlasError: not authorized" }),
      ),
    ).resolves.toBeUndefined();
  });

  it("fails when the probe SUCCEEDS (over-privileged user)", async () => {
    await expect(
      assertForbiddenDatabaseUnreachable(() => Promise.resolve({ ok: 1 })),
    ).rejects.toThrow(/excessive privileges/);
  });

  it("rethrows a non-authorization error unchanged", async () => {
    await expect(
      assertForbiddenDatabaseUnreachable(() =>
        Promise.reject(new Error("network down")),
      ),
    ).rejects.toThrow("network down");
  });
});
