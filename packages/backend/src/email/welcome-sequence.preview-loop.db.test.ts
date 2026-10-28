import { ObjectId } from "mongodb";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import { CONFIG } from "@backend/common/constants/config.constants";
import mongoService from "@backend/common/services/mongo.service";
import { ensureEmailIndexes } from "@backend/email/email-indexes";
import { emailSendRepository } from "@backend/email/email-send.repository";
import { WELCOME_SEQUENCE } from "@backend/email/welcome-sequence";
import { enrollWelcomeSequenceForNewUser } from "@backend/email/welcome-sequence.enrollment";
import {
  dedupePreviewLoopQueuedGenerations,
  enqueuePreviewLoopGeneration,
  ensurePreviewLoopEnrollments,
  ensurePreviewLoopForRecipient,
  isPreviewLoopOverDailyCap,
  previewLoopRowId,
} from "@backend/email/welcome-sequence.preview-loop";
import { nextPreviewLoopMonthlyStart } from "@backend/email/welcome-sequence.preview-loop.schedule";
import userService from "@backend/user/services/user.service";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";

describe("welcome sequence preview loop", () => {
  const originalProvider = CONFIG.EMAIL_PROVIDER;
  const originalProfile = CONFIG.EMAIL_SCHEDULE_PROFILE;
  const originalRecipients = [...CONFIG.EMAIL_PREVIEW_LOOP_RECIPIENTS];
  const originalMaxPerDay = CONFIG.EMAIL_PREVIEW_LOOP_MAX_PER_DAY;
  const previewEmail = "founder-preview-loop@example.com";

  beforeAll(async () => {
    await setupTestDb(import.meta.url);
    await ensureEmailIndexes();
  });

  beforeEach(() => {
    CONFIG.EMAIL_PROVIDER = "log";
    CONFIG.EMAIL_SCHEDULE_PROFILE = "fast";
    CONFIG.EMAIL_PREVIEW_LOOP_RECIPIENTS = [previewEmail];
    CONFIG.EMAIL_PREVIEW_LOOP_MAX_PER_DAY = 10;
  });

  afterEach(async () => {
    CONFIG.EMAIL_PROVIDER = originalProvider;
    CONFIG.EMAIL_SCHEDULE_PROFILE = originalProfile;
    CONFIG.EMAIL_PREVIEW_LOOP_RECIPIENTS = originalRecipients;
    CONFIG.EMAIL_PREVIEW_LOOP_MAX_PER_DAY = originalMaxPerDay;
    await cleanupCollections();
  });

  afterAll(cleanupTestDb);

  it("enrolls the first preview generation on the next monthly anchor idempotently", async () => {
    const now = new Date("2026-10-28T12:00:00.000Z");
    const anchor = nextPreviewLoopMonthlyStart(now);
    await ensurePreviewLoopEnrollments(now);
    await ensurePreviewLoopEnrollments(now);

    const rows = await mongoService.emailSend
      .find({ previewLoop: true, recipientEmail: previewEmail })
      .toArray();
    expect(rows).toHaveLength(WELCOME_SEQUENCE.length);
    expect(rows.every((row) => row.previewLoopGeneration === 1)).toBe(true);
    expect(rows[0]?.sendAt?.toISOString()).toBe(anchor.toISOString());
  });

  it("restarts on the next monthly anchor after the final step", async () => {
    const anchor = new Date("2026-10-01T14:00:00.000Z");
    await enqueuePreviewLoopGeneration(previewEmail, 1, anchor);

    for (const step of WELCOME_SEQUENCE) {
      const rowId = previewLoopRowId(previewEmail, 1, step.key);
      await emailSendRepository.markSent(rowId, `msg-${step.key}`);
    }

    const afterCompletion = new Date("2026-10-20T12:00:00.000Z");
    await ensurePreviewLoopForRecipient(previewEmail, afterCompletion);

    const generationTwo = await mongoService.emailSend.countDocuments({
      previewLoop: true,
      recipientEmail: previewEmail,
      previewLoopGeneration: 2,
      status: "queued",
    });
    expect(generationTwo).toBe(0);

    const novemberStart = new Date("2026-11-01T14:05:00.000Z");
    await ensurePreviewLoopForRecipient(previewEmail, novemberStart);

    const generationTwoRows = await mongoService.emailSend
      .find({
        previewLoop: true,
        recipientEmail: previewEmail,
        previewLoopGeneration: 2,
      })
      .toArray();
    expect(generationTwoRows).toHaveLength(WELCOME_SEQUENCE.length);
    expect(generationTwoRows[0]?.sendAt?.toISOString()).toBe(
      "2026-11-01T14:00:00.000Z",
    );
  });

  it("starts a fresh generation on the next monthly anchor when steps are stale", async () => {
    const anchor = new Date("2026-09-01T14:00:00.000Z");
    await enqueuePreviewLoopGeneration(previewEmail, 1, anchor);
    const userId = (await mongoService.emailSend.findOne({
      previewLoop: true,
      recipientEmail: previewEmail,
    }))!.userId;
    await mongoService.emailSend.deleteMany({ previewLoop: true });
    await mongoService.emailSend.insertMany(
      ["welcome", "shortcuts"].map((stepKey) => ({
        _id: previewLoopRowId(previewEmail, 1, stepKey),
        userId,
        sequence: "welcome" as const,
        stepKey,
        status: stepKey === "welcome" ? ("sent" as const) : ("queued" as const),
        sendAt: stepKey === "welcome" ? anchor : new Date("2099-01-01"),
        nextAttemptAt: anchor,
        previewLoop: true as const,
        recipientEmail: previewEmail,
        previewLoopGeneration: 1,
      })),
    );

    const now = new Date("2026-10-28T12:00:00.000Z");
    await ensurePreviewLoopForRecipient(previewEmail, now);

    const generationTwo = await mongoService.emailSend
      .find({
        previewLoop: true,
        recipientEmail: previewEmail,
        previewLoopGeneration: 2,
      })
      .toArray();
    expect(generationTwo.map((row) => row.stepKey)).toEqual(
      WELCOME_SEQUENCE.map((step) => step.key),
    );
    const retired = await mongoService.emailSend.findOne({
      _id: previewLoopRowId(previewEmail, 1, "shortcuts"),
    });
    expect(retired?.status).toBe("skipped");
  });

  it("retires duplicate queued generations, keeping the lowest number", async () => {
    const anchor = new Date("2026-10-01T14:00:00.000Z");
    await enqueuePreviewLoopGeneration(previewEmail, 1, anchor);
    await enqueuePreviewLoopGeneration(previewEmail, 2, anchor);

    const now = new Date("2026-10-28T12:00:00.000Z");
    await dedupePreviewLoopQueuedGenerations(previewEmail, now);

    const genOneQueued = await mongoService.emailSend.countDocuments({
      previewLoop: true,
      recipientEmail: previewEmail,
      previewLoopGeneration: 1,
      status: "queued",
    });
    const genTwoQueued = await mongoService.emailSend.countDocuments({
      previewLoop: true,
      recipientEmail: previewEmail,
      previewLoopGeneration: 2,
      status: "queued",
    });
    expect(genOneQueued).toBe(WELCOME_SEQUENCE.length);
    expect(genTwoQueued).toBe(0);
  });

  it("skips queued preview rows until the next monthly window", async () => {
    const anchor = new Date("2026-10-01T14:00:00.000Z");
    await enqueuePreviewLoopGeneration(previewEmail, 1, anchor);

    const now = new Date("2026-10-28T12:00:00.000Z");
    await ensurePreviewLoopForRecipient(previewEmail, now);

    const queued = await mongoService.emailSend.countDocuments({
      previewLoop: true,
      recipientEmail: previewEmail,
      status: "queued",
    });
    expect(queued).toBe(0);
  });

  it("defers sends when the daily cap is reached", async () => {
    CONFIG.EMAIL_PREVIEW_LOOP_MAX_PER_DAY = 2;
    const now = new Date("2026-01-01T12:00:00.000Z");
    await enqueuePreviewLoopGeneration(previewEmail, 1, now);

    for (const step of WELCOME_SEQUENCE.slice(0, 2)) {
      const rowId = previewLoopRowId(previewEmail, 1, step.key);
      await emailSendRepository.markSent(rowId, `msg-${step.key}`);
    }

    expect(await isPreviewLoopOverDailyCap(previewEmail, now)).toBe(true);
  });

  it("does not enroll a one-time signup sequence for preview recipients", async () => {
    const userId = new ObjectId();
    await mongoService.user.insertOne({
      _id: userId,
      email: previewEmail,
      firstName: "Founder",
      lastName: "",
      name: "Founder",
      locale: "en",
    });

    await enrollWelcomeSequenceForNewUser(userId, new Date(), true, undefined);

    const signupRows = await mongoService.emailSend.countDocuments({
      userId,
      previewLoop: { $ne: true },
    });
    expect(signupRows).toBe(0);
  });

  it("leaves non-listed signups on the one-time sequence", async () => {
    const userId = new ObjectId();
    await enrollWelcomeSequenceForNewUser(userId, new Date(), true, undefined);

    const rows = await mongoService.emailSend.countDocuments({ userId });
    expect(rows).toBe(WELCOME_SEQUENCE.length);
  });

  it("does not enroll returning users via auth upsert or preview loop", async () => {
    const userId = new ObjectId().toString();
    await userService.upsertUserFromAuth({
      userId,
      email: "returning-non-preview@example.com",
      name: "Returning",
    });
    await userService.upsertUserFromAuth({
      userId,
      email: "returning-non-preview@example.com",
      name: "Returning",
    });

    await ensurePreviewLoopEnrollments(new Date("2026-10-28T12:00:00.000Z"));

    const count = await mongoService.emailSend.countDocuments({
      userId: new ObjectId(userId),
    });
    expect(count).toBe(WELCOME_SEQUENCE.length);
  });
});
