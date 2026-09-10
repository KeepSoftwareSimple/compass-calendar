import { faker } from "@faker-js/faker";
import { type Db } from "mongodb";
import { stringIdFilter } from "@sync/__tests__/helpers/mongo-id";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { type DeletionMarkerRecordInput } from "@sync/storage/contracts/deletion-marker.contracts";
import {
  DELETION_MARKER_RETENTION_MS,
  DeletionMarkerRepository,
} from "@sync/storage/repositories/deletion-marker.repository";

const objectId = () => faker.database.mongodbObjectId();

const markerInput = (
  overrides: Partial<DeletionMarkerRecordInput> = {},
): DeletionMarkerRecordInput =>
  ({
    tenantId: objectId(),
    principalId: objectId(),
    connectionId: objectId(),
    calendarId: objectId(),
    providerEventId: "evt-deleted",
    providerVersion: "etag-9",
    deletionSource: "compass",
    deletedAt: new Date("2026-07-20T12:00:00.000Z"),
    ...overrides,
  }) as DeletionMarkerRecordInput;

describe("DeletionMarkerRepository", () => {
  const storage = setupSyncStorage(import.meta.url);
  let db: Db;
  let repo: DeletionMarkerRepository;

  beforeEach(() => {
    db = storage.db();
    repo = new DeletionMarkerRepository(db);
  });

  it("records a content-free marker with a 30-day expiry", async () => {
    const marker = await repo.record(markerInput());
    expect(marker.expiresAt.getTime()).toBe(
      marker.deletedAt.getTime() + DELETION_MARKER_RETENTION_MS,
    );
    // No event content is stored — only identity/version/source/timestamps.
    const doc = await db
      .collection("deletion_markers")
      .findOne(stringIdFilter(marker._id));
    expect(Object.keys(doc ?? {}).sort()).toEqual(
      [
        "_id",
        "calendarId",
        "connectionId",
        "deletedAt",
        "deletionSource",
        "expiresAt",
        "principalId",
        "providerEventId",
        "providerVersion",
        "tenantId",
      ].sort(),
    );
  });

  it("is idempotent on provider identity (re-confirmation refreshes, not duplicates)", async () => {
    const identity = {
      connectionId: objectId(),
      calendarId: objectId(),
      providerEventId: "evt-1",
    };
    const first = await repo.record(
      markerInput({ ...identity, providerVersion: "v1" }),
    );
    const second = await repo.record(
      markerInput({
        ...identity,
        providerVersion: "v2",
        deletedAt: new Date("2026-07-21T12:00:00.000Z"),
      }),
    );
    expect(second._id).toBe(first._id);
    expect(second.providerVersion).toBe("v2");
    expect(await db.collection("deletion_markers").countDocuments()).toBe(1);
  });

  it("reports whether a deletion marker exists for a provider event", async () => {
    const marker = await repo.record(markerInput());
    expect(
      await repo.exists(
        marker.connectionId,
        marker.calendarId,
        marker.providerEventId,
      ),
    ).toBe(true);
    expect(
      await repo.exists(
        marker.connectionId,
        marker.calendarId,
        "never-deleted" as typeof marker.providerEventId,
      ),
    ).toBe(false);
  });

  it("has a TTL index that expires markers by expiresAt", async () => {
    const indexes = await db.collection("deletion_markers").indexes();
    const ttl = indexes.find((i) => i.name === "ttl_expiry");
    expect(ttl?.expireAfterSeconds).toBe(0);
    expect(ttl?.key).toEqual({ expiresAt: 1 });
  });
});
