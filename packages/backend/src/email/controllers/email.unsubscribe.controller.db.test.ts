import { ObjectId } from "mongodb";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import { CONFIG } from "@backend/common/constants/config.constants";
import mongoService from "@backend/common/services/mongo.service";
import emailUnsubscribeController from "@backend/email/controllers/email.unsubscribe.controller";
import { ensureEmailIndexes } from "@backend/email/email-indexes";
import { emailSendRepository } from "@backend/email/email-send.repository";
import { createUnsubscribeToken } from "@backend/email/unsubscribe-token";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";

describe("EmailUnsubscribeController db", () => {
  beforeAll(async () => {
    await setupTestDb(import.meta.url);
    await ensureEmailIndexes();
  });

  beforeEach(cleanupCollections);

  afterAll(cleanupTestDb);

  it("POST sets unsubscribedAt and cancels queued rows", async () => {
    const originalSecret = CONFIG.EMAIL_UNSUBSCRIBE_SECRET;
    CONFIG.EMAIL_UNSUBSCRIBE_SECRET = "test-unsubscribe-secret";
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
    const token = createUnsubscribeToken(
      userId.toHexString(),
      "test-unsubscribe-secret",
    );

    const req = { body: { token } } as never;
    let body = "";
    const res = {
      status: mock(() => res),
      type: mock(() => res),
      send: mock((value: string) => {
        body = value;
      }),
    };

    await emailUnsubscribeController.confirmUnsubscribe(req, res as never);

    expect(body).toContain("You are unsubscribed");
    const row = await mongoService.emailSend.findOne({ userId });
    expect(row?.status).toBe("canceled");
    const user = await mongoService.user.findOne({ _id: userId });
    expect(user?.emailPreferences?.unsubscribedAt).toBeInstanceOf(Date);
    CONFIG.EMAIL_UNSUBSCRIBE_SECRET = originalSecret;
  });
});
