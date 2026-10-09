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
  enqueuePreviewLoopGeneration,
  ensurePreviewLoopEnrollments,
  ensurePreviewLoopForRecipient,
  isPreviewLoopOverDailyCap,
  previewLoopRowId,
} from "@backend/email/welcome-sequence.preview-loop";
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
  const originalGapDays = CONFIG.EMAIL_PREVIEW_LOOP_GAP_DAYS;
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
    CONFIG.EMAIL_PREVIEW_LOOP_GAP_DAYS = 0;
    CONFIG.EMAIL_PREVIEW_LOOP_MAX_PER_DAY = 10;
  });

  afterEach(async () => {
    CONFIG.EMAIL_PROVIDER = originalProvider;
    CONFIG.EMAIL_SCHEDULE_PROFILE = originalProfile;
    CONFIG.EMAIL_PREVIEW_LOOP_RECIPIENTS = originalRecipients;
    CONFIG.EMAIL_PREVIEW_LOOP_GAP_DAYS = originalGapDays;
    CONFIG.EMAIL_PREVIEW_LOOP_MAX_PER_DAY = originalMaxPerDay;
    await cleanupCollections();
  });

  afterAll(cleanupTestDb);

  it("enrolls the first preview generation idempotently", async () => {
    await ensurePreviewLoopEnrollments(new Date("2026-01-01T00:00:00.000Z"));
    await ensurePreviewLoopEnrollments(new Date("2026-01-01T00:00:00.000Z"));

    const rows = await mongoService.emailSend
      .find({ previewLoop: true, recipientEmail: previewEmail })
      .toArray();
    expect(rows).toHaveLength(WELCOME_SEQUENCE.length);
    expect(rows.every((row) => row.previewLoopGeneration === 1)).toBe(true);
  });

  it("restarts the loop after the final step with a new generation", async () => {
    const anchor = new Date("2026-01-01T00:00:00.000Z");
    await enqueuePreviewLoopGeneration(previewEmail, 1, anchor);

    for (const step of WELCOME_SEQUENCE) {
      const rowId = previewLoopRowId(previewEmail, 1, step.key);
      await emailSendRepository.markSent(rowId, `msg-${step.key}`);
    }

    await ensurePreviewLoopForRecipient(previewEmail, new Date());

    const generationTwo = await mongoService.emailSend.countDocuments({
      previewLoop: true,
      recipientEmail: previewEmail,
      previewLoopGeneration: 2,
      status: "queued",
    });
    expect(generationTwo).toBe(WELCOME_SEQUENCE.length);
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
});
