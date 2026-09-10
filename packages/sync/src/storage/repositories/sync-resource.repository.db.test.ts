import { faker } from "@faker-js/faker";
import { type Db } from "mongodb";
import { type CalendarId } from "@core/types/domain-primitives";
import {
  type ConnectionId,
  type PrincipalId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import { seedOauthCredential } from "@sync/__tests__/helpers/credential-encryption";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import { type SyncResourceUpsert } from "@sync/storage/contracts/sync-resource.contracts";
import { CredentialRepository } from "@sync/storage/repositories/credential.repository";
import { SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";

const objectId = () => faker.database.mongodbObjectId();

const upsert = (
  overrides: Partial<SyncResourceUpsert> = {},
): SyncResourceUpsert =>
  ({
    tenantId: objectId() as TenantId,
    principalId: objectId() as PrincipalId,
    connectionId: objectId() as ConnectionId,
    resourceKind: "events",
    calendarId: objectId() as CalendarId,
    ...overrides,
  }) as SyncResourceUpsert;

describe("SyncResourceRepository", () => {
  const storage = setupSyncStorage(import.meta.url);
  let db: Db;
  let repo: SyncResourceRepository;

  beforeEach(() => {
    db = storage.db();
    repo = new SyncResourceRepository(db);
  });

  it("creates a resource with empty cursors and generation 0", async () => {
    const resource = await repo.ensure(upsert());
    expect(resource.syncCursor).toBeNull();
    expect(resource.pageCursor).toBeNull();
    expect(resource.importGeneration).toBe(0);
    expect(resource.activeGeneration).toBe(0);
  });

  it("activates a generation without moving the import generation", async () => {
    const tenantId = objectId() as never;
    const principalId = objectId() as never;
    const resource = await repo.ensure(
      upsert({ tenantId, principalId }) as SyncResourceUpsert,
    );
    // A repair builds a new import generation, leaving reads on the old one.
    const importGen = await repo.startNewGeneration(
      tenantId,
      principalId,
      resource._id,
    );
    expect(importGen).toBe(1);
    let after = await repo.findById(tenantId, principalId, resource._id);
    expect(after?.activeGeneration).toBe(0);

    // Activation flips reads to the new generation.
    await repo.activateGeneration(
      tenantId,
      principalId,
      resource._id,
      importGen,
    );
    after = await repo.findById(tenantId, principalId, resource._id);
    expect(after?.activeGeneration).toBe(1);
    expect(after?.importGeneration).toBe(1);
  });

  it("resolves the active generation for each event calendar, defaulting absent ones", async () => {
    const tenantId = objectId() as never;
    const principalId = objectId() as never;
    const calA = objectId() as never;
    const calB = objectId() as never;
    const absent = objectId() as never;
    const a = await repo.ensure(
      upsert({ tenantId, principalId, calendarId: calA }) as SyncResourceUpsert,
    );
    await repo.ensure(
      upsert({ tenantId, principalId, calendarId: calB }) as SyncResourceUpsert,
    );
    // calA has been repaired and activated to generation 1; calB stays at 0.
    await repo.startNewGeneration(tenantId, principalId, a._id);
    await repo.activateGeneration(tenantId, principalId, a._id, 1);

    const map = await repo.activeGenerationByCalendar(tenantId, principalId, [
      calA,
      calB,
      absent,
    ]);
    expect(map.get(calA)).toBe(1);
    expect(map.get(calB)).toBe(0);
    // A calendar with no events resource is absent — the caller reads gen 0.
    expect(map.has(absent)).toBe(false);
  });

  it("ensures one resource per (connection, kind, calendar)", async () => {
    const key = {
      connectionId: objectId() as ConnectionId,
      resourceKind: "events" as const,
      calendarId: objectId() as CalendarId,
    };
    const first = await repo.ensure(upsert(key));
    const second = await repo.ensure(upsert(key));
    expect(second._id).toBe(first._id);
    expect(await db.collection("sync_resources").countDocuments()).toBe(1);
  });

  it("ensures one calendar-list resource per connection", async () => {
    const key = {
      connectionId: objectId() as ConnectionId,
      resourceKind: "calendarList" as const,
      calendarId: null,
    };
    const first = await repo.ensure(upsert(key));
    const second = await repo.ensure(upsert(key));
    expect(second._id).toBe(first._id);
    expect(await db.collection("sync_resources").countDocuments()).toBe(1);
  });

  it("re-ensuring an in-progress resource does not wipe its cursors or subscription", async () => {
    const resource = await repo.ensure(upsert());
    await repo.advanceCursor(
      resource.tenantId,
      resource.principalId,
      resource._id,
      "sync-token-1",
      new Date("2026-07-20T12:00:00.000Z"),
    );
    await repo.updateSubscription(
      resource.tenantId,
      resource.principalId,
      resource._id,
      {
        subscriptionId: "chan-1",
        subscriptionResourceId: "res-1",
        subscriptionToken: "chan-token-1",
        subscriptionExpiresAt: new Date("2026-07-27T00:00:00.000Z"),
      },
    );

    // A later ensure() for the same key must return the advanced state intact.
    const again = await repo.ensure(
      upsert({
        connectionId: resource.connectionId,
        resourceKind: resource.resourceKind,
        calendarId: resource.calendarId,
      }),
    );
    expect(again._id).toBe(resource._id);
    expect(again.syncCursor).toBe("sync-token-1");
    expect(again.subscriptionId).toBe("chan-1");
  });

  it("keeps the calendar-list resource distinct from event resources", async () => {
    const connectionId = objectId() as ConnectionId;
    await repo.ensure(
      upsert({ connectionId, resourceKind: "calendarList", calendarId: null }),
    );
    await repo.ensure(
      upsert({
        connectionId,
        resourceKind: "events",
        calendarId: objectId() as CalendarId,
      }),
    );
    expect(await db.collection("sync_resources").countDocuments()).toBe(2);
  });

  it("advancing the cursor clears the mid-batch page checkpoint", async () => {
    const resource = await repo.ensure(upsert());
    await repo.setPageCheckpoint(
      resource.tenantId,
      resource.principalId,
      resource._id,
      "page-token-2",
    );
    const mid = await repo.findById(
      resource.tenantId,
      resource.principalId,
      resource._id,
    );
    expect(mid?.pageCursor).toBe("page-token-2");

    const succeededAt = new Date("2026-07-20T12:00:00.000Z");
    await repo.advanceCursor(
      resource.tenantId,
      resource.principalId,
      resource._id,
      "sync-token-final",
      succeededAt,
    );
    const done = await repo.findById(
      resource.tenantId,
      resource.principalId,
      resource._id,
    );
    expect(done?.syncCursor).toBe("sync-token-final");
    expect(done?.pageCursor).toBeNull();
    expect(done?.lastSuccessAt).toEqual(succeededAt);
  });

  it("keeps the first read failure's timestamp while refreshing its detail", async () => {
    const resource = await repo.ensure(upsert());
    const first = new Date("2026-07-20T12:00:00.000Z");
    const later = new Date("2026-07-23T12:00:00.000Z");
    await repo.markReadFailure(
      resource.tenantId,
      resource.principalId,
      resource._id,
      first,
      "Not Found (HTTP 404, reason notFound)",
    );
    await repo.markReadFailure(
      resource.tenantId,
      resource.principalId,
      resource._id,
      later,
      "Forbidden (HTTP 403, reason forbidden)",
    );

    const after = await repo.findById(
      resource.tenantId,
      resource.principalId,
      resource._id,
    );
    // The FIRST timestamp is what says how long the calendar has been dead.
    expect(after?.lastReadFailureAt).toEqual(first);
    expect(after?.lastReadFailureDetail).toContain("HTTP 403");
  });

  it("clears the read-failure marker when the cursor next advances", async () => {
    const resource = await repo.ensure(upsert());
    await repo.markReadFailure(
      resource.tenantId,
      resource.principalId,
      resource._id,
      new Date("2026-07-20T12:00:00.000Z"),
      "Not Found (HTTP 404, reason notFound)",
    );
    await repo.advanceCursor(
      resource.tenantId,
      resource.principalId,
      resource._id,
      "sync-token",
      new Date("2026-07-24T12:00:00.000Z"),
    );

    const after = await repo.findById(
      resource.tenantId,
      resource.principalId,
      resource._id,
    );
    expect(after?.lastReadFailureAt).toBeNull();
    expect(after?.lastReadFailureDetail).toBeNull();
  });

  it("clears the read-failure marker on success even when syncCursor is null", async () => {
    const resource = await repo.ensure(upsert());
    await repo.advanceCursor(
      resource.tenantId,
      resource.principalId,
      resource._id,
      "kept-cursor",
      new Date("2026-07-20T12:00:00.000Z"),
    );
    await repo.markReadFailure(
      resource.tenantId,
      resource.principalId,
      resource._id,
      new Date("2026-07-21T12:00:00.000Z"),
      "The user must be signed up for Google Calendar. (HTTP 403, reason notACalendarUser)",
    );
    const succeededAt = new Date("2026-07-24T12:00:00.000Z");
    await repo.advanceCursor(
      resource.tenantId,
      resource.principalId,
      resource._id,
      null,
      succeededAt,
    );

    const after = await repo.findById(
      resource.tenantId,
      resource.principalId,
      resource._id,
    );
    expect(after?.syncCursor).toBe("kept-cursor");
    expect(after?.lastSuccessAt).toEqual(succeededAt);
    expect(after?.lastReadFailureAt).toBeNull();
    expect(after?.lastReadFailureDetail).toBeNull();
  });

  it("updates and clears the push subscription", async () => {
    const resource = await repo.ensure(upsert());
    await repo.updateSubscription(
      resource.tenantId,
      resource.principalId,
      resource._id,
      {
        subscriptionId: "chan-1",
        subscriptionResourceId: "res-1",
        subscriptionToken: "chan-token-1",
        subscriptionExpiresAt: new Date("2026-07-27T00:00:00.000Z"),
      },
    );
    let read = await repo.findById(
      resource.tenantId,
      resource.principalId,
      resource._id,
    );
    expect(read?.subscriptionId).toBe("chan-1");

    await repo.clearSubscription(
      resource.tenantId,
      resource.principalId,
      resource._id,
    );
    read = await repo.findById(
      resource.tenantId,
      resource.principalId,
      resource._id,
    );
    expect(read?.subscriptionId).toBeNull();
    expect(read?.subscriptionExpiresAt).toBeNull();
  });

  it("starts a new import generation for a repair", async () => {
    const resource = await repo.ensure(upsert());
    const scope = [
      resource.tenantId,
      resource.principalId,
      resource._id,
    ] as const;
    expect(await repo.startNewGeneration(...scope)).toBe(1);
    expect(await repo.startNewGeneration(...scope)).toBe(2);
  });

  it("does not let another principal advance the cursor (tenant isolation)", async () => {
    const resource = await repo.ensure(upsert());
    await repo.advanceCursor(
      resource.tenantId,
      objectId() as SyncResourceUpsert["principalId"],
      resource._id,
      "leaked-token",
      new Date(),
    );
    const read = await repo.findById(
      resource.tenantId,
      resource.principalId,
      resource._id,
    );
    // The write against the wrong principal matched nothing.
    expect(read?.syncCursor).toBeNull();
  });

  it("stamps lastFullListAt without disturbing the other timing fields", async () => {
    const resource = await repo.ensure(
      upsert({ resourceKind: "calendarList" }),
    );
    const at = new Date("2026-08-27T12:00:00.000Z");

    await repo.markFullListCompleted(
      resource.tenantId,
      resource.principalId,
      resource._id,
      at,
    );

    const read = await repo.findById(
      resource.tenantId,
      resource.principalId,
      resource._id,
    );
    expect(read?.lastFullListAt).toEqual(at);
    expect(read?.lastSuccessAt).toBeNull();
    expect(read?.syncCursor).toBeNull();
  });

  it("does not stamp lastFullListAt when advancing the cursor", async () => {
    // The regression guard for the whole starvation bug. advanceCursor runs on
    // EVERY successful pass, incremental ones included; if it also moved the
    // full-list clock, an active user's focus refreshes would keep that clock
    // fresh and the rediscovery sweep could never select them (2026-08-27).
    const resource = await repo.ensure(
      upsert({ resourceKind: "calendarList" }),
    );
    const at = new Date("2026-08-27T12:00:00.000Z");

    await repo.advanceCursor(
      resource.tenantId,
      resource.principalId,
      resource._id,
      "incremental-token",
      at,
    );

    const read = await repo.findById(
      resource.tenantId,
      resource.principalId,
      resource._id,
    );
    expect(read?.lastSuccessAt).toEqual(at);
    expect(read?.lastFullListAt).toBeNull();
  });

  it("does not let another principal stamp lastFullListAt (tenant isolation)", async () => {
    const resource = await repo.ensure(
      upsert({ resourceKind: "calendarList" }),
    );

    await repo.markFullListCompleted(
      resource.tenantId,
      objectId() as SyncResourceUpsert["principalId"],
      resource._id,
      new Date("2026-08-27T12:00:00.000Z"),
    );

    const read = await repo.findById(
      resource.tenantId,
      resource.principalId,
      resource._id,
    );
    expect(read?.lastFullListAt).toBeNull();
  });

  it("clears an unwatchable verdict older than the retry window but leaves a fresh one", async () => {
    // The age gate exists because a calendarList push now also forces a full
    // pass: without it, every push would hand each unwatchable calendar another
    // futile watch call, which is the pre-marker wart in a new costume.
    const tenantId = objectId() as SyncResourceUpsert["tenantId"];
    const principalId = objectId() as SyncResourceUpsert["principalId"];
    const connectionId = objectId() as SyncResourceUpsert["connectionId"];
    const stale = await repo.ensure(
      upsert({ tenantId, principalId, connectionId }),
    );
    const fresh = await repo.ensure(
      upsert({ tenantId, principalId, connectionId }),
    );
    await repo.markWatchUnsupported(
      tenantId,
      principalId,
      stale._id,
      new Date("2026-08-25T00:00:00.000Z"),
    );
    await repo.markWatchUnsupported(
      tenantId,
      principalId,
      fresh._id,
      new Date("2026-08-27T11:00:00.000Z"),
    );

    await repo.clearWatchUnsupportedByConnection(
      tenantId,
      principalId,
      connectionId,
      new Date("2026-08-26T12:00:00.000Z"),
    );

    expect(
      (await repo.findById(tenantId, principalId, stale._id))
        ?.watchUnsupportedAt,
    ).toBeNull();
    expect(
      (await repo.findById(tenantId, principalId, fresh._id))
        ?.watchUnsupportedAt,
    ).toEqual(new Date("2026-08-27T11:00:00.000Z"));
  });

  it("scopes findById to the owning principal", async () => {
    const resource = await repo.ensure(upsert());
    expect(
      await repo.findById(
        resource.tenantId,
        objectId() as SyncResourceUpsert["principalId"],
        resource._id,
      ),
    ).toBeNull();
  });

  it("reads a row a newer build stamped with an unknown field", async () => {
    // A rolling deploy runs the old and new builds together: the new build
    // adds a field and stamps it on a row, then the old build reads that row.
    // A strict read schema rejected the unknown key and broke GET
    // /connections plus every job that re-parsed the resource (2026-08-27).
    const resource = await repo.ensure(upsert());
    await db
      .collection(SYNC_COLLECTIONS.syncResources)
      .updateOne(
        { _id: resource._id as never },
        { $set: { fieldFromNewerBuild: "value the old build never heard of" } },
      );

    const byId = await repo.findById(
      resource.tenantId,
      resource.principalId,
      resource._id,
    );
    expect(byId?._id).toBe(resource._id);

    const byConnection = await repo.listByConnection(
      resource.tenantId,
      resource.principalId,
      resource.connectionId,
    );
    expect(byConnection).toHaveLength(1);
    expect(byConnection[0]?._id).toBe(resource._id);
  });

  describe("listStaleEvents provider filter", () => {
    let credentials: CredentialRepository;
    const staleBefore = new Date("2026-07-09T00:00:00.000Z");

    beforeEach(() => {
      credentials = new CredentialRepository(db);
    });

    const seedStale = async (
      provider: "google" | "apple",
    ): Promise<{ _id: string }> => {
      const tenantId = objectId() as SyncResourceUpsert["tenantId"];
      const principalId = objectId() as SyncResourceUpsert["principalId"];
      const connectionId = objectId() as SyncResourceUpsert["connectionId"];
      const resource = await repo.ensure(
        upsert({ tenantId, principalId, connectionId }),
      );
      if (provider === "google") {
        await seedOauthCredential(credentials, {
          connectionId,
          provider: "google",
          refreshToken: "google-refresh",
          scopes: [],
        });
      } else {
        await credentials.storePassword({
          connectionId,
          provider: "apple",
          username: "user@icloud.com",
          secretCiphertext: "cipher",
          secretIv: "iv",
          secretTag: "tag",
          keyVersion: 1,
        });
      }
      await repo.advanceCursor(
        tenantId,
        principalId,
        resource._id,
        "cursor",
        new Date("2026-07-01T00:00:00.000Z"),
      );
      return resource;
    };

    it("returns only apple resources when provider is apple", async () => {
      const apple = await seedStale("apple");
      await seedStale("google");

      const results = await repo.listStaleEvents(staleBefore, 10, {
        provider: "apple",
      });

      expect(results.map((r) => r._id)).toEqual([apple._id]);
    });

    it("excludes providers listed in excludeProviders on the default call", async () => {
      await seedStale("apple");
      const google = await seedStale("google");

      const results = await repo.listStaleEvents(staleBefore, 10, {
        excludeProviders: ["apple"],
      });

      expect(results.map((r) => r._id)).toEqual([google._id]);
    });
  });

  it("listEventResourceFreshnessByCalendar projects cursorExpiredBackoffUntil", async () => {
    const tenantId = objectId() as never;
    const principalId = objectId() as never;
    const calendarId = objectId() as never;
    const resource = await repo.ensure(
      upsert({ tenantId, principalId, calendarId }) as SyncResourceUpsert,
    );
    const holdOffUntil = new Date("2026-07-14T15:00:00.000Z");
    await repo.recordCursorExpiry(
      tenantId,
      principalId,
      resource._id,
      holdOffUntil,
    );

    const freshness = await repo.listEventResourceFreshnessByCalendar(
      tenantId,
      principalId,
      [calendarId],
    );

    expect(freshness.get(calendarId)).toMatchObject({
      connectionId: resource.connectionId,
      activeGeneration: 0,
      lastSuccessAt: null,
      cursorExpiredBackoffUntil: holdOffUntil,
    });
  });
});
