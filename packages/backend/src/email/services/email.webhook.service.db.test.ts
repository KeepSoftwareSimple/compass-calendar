import { ObjectId } from "mongodb";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import mongoService from "@backend/common/services/mongo.service";
import { ensureEmailIndexes } from "@backend/email/email-indexes";
import { emailSendRepository } from "@backend/email/email-send.repository";
import { processEmailWebhookEvent } from "@backend/email/services/email.webhook.service";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";

describe("processEmailWebhookEvent db", () => {
  beforeAll(async () => {
    await setupTestDb(import.meta.url);
    await ensureEmailIndexes();
  });

  beforeEach(cleanupCollections);

  afterAll(cleanupTestDb);

  it("stamps deliveredAt on the matching ledger row", async () => {
    const userId = new ObjectId();
    const now = new Date();
    await emailSendRepository.insertMany([
      {
        _id: `${userId.toHexString()}:welcome`,
        userId,
        sequence: "welcome",
        stepKey: "welcome",
        status: "sent",
        sendAt: now,
        nextAttemptAt: now,
        providerMessageId: "msg-delivered",
        sentAt: now,
      },
    ]);

    await processEmailWebhookEvent(
      { type: "email.delivered", data: { email_id: "msg-delivered" } },
      "evt-delivered",
    );

    const row = await mongoService.emailSend.findOne({ userId });
    expect(row?.deliveredAt).toBeInstanceOf(Date);
  });

  it("rejects duplicate webhook ids without reprocessing", async () => {
    const userId = new ObjectId();
    const now = new Date();
    await emailSendRepository.insertMany([
      {
        _id: `${userId.toHexString()}:welcome`,
        userId,
        sequence: "welcome",
        stepKey: "welcome",
        status: "sent",
        sendAt: now,
        nextAttemptAt: now,
        providerMessageId: "msg-dedupe",
        sentAt: now,
      },
    ]);

    const event = {
      type: "email.delivered",
      data: { email_id: "msg-dedupe" },
    };
    await processEmailWebhookEvent(event, "evt-dedupe");
    const firstDelivered = (await mongoService.emailSend.findOne({ userId }))
      ?.deliveredAt;
    await processEmailWebhookEvent(event, "evt-dedupe");
    const secondDelivered = (await mongoService.emailSend.findOne({ userId }))
      ?.deliveredAt;

    expect(firstDelivered).toBeInstanceOf(Date);
    expect(secondDelivered?.getTime()).toBe(firstDelivered?.getTime());
  });

  it("suppresses the user on bounce events linked to the ledger", async () => {
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
        providerMessageId: "msg-bounce",
      },
    ]);

    await processEmailWebhookEvent(
      {
        type: "email.bounced",
        data: { email_id: "msg-bounce", to: ["guest@example.com"] },
      },
      "evt-bounce",
    );

    const user = await mongoService.user.findOne({ _id: userId });
    expect(user?.emailPreferences?.suppressedAt).toBeInstanceOf(Date);
    const row = await mongoService.emailSend.findOne({ userId });
    expect(row?.status).toBe("canceled");
  });

  it("ignores replayed webhook events", async () => {
    const userId = new ObjectId();
    const now = new Date();
    await mongoService.user.insertOne({
      _id: userId,
      email: "guest@example.com",
      firstName: "Guest",
      lastName: "User",
      name: "Guest User",
      locale: "en",
    });
    await emailSendRepository.insertMany([
      {
        _id: `${userId.toHexString()}:welcome`,
        userId,
        sequence: "welcome",
        stepKey: "welcome",
        status: "queued",
        sendAt: now,
        nextAttemptAt: now,
        providerMessageId: "msg-complaint",
      },
    ]);

    const event = {
      type: "email.complained",
      data: { email_id: "msg-complaint", to: ["guest@example.com"] },
    };
    await processEmailWebhookEvent(event, "evt-complaint");
    await processEmailWebhookEvent(event, "evt-complaint");

    expect(await mongoService.emailEvent.countDocuments()).toBe(1);
    const user = await mongoService.user.findOne({ _id: userId });
    expect(user?.emailPreferences?.suppressedAt).toBeInstanceOf(Date);
  });
});
