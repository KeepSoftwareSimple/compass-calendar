import { faker } from "@faker-js/faker";
import { type Db, MongoClient } from "mongodb";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import {
  installIndexManifest,
  SYNC_INDEX_MANIFEST,
} from "@sync/storage/index-manifest";

const uri = process.env["SYNC_MONGO_URI"] as string;

describe("installIndexManifest", () => {
  let client: MongoClient;
  let db: Db;

  // Connect and install ONCE. Installing the manifest is ~25 createIndex
  // round-trips; doing it per test made each test ~1s even uncontended, and the
  // per-test dropDatabase serialized DDL on the shared mongod and raced the next
  // test's writes ("database is in the process of being dropped") under the
  // parallel runner. Install is deterministic, so one install serves every
  // read-only assertion; the two write tests clear their own collections.
  beforeAll(async () => {
    client = new MongoClient(uri);
    await client.connect();
    db = client.db(`manifest_${faker.database.mongodbObjectId()}`);
    await installIndexManifest(db);
  });

  beforeEach(async () => {
    await Promise.all([
      db.collection(SYNC_COLLECTIONS.commands).deleteMany({}),
      db.collection(SYNC_COLLECTIONS.events).deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
  });

  it("creates every declared collection", async () => {
    const names = new Set(
      (await db.listCollections({}, { nameOnly: true }).toArray()).map(
        (c) => c.name,
      ),
    );
    for (const collection of Object.values(SYNC_COLLECTIONS)) {
      expect(names.has(collection)).toBe(true);
    }
  });

  it("creates the declared indexes for a collection", async () => {
    const indexes = await db.collection(SYNC_COLLECTIONS.commands).indexes();
    const names = indexes.map((i) => i.name);
    expect(names).toContain("idempotency_key");
    const idempotency = indexes.find((i) => i.name === "idempotency_key");
    expect(idempotency?.unique).toBe(true);
  });

  it("is idempotent — running twice does not throw", async () => {
    await installIndexManifest(db);
    await installIndexManifest(db);
    const indexes = await db
      .collection(SYNC_COLLECTIONS.providerConnections)
      .indexes();
    // The unique provider-account identity index exists exactly once.
    expect(
      indexes.filter((i) => i.name === "provider_account_identity"),
    ).toHaveLength(1);
  });

  it("installs a TTL index on deletion markers", async () => {
    const indexes = await db
      .collection(SYNC_COLLECTIONS.deletionMarkers)
      .indexes();
    const ttl = indexes.find((i) => i.name === "ttl_expiry");
    expect(ttl?.expireAfterSeconds).toBe(0);
  });

  it("installs a partial disconnectedAt index for retention sweeps", async () => {
    const indexes = await db
      .collection(SYNC_COLLECTIONS.providerConnections)
      .indexes();
    const disconnected = indexes.find((i) => i.name === "disconnected_at");
    expect(disconnected).toBeDefined();
    expect(disconnected?.partialFilterExpression).toEqual({
      disconnectedAt: { $type: "date" },
    });
  });

  it("installs a unique diagnostic_key index for support lookup", async () => {
    const indexes = await db
      .collection(SYNC_COLLECTIONS.providerConnections)
      .indexes();
    const diagnostic = indexes.find((i) => i.name === "diagnostic_key");
    expect(diagnostic?.unique).toBe(true);
    expect(diagnostic?.partialFilterExpression).toEqual({
      diagnosticKey: { $type: "string" },
    });
  });

  it("installs principal keyset and TTL indexes on invalidations", async () => {
    const indexes = await db
      .collection(SYNC_COLLECTIONS.invalidations)
      .indexes();
    expect(indexes.some((i) => i.name === "principal_id")).toBe(true);
    const ttl = indexes.find((i) => i.name === "ttl_expiry");
    expect(ttl?.expireAfterSeconds).toBe(0);
  });

  it("installs due-claim and connection-led indexes on jobs", async () => {
    const indexes = await db.collection(SYNC_COLLECTIONS.jobs).indexes();
    const dueClaim = indexes.find((i) => i.name === "state_runafter_priority");
    expect(dueClaim?.key).toEqual({ state: 1, runAfter: 1, priority: -1 });
    // The priority-led predecessor walked every pending-not-due row on idle claim.
    expect(indexes.some((i) => i.name === "state_priority_runafter")).toBe(
      false,
    );
    expect(indexes.some((i) => i.name === "connection_runafter")).toBe(true);
    const lastErrorAt = indexes.find(
      (i) => i.name === "connection_lasterrorat",
    );
    expect(lastErrorAt?.key).toEqual({ connectionId: 1, lastErrorAt: 1 });
    expect(lastErrorAt?.sparse).toBe(true);
  });

  it("installs owner-calendar and resourceKind-led indexes on sync_resources", async () => {
    const indexes = await db
      .collection(SYNC_COLLECTIONS.syncResources)
      .indexes();
    expect(indexes.some((i) => i.name === "principal_resource_calendar")).toBe(
      true,
    );
    const lastSuccess = indexes.find((i) => i.name === "resource_last_success");
    expect(lastSuccess?.key).toEqual({ resourceKind: 1, lastSuccessAt: 1 });
    const lastAttempt = indexes.find((i) => i.name === "resource_last_attempt");
    expect(lastAttempt?.key).toEqual({ resourceKind: 1, lastAttemptAt: 1 });
    expect(indexes.some((i) => i.name === "last_success")).toBe(false);
    expect(indexes.some((i) => i.name === "last_attempt")).toBe(false);
    const bootstrapStalled = indexes.find(
      (i) => i.name === "resource_bootstrap_stalled",
    );
    expect(bootstrapStalled?.key).toEqual({
      resourceKind: 1,
      bootstrapState: 1,
      updatedAt: 1,
    });
  });

  it("enforces the unique command idempotency key", async () => {
    const commands = db.collection(SYNC_COLLECTIONS.commands);
    const key = {
      tenantId: "t",
      principalId: "p",
      idempotencyKey: "k",
    };
    await commands.insertOne(key);
    await expect(commands.insertOne(key)).rejects.toThrow();
  });

  it("drops an index the manifest no longer declares", async () => {
    // A stray index (e.g. left by an older manifest) must be reconciled away so
    // a renamed index can take a key the old same-named one would have blocked.
    const events = db.collection(SYNC_COLLECTIONS.events);
    await events.createIndex({ title: 1 }, { name: "stale_legacy_index" });
    expect(
      (await events.indexes()).some((i) => i.name === "stale_legacy_index"),
    ).toBe(true);

    await installIndexManifest(db);

    expect(
      (await events.indexes()).some((i) => i.name === "stale_legacy_index"),
    ).toBe(false);
    // A declared index is still present.
    expect(
      (await events.indexes()).some(
        (i) => i.name === "provider_event_identity",
      ),
    ).toBe(true);
  });

  it("installs calendar_gen_start with endAt on event_occurrences", async () => {
    const indexes = await db
      .collection(SYNC_COLLECTIONS.eventOccurrences)
      .indexes();
    const calendarGenStart = indexes.find(
      (i) => i.name === "calendar_gen_start",
    );
    expect(calendarGenStart?.key).toEqual({
      calendarId: 1,
      generation: 1,
      startAt: 1,
      endAt: 1,
      _id: 1,
    });
  });

  it("covers every collection in the manifest", () => {
    expect(Object.keys(SYNC_INDEX_MANIFEST).sort()).toEqual(
      Object.values(SYNC_COLLECTIONS).sort(),
    );
  });

  it("allows many unlinked events while still rejecting duplicate provider identities", async () => {
    const events = db.collection(SYNC_COLLECTIONS.events);

    // Multiple unlinked events store provider fields as null; the partial
    // unique index must not collide them (regression for the sparse hazard).
    await events.insertOne({
      principalId: "p",
      connectionId: null,
      calendarId: null,
      providerEventId: null,
    });
    await events.insertOne({
      principalId: "p",
      connectionId: null,
      calendarId: null,
      providerEventId: null,
    });
    expect(await events.countDocuments()).toBe(2);

    // Two genuinely linked events with the same provider identity DO collide.
    const linked = {
      principalId: "p",
      connectionId: "c",
      calendarId: "cal",
      providerEventId: "evt-1",
    };
    await events.insertOne(linked);
    await expect(events.insertOne({ ...linked })).rejects.toThrow();
  });
});
