import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import mongoService from "@backend/common/services/mongo.service";
import {
  EMAIL_SEND_STATUS_NEXT_ATTEMPT_INDEX,
  EMAIL_SEND_USER_ID_INDEX,
  ensureEmailIndexes,
} from "@backend/email/email-indexes";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";

describe("email indexes", () => {
  beforeAll(async () => {
    await setupTestDb(import.meta.url);
  });

  beforeEach(cleanupCollections);

  afterAll(cleanupTestDb);

  it("ensureEmailIndexes is idempotent across repeated calls", async () => {
    await ensureEmailIndexes();
    await expect(ensureEmailIndexes()).resolves.toBeUndefined();

    const indexes = await mongoService.emailSend.indexes();
    const names = indexes.map((index) => index.name);
    expect(names).toContain(EMAIL_SEND_STATUS_NEXT_ATTEMPT_INDEX);
    expect(names).toContain(EMAIL_SEND_USER_ID_INDEX);
  });

  it("does not throw when a legacy index already covers the same key", async () => {
    try {
      await mongoService.emailSend.dropIndex(EMAIL_SEND_USER_ID_INDEX);
    } catch {
      // Fresh databases may not have the named index yet.
    }

    try {
      await mongoService.emailSend.createIndex({ userId: 1 });

      await expect(ensureEmailIndexes()).resolves.toBeUndefined();

      const indexes = await mongoService.emailSend.indexes();
      const names = indexes.map((index) => index.name);
      expect(names).toContain("userId_1");
      expect(names).not.toContain(EMAIL_SEND_USER_ID_INDEX);
    } finally {
      try {
        await mongoService.emailSend.dropIndex("userId_1");
      } catch {
        // Ignore cleanup races in parallel runs.
      }
      await ensureEmailIndexes();
    }
  });
});
