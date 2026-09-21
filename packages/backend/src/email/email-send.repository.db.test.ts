import { ObjectId } from "mongodb";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import mongoService from "@backend/common/services/mongo.service";
import {
  EMAIL_SEND_CLAIM_LEASE_MS,
  EMAIL_SEND_MAX_ATTEMPTS,
} from "@backend/email/email.constants";
import { ensureEmailIndexes } from "@backend/email/email-indexes";
import {
  emailSendRepository,
  type InsertEmailSendInput,
} from "@backend/email/email-send.repository";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";

const buildRow = (
  overrides: Partial<InsertEmailSendInput> = {},
): InsertEmailSendInput => {
  const userId = overrides.userId ?? new ObjectId();
  const stepKey = overrides.stepKey ?? "day-1";
  const now = new Date();
  return {
    _id: overrides._id ?? `${userId.toHexString()}:${stepKey}`,
    userId,
    sequence: "welcome",
    stepKey,
    status: "queued",
    sendAt: now,
    nextAttemptAt: overrides.nextAttemptAt ?? now,
    ...overrides,
  };
};

describe("emailSendRepository", () => {
  beforeAll(async () => {
    await setupTestDb(import.meta.url);
    await ensureEmailIndexes();
  });

  beforeEach(cleanupCollections);

  afterAll(cleanupTestDb);

  it("insertMany is idempotent when the same _id is enrolled twice", async () => {
    const row = buildRow();
    await emailSendRepository.insertMany([row]);
    await emailSendRepository.insertMany([row]);

    const rows = await mongoService.emailSend
      .find({ userId: row.userId })
      .toArray();
    expect(rows).toHaveLength(1);
  });

  it("claimDue hands a due row to one claimant at a time", async () => {
    const row = buildRow();
    await emailSendRepository.insertMany([row]);
    const now = new Date();

    const [first, second] = await Promise.all([
      emailSendRepository.claimDue(now, 1, EMAIL_SEND_CLAIM_LEASE_MS),
      emailSendRepository.claimDue(now, 1, EMAIL_SEND_CLAIM_LEASE_MS),
    ]);

    const claimed = [...first, ...second];
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?._id).toBe(row._id);
  });

  it("claimDue can reclaim a row after its lease expires", async () => {
    const row = buildRow();
    await emailSendRepository.insertMany([row]);
    const now = new Date();

    const first = await emailSendRepository.claimDue(
      now,
      1,
      EMAIL_SEND_CLAIM_LEASE_MS,
    );
    expect(first).toHaveLength(1);

    await mongoService.emailSend.updateOne(
      { _id: row._id },
      { $set: { nextAttemptAt: new Date(0) } },
    );

    const second = await emailSendRepository.claimDue(
      new Date(),
      1,
      EMAIL_SEND_CLAIM_LEASE_MS,
    );
    expect(second).toHaveLength(1);
    expect(second[0]?._id).toBe(row._id);
  });

  it("recordFailure backs off until the attempt cap, then marks failed", async () => {
    const row = buildRow();
    await emailSendRepository.insertMany([row]);
    const backoffAt = new Date(Date.now() + 120_000);

    for (let attempt = 1; attempt < EMAIL_SEND_MAX_ATTEMPTS; attempt += 1) {
      const updated = await emailSendRepository.recordFailure(
        row._id,
        `error-${attempt}`,
        backoffAt,
      );
      expect(updated?.status).toBe("queued");
      expect(updated?.attemptCount).toBe(attempt);
    }

    const failed = await emailSendRepository.recordFailure(
      row._id,
      "error-final",
      backoffAt,
    );
    expect(failed?.status).toBe("failed");
    expect(failed?.attemptCount).toBe(EMAIL_SEND_MAX_ATTEMPTS);
  });

  it("cancelQueuedForUser cancels queued rows and leaves sent rows alone", async () => {
    const userId = new ObjectId();
    const queued = buildRow({ userId, stepKey: "queued-step" });
    const sent = buildRow({
      userId,
      stepKey: "sent-step",
      status: "sent",
      providerMessageId: "msg-1",
      sentAt: new Date(),
    });
    await emailSendRepository.insertMany([queued, sent]);

    const canceled = await emailSendRepository.cancelQueuedForUser(userId);
    expect(canceled).toBe(1);

    const rows = await mongoService.emailSend.find({ userId }).toArray();
    const byStep = Object.fromEntries(
      rows.map((entry) => [entry.stepKey, entry.status]),
    );
    expect(byStep["queued-step"]).toBe("canceled");
    expect(byStep["sent-step"]).toBe("sent");
  });
});
