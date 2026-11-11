import { BaseDriver } from "@backend/__tests__/drivers/base.driver";
import { UtilDriver } from "@backend/__tests__/drivers/util.driver";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import { CONFIG } from "@backend/common/constants/config.constants";
import mongoService from "@backend/common/services/mongo.service";
import { getSyncServiceClient } from "@backend/common/services/sync-service/sync-service.factory";
import { emailSendRepository } from "@backend/email/email-send.repository";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

describe("reflection preferences", () => {
  const driver = new BaseDriver();
  const path = "/api/user/reflection-preferences";
  const original = { ...CONFIG };
  const settings = {
    enabled: true,
    timeZone: "America/Denver",
    excludedCalendarIds: [],
  };
  const cookie = (id: string) => `session=${JSON.stringify({ userId: id })}`;
  beforeAll(() => setupTestDb(import.meta.url));
  afterAll(cleanupTestDb);
  beforeEach(async () => {
    await cleanupCollections();
    Object.assign(CONFIG, {
      EMAIL_PROVIDER: "log",
      REFLECTION_ENABLED: true,
      REFLECTION_ROLLOUT_ENABLED: false,
      REFLECTION_TRIAL_USER_ID: undefined,
      REFLECTION_TRIAL_EMAIL: undefined,
    });
    const client = getSyncServiceClient();
    spyOn(client, "listCalendars").mockResolvedValue({
      ok: true,
      value: { calendars: [] },
    });
    spyOn(client, "listConnections").mockResolvedValue({
      ok: true,
      value: { connections: [] },
    });
    spyOn(client, "readReflection").mockResolvedValue({
      ok: true,
      value: {
        events: [],
        historyComplete: false,
        oldestYear: null,
        nextCursor: null,
        truncated: false,
      },
    });
  });
  afterEach(() => {
    Object.assign(CONFIG, original);
    mock.restore();
  });

  it("automatically enables new onboarding reviews in the app timezone and preserves a later pause", async () => {
    CONFIG.REFLECTION_ROLLOUT_ENABLED = true;
    const { user } = await UtilDriver.setupTestUser();
    const sendAt = new Date("2026-11-07T15:00:00Z");
    await emailSendRepository.insertMany([
      {
        _id: `${user._id}:weekly-review`,
        userId: user._id,
        sequence: "welcome",
        stepKey: "weekly-review",
        status: "queued",
        sendAt,
        nextAttemptAt: sendAt,
      },
    ]);
    const initialize = () =>
      driver
        .getServer()
        .post(path)
        .set("Cookie", cookie(user._id.toString()))
        .send({
          timeZone: "America/Denver",
          excludedCalendarIds: ["hidden-calendar"],
        });
    await initialize().expect(204);
    let saved = await mongoService.user.findOne({ _id: user._id });
    expect(saved?.reflectionPreferences).toEqual({
      enabled: true,
      timeZone: "America/Denver",
      excludedCalendarIds: ["hidden-calendar"],
    });
    expect(saved?.reflectionNextSendAt?.toISOString()).toBe(
      "2026-11-08T17:30:00.000Z",
    );
    await driver
      .getServer()
      .put(path)
      .set("Cookie", cookie(user._id.toString()))
      .send({ ...settings, enabled: false })
      .expect(200);
    await initialize().expect(204);
    saved = await mongoService.user.findOne({ _id: user._id });
    expect(saved?.reflectionPreferences?.enabled).toBe(false);
    expect(saved?.emailPreferences?.reflectionDisabledAt).toBeInstanceOf(Date);
  });

  it("does not automatically enroll an existing account outside the onboarding cohort", async () => {
    CONFIG.REFLECTION_ROLLOUT_ENABLED = true;
    const { user } = await UtilDriver.setupTestUser();
    await driver
      .getServer()
      .post(path)
      .set("Cookie", cookie(user._id.toString()))
      .send({ timeZone: "America/Denver", excludedCalendarIds: [] })
      .expect(204);
    expect(
      (await mongoService.user.findOne({ _id: user._id }))
        ?.reflectionPreferences,
    ).toBeUndefined();
  });

  it("shows legacy unsubscribe-only preferences as off instead of rejecting missing timezone data", async () => {
    const { user } = await UtilDriver.setupTestUser();
    await mongoService.user.updateOne(
      { _id: user._id },
      {
        $set: {
          "reflectionPreferences.enabled": false,
          "emailPreferences.reflectionDisabledAt": new Date(),
        },
      },
    );
    const response = await driver
      .getServer()
      .get(path)
      .set("Cookie", cookie(user._id.toString()))
      .expect(200);
    expect(response.body.preferences).toBeNull();
  });

  it("gates enrollment by trial binding and complete history before public rollout", async () => {
    const { user } = await UtilDriver.setupTestUser();
    const put = (body = settings) =>
      driver
        .getServer()
        .put(path)
        .set("Cookie", cookie(user._id.toString()))
        .send(body);
    await put().expect(403);
    CONFIG.REFLECTION_TRIAL_USER_ID = user._id.toString();
    CONFIG.REFLECTION_TRIAL_EMAIL = "trial@example.com";
    await put().expect(200);
    CONFIG.REFLECTION_TRIAL_USER_ID = undefined;
    CONFIG.REFLECTION_TRIAL_EMAIL = undefined;
    CONFIG.REFLECTION_ROLLOUT_ENABLED = true;
    await put().expect(409);
    const client = getSyncServiceClient();
    spyOn(client, "readReflection").mockResolvedValue({
      ok: true,
      value: {
        events: [],
        historyComplete: true,
        oldestYear: null,
        nextCursor: null,
        truncated: false,
      },
    });
    await put().expect(200);
    await put({ ...settings, timeZone: "invalid/timezone" }).expect(400);
    const { user: other } = await UtilDriver.setupTestUser();
    const response = await driver
      .getServer()
      .get(path)
      .set("Cookie", cookie(other._id.toString()))
      .expect(200);
    expect(response.body.preferences).toBeNull();
  });

  it("disables queued mail and clears private snapshots even when enrollment is unavailable", async () => {
    const { user } = await UtilDriver.setupTestUser();
    await mongoService.emailSend.insertOne({
      _id: "private-edition",
      userId: user._id,
      sequence: "reflection",
      stepKey: "daily",
      status: "queued",
      sendAt: new Date(),
      nextAttemptAt: new Date(),
      attemptCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      reflection: {
        date: "2026-11-01",
        timeZone: settings.timeZone,
        cadence: "daily",
        trial: true,
        prepared: { text: "Private event" } as never,
      },
    });
    CONFIG.REFLECTION_ENABLED = false;
    await driver
      .getServer()
      .put(path)
      .set("Cookie", cookie(user._id.toString()))
      .send({ ...settings, enabled: false })
      .expect(200);
    const stored = await mongoService.user.findOne({ _id: user._id });
    expect(stored?.emailPreferences?.reflectionDisabledAt).toBeInstanceOf(Date);
    expect(stored?.emailPreferences?.unsubscribedAt).toBeUndefined();
    const row = await mongoService.emailSend.findOne({
      _id: "private-edition",
    });
    expect(row?.status).toBe("canceled");
    expect(row?.reflection?.prepared).toBeUndefined();
  });

  it("synchronizes visibility only for the signed-in account", async () => {
    const { user } = await UtilDriver.setupTestUser();
    const { user: other } = await UtilDriver.setupTestUser();
    await mongoService.user.updateMany(
      {},
      { $set: { reflectionPreferences: settings } },
    );
    const calendarId = "012345678901234567890123";
    const visibility = (isVisible: boolean) =>
      driver
        .getServer()
        .patch("/api/user/reflection-calendar-visibility")
        .set("Cookie", cookie(user._id.toString()))
        .send({ calendarId, isVisible });
    await visibility(false).expect(204);
    await visibility(false).expect(204);
    expect(
      (await mongoService.user.findOne({ _id: user._id }))
        ?.reflectionPreferences?.excludedCalendarIds,
    ).toEqual([calendarId]);
    expect(
      (await mongoService.user.findOne({ _id: other._id }))
        ?.reflectionPreferences?.excludedCalendarIds,
    ).toEqual([]);
    await visibility(true).expect(204);
    expect(
      (await mongoService.user.findOne({ _id: user._id }))
        ?.reflectionPreferences?.excludedCalendarIds,
    ).toEqual([]);
  });
});
