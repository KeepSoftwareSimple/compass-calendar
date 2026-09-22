import { ObjectId } from "mongodb";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import mongoService from "@backend/common/services/mongo.service";
import { ensureEmailIndexes } from "@backend/email/email-indexes";
import { emailSendRepository } from "@backend/email/email-send.repository";
import {
  markUserSuppressed,
  markUserUnsubscribed,
} from "@backend/email/services/email-suppression.service";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";

describe("email suppression", () => {
  beforeAll(async () => {
    await setupTestDb(import.meta.url);
    await ensureEmailIndexes();
  });

  beforeEach(cleanupCollections);

  afterAll(cleanupTestDb);

  it("cancelQueuedForUser cancels every queued row for the user", async () => {
    const userId = new ObjectId();
    await mongoService.user.insertOne({
      _id: userId,
      email: "guest@example.com",
      firstName: "Guest",
      lastName: "User",
      name: "Guest User",
      locale: "en",
    });
    const now = new Date();
    await emailSendRepository.insertMany([
      {
        _id: `${userId.toHexString()}:welcome`,
        userId,
        sequence: "welcome",
        stepKey: "welcome",
        status: "queued",
        sendAt: now,
        nextAttemptAt: now,
      },
      {
        _id: `${userId.toHexString()}:shortcuts`,
        userId,
        sequence: "welcome",
        stepKey: "shortcuts",
        status: "sent",
        sendAt: now,
        nextAttemptAt: now,
        providerMessageId: "msg-1",
        sentAt: now,
      },
    ]);

    await markUserUnsubscribed(userId);

    const rows = await mongoService.emailSend.find({ userId }).toArray();
    const welcome = rows.find((row) => row.stepKey === "welcome");
    const shortcuts = rows.find((row) => row.stepKey === "shortcuts");
    expect(welcome?.status).toBe("canceled");
    expect(shortcuts?.status).toBe("sent");
    // The canceled row is now the most recently updated; analytics must
    // still attribute to the last email actually sent.
    expect(await emailSendRepository.findLastSentStepKey(userId)).toBe(
      "shortcuts",
    );
    const user = await mongoService.user.findOne({ _id: userId });
    expect(user?.emailPreferences?.unsubscribedAt).toBeInstanceOf(Date);
  });

  it("markUserSuppressed sets suppressedAt and cancels queued rows", async () => {
    const userId = new ObjectId();
    await mongoService.user.insertOne({
      _id: userId,
      email: "guest@example.com",
      firstName: "Guest",
      lastName: "User",
      name: "Guest User",
      locale: "en",
    });
    const now = new Date();
    await emailSendRepository.insertMany([
      {
        _id: `${userId.toHexString()}:welcome`,
        userId,
        sequence: "welcome",
        stepKey: "welcome",
        status: "queued",
        sendAt: now,
        nextAttemptAt: now,
      },
    ]);

    await markUserSuppressed(userId);

    const row = await mongoService.emailSend.findOne({ userId });
    expect(row?.status).toBe("canceled");
    const user = await mongoService.user.findOne({ _id: userId });
    expect(user?.emailPreferences?.suppressedAt).toBeInstanceOf(Date);
  });
});
