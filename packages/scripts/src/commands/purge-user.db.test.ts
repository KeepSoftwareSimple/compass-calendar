import { purgeUserByEmail } from "@scripts/commands/purge-user/purge";
import { type PurgeUserTarget } from "@scripts/commands/purge-user/report.types";
import { ObjectId } from "mongodb";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import mongoService from "@backend/common/services/mongo.service";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";

const NOW = new Date("2026-07-27T04:00:00.000Z");
const EMAIL = "lance.essert@example.com";
const TARGET: PurgeUserTarget = {
  host: "localhost",
  database: "test",
  syncDatabase: "synctest",
};

describe("purge-user (db)", () => {
  const syncStorage = setupSyncStorage(import.meta.url);

  beforeAll(() => setupTestDb(import.meta.url));
  afterEach(async () => {
    await cleanupCollections();
    await mongoService.user.deleteMany({});
  });
  afterAll(cleanupTestDb);

  const deps = () => ({
    db: mongoService.db,
    syncDb: syncStorage.db(),
    syncClient: syncStorage.client(),
  });

  /** One user, one active calendar with an event, one job row in Sync. */
  const seedUser = async (email = EMAIL): Promise<ObjectId> => {
    const userId = new ObjectId();
    const calendarId = new ObjectId();

    await mongoService.user.insertOne({
      _id: userId,
      email,
      name: "Lance Essert",
      firstName: "Lance",
      lastName: "Essert",
      locale: "not provided",
      signedUpAt: NOW,
    });
    await mongoService.db
      .collection(mongoService.calendar.collectionName)
      .insertOne({ _id: calendarId, userId, isActive: true });
    await mongoService.db
      .collection(mongoService.event.collectionName)
      .insertOne({ _id: new ObjectId(), calendarId, title: "Standup" });
    await syncStorage
      .db()
      .collection(SYNC_COLLECTIONS.jobs)
      .insertOne({
        _id: new ObjectId(),
        tenantId: userId.toString(),
        principalId: userId.toString(),
        // The jobs collection carries a unique index on coalescingKey, so a
        // second seeded row cannot leave it null.
        coalescingKey: `job-${userId.toString()}`,
      });

    return userId;
  };

  it("dry-run reports counts without deleting anything", async () => {
    await seedUser();

    const report = await purgeUserByEmail(deps(), EMAIL, {
      dryRun: true,
      target: TARGET,
      now: NOW,
    });

    expect(report.dryRun).toBe(true);
    expect(report.users).toHaveLength(1);
    expect(report.users[0]?.counts.events).toBe(1);
    expect(report.users[0]?.counts.calendars).toBe(1);
    expect(report.users[0]?.counts.user).toBe(1);
    expect(report.users[0]?.counts.sync.jobs).toBe(1);

    expect(await mongoService.user.countDocuments({})).toBe(1);
    expect(
      await mongoService.db
        .collection(mongoService.event.collectionName)
        .countDocuments({}),
    ).toBe(1);
    expect(
      await syncStorage
        .db()
        .collection(SYNC_COLLECTIONS.jobs)
        .countDocuments({}),
    ).toBe(1);
  });

  it("purges every duplicate account sharing the email, then reruns clean", async () => {
    await seedUser();
    await seedUser();
    await seedUser("someone.else@example.com");

    const report = await purgeUserByEmail(deps(), EMAIL, {
      dryRun: false,
      target: TARGET,
      now: NOW,
    });

    expect(report.users).toHaveLength(2);
    expect(report.users.every(({ counts }) => counts.user === 1)).toBe(true);

    // The unrelated account and everything it owns is untouched.
    expect(await mongoService.user.countDocuments({})).toBe(1);
    expect(
      await mongoService.db
        .collection(mongoService.event.collectionName)
        .countDocuments({}),
    ).toBe(1);
    expect(
      await syncStorage
        .db()
        .collection(SYNC_COLLECTIONS.jobs)
        .countDocuments({}),
    ).toBe(1);

    const rerun = await purgeUserByEmail(deps(), EMAIL, {
      dryRun: false,
      target: TARGET,
      now: NOW,
    });
    expect(rerun.users).toHaveLength(0);
  });

  it("deletes events on archived calendars, which the account-deletion path skips", async () => {
    const userId = await seedUser();
    const archivedCalendarId = new ObjectId();
    await mongoService.db
      .collection(mongoService.calendar.collectionName)
      .insertOne({ _id: archivedCalendarId, userId, isActive: false });
    await mongoService.db
      .collection(mongoService.event.collectionName)
      .insertOne({
        _id: new ObjectId(),
        calendarId: archivedCalendarId,
        title: "Revoked Google event",
      });

    const report = await purgeUserByEmail(deps(), EMAIL, {
      dryRun: false,
      target: TARGET,
      now: NOW,
    });

    expect(report.users[0]?.counts.events).toBe(2);
    expect(
      await mongoService.db
        .collection(mongoService.event.collectionName)
        .countDocuments({}),
    ).toBe(0);
  });

  it("purges Mongo and records the error when SuperTokens cleanup fails", async () => {
    await seedUser();

    const report = await purgeUserByEmail(
      {
        ...deps(),
        cleanupAuth: () => Promise.reject(new Error("core unreachable")),
      },
      EMAIL,
      { dryRun: false, target: TARGET, now: NOW },
    );

    expect(report.auth).toBeNull();
    expect(report.authError).toBe("core unreachable");
    expect(await mongoService.user.countDocuments({})).toBe(0);
  });

  it("normalizes the email before matching", async () => {
    await seedUser();

    const report = await purgeUserByEmail(deps(), `  ${EMAIL.toUpperCase()} `, {
      dryRun: true,
      target: TARGET,
      now: NOW,
    });

    expect(report.email).toBe(EMAIL);
    expect(report.users).toHaveLength(1);
  });
});
