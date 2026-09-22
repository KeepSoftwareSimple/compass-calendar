import { ObjectId } from "mongodb";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import { computeEmailSendHeartbeat } from "@backend/email/email.heartbeat";
import { ensureEmailIndexes } from "@backend/email/email-indexes";
import { emailSendRepository } from "@backend/email/email-send.repository";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";

describe("computeEmailSendHeartbeat", () => {
  beforeAll(async () => {
    await setupTestDb(import.meta.url);
    await ensureEmailIndexes();
  });
  beforeEach(cleanupCollections);
  afterAll(cleanupTestDb);

  it("emits zeros when the emailSend collection is empty", async () => {
    const now = new Date("2026-09-14T12:00:00.000Z");
    const snapshot = await computeEmailSendHeartbeat(now);
    expect(snapshot).toMatchObject({
      queued_count: 0,
      oldest_queued_age_ms: null,
      failed_count_24h: 0,
      service: "compass-backend",
    });
  });

  it("counts queued rows, oldest sendAt age, and recent failed rows", async () => {
    const userId = new ObjectId();
    const olderSendAt = new Date("2026-09-14T10:00:00.000Z");
    const newerSendAt = new Date("2026-09-14T11:00:00.000Z");
    await emailSendRepository.insertMany([
      {
        _id: `${userId.toHexString()}:welcome`,
        userId,
        sequence: "welcome",
        stepKey: "welcome",
        status: "queued",
        sendAt: olderSendAt,
        nextAttemptAt: olderSendAt,
      },
      {
        _id: `${userId.toHexString()}:connect-calendar`,
        userId,
        sequence: "welcome",
        stepKey: "connect-calendar",
        status: "queued",
        sendAt: newerSendAt,
        nextAttemptAt: newerSendAt,
      },
    ]);
    const failedUser = new ObjectId();
    await emailSendRepository.insertMany([
      {
        _id: `${failedUser.toHexString()}:welcome`,
        userId: failedUser,
        sequence: "welcome",
        stepKey: "welcome",
        status: "failed",
        sendAt: newerSendAt,
        nextAttemptAt: newerSendAt,
        attemptCount: 5,
        lastError: "provider down",
      },
    ]);

    const now = new Date("2026-09-14T12:00:00.000Z");
    const snapshot = await computeEmailSendHeartbeat(now);
    expect(snapshot.queued_count).toBe(2);
    expect(snapshot.failed_count_24h).toBe(1);
    expect(snapshot.oldest_queued_age_ms).toBe(2 * 60 * 60 * 1000);
  });
});
