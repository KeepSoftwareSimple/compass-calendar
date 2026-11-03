import { ObjectId } from "mongodb";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import { CONFIG } from "@backend/common/constants/config.constants";
import mongoService from "@backend/common/services/mongo.service";
import { ensureEmailIndexes } from "@backend/email/email-indexes";
import { WELCOME_SEQUENCE } from "@backend/email/welcome-sequence";
import { enrollWelcomeSequenceForNewUser } from "@backend/email/welcome-sequence.enrollment";
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

describe("welcome sequence enrollment", () => {
  const originalProvider = CONFIG.EMAIL_PROVIDER;
  const originalProfile = CONFIG.EMAIL_SCHEDULE_PROFILE;
  const originalSyntheticBases = [...CONFIG.SYNTHETIC_JOURNEY_EMAILS];

  beforeAll(async () => {
    await setupTestDb(import.meta.url);
    await ensureEmailIndexes();
  });

  beforeEach(() => {
    CONFIG.EMAIL_PROVIDER = "log";
    CONFIG.EMAIL_SCHEDULE_PROFILE = "fast";
  });

  afterEach(async () => {
    CONFIG.EMAIL_PROVIDER = originalProvider;
    CONFIG.EMAIL_SCHEDULE_PROFILE = originalProfile;
    CONFIG.SYNTHETIC_JOURNEY_EMAILS = originalSyntheticBases;
    await cleanupCollections();
  });

  afterAll(cleanupTestDb);

  it("enrolls one row per step for a new signup inside the auth transaction", async () => {
    const userId = new ObjectId().toString();
    const session = await mongoService.startSession();

    try {
      await session.withTransaction(async (session) => {
        const result = await userService.upsertUserFromAuth(
          {
            userId,
            email: "new-signup@example.com",
            name: "New Signup",
          },
          session,
        );
        expect(result.isNewUser).toBe(true);
      });
    } finally {
      await session.endSession();
    }

    const rows = await mongoService.emailSend
      .find({ userId: new ObjectId(userId) })
      .sort({ sendAt: 1 })
      .toArray();
    expect(rows).toHaveLength(WELCOME_SEQUENCE.length);
  });

  it("does not enroll rows for an existing signup", async () => {
    const userId = new ObjectId().toString();
    await userService.upsertUserFromAuth({
      userId,
      email: "returning@example.com",
      name: "Returning User",
    });

    await userService.upsertUserFromAuth({
      userId,
      email: "returning@example.com",
      name: "Returning User",
    });

    const count = await mongoService.emailSend.countDocuments({
      userId: new ObjectId(userId),
    });
    expect(count).toBe(WELCOME_SEQUENCE.length);
  });

  it("does not enroll synthetic journey signups", async () => {
    const userId = new ObjectId().toString();
    const result = await userService.upsertUserFromAuth({
      userId,
      email: "runner+journey1@compasscaltest.invalid",
      name: "Journey Bot",
    });
    expect(result.isNewUser).toBe(true);
    expect(result.user.isSynthetic).toBe(true);

    const count = await mongoService.emailSend.countDocuments({
      userId: new ObjectId(userId),
    });
    expect(count).toBe(0);
  });

  it("does not enroll prod journey plus-tagged signups configured in SYNTHETIC_JOURNEY_EMAILS", async () => {
    CONFIG.SYNTHETIC_JOURNEY_EMAILS = [
      "lance.essert+prod-journey-google@gmail.com",
      "lance.essert+prod-journey-microsoft@gmail.com",
      "lance.essert+prod-journey-apple@gmail.com",
    ];
    const userId = new ObjectId().toString();
    const result = await userService.upsertUserFromAuth({
      userId,
      email: "lance.essert+prod-journey-google+journey1730123456789@gmail.com",
      name: "Prod Journey Bot",
    });
    expect(result.isNewUser).toBe(true);
    expect(result.user.isSynthetic).toBe(true);

    const count = await mongoService.emailSend.countDocuments({
      userId: new ObjectId(userId),
    });
    expect(count).toBe(0);
  });

  it("does not enroll keepsoftwaresimple.com signups", async () => {
    const userId = new ObjectId().toString();
    const result = await userService.upsertUserFromAuth({
      userId,
      email: "founder@keepsoftwaresimple.com",
      name: "Founder",
    });
    expect(result.isNewUser).toBe(true);
    expect(result.user.isSynthetic).toBe(true);

    const count = await mongoService.emailSend.countDocuments({
      userId: new ObjectId(userId),
    });
    expect(count).toBe(0);
  });

  it("is a no-op when email is disabled", async () => {
    CONFIG.EMAIL_PROVIDER = undefined;
    const userId = new ObjectId();
    await enrollWelcomeSequenceForNewUser(userId, new Date(), true, undefined);

    const count = await mongoService.emailSend.countDocuments({ userId });
    expect(count).toBe(0);
  });
});
