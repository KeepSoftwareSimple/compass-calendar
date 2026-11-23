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

const waitFor = async (check: () => void) => {
  for (let i = 0; i < 50; i++) {
    try {
      return check();
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  check();
};

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

  it("does not enroll anyone automatically and no longer accepts initialization", async () => {
    const { user } = await UtilDriver.setupTestUser();
    await driver
      .getServer()
      .post(path)
      .set("Cookie", cookie(user._id.toString()))
      .send({ timeZone: "America/Denver", excludedCalendarIds: [] })
      .expect(404);
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

  it("gates opt-in by the feature switch and queues one confirmation email", async () => {
    const { user } = await UtilDriver.setupTestUser();
    const put = (body = settings) =>
      driver
        .getServer()
        .put(path)
        .set("Cookie", cookie(user._id.toString()))
        .send(body);
    CONFIG.REFLECTION_ENABLED = false;
    await put().expect(403);
    CONFIG.REFLECTION_ENABLED = true;
    await put({ ...settings, timeZone: "invalid/timezone" }).expect(400);
    const confirmations = () =>
      mongoService.emailSend.countDocuments({
        userId: user._id,
        sequence: "reflection",
        stepKey: "confirmation",
        status: "queued",
      });
    await put().expect(200);
    expect(await confirmations()).toBe(1);
    // A timezone change or a later re-enable never sends a second confirmation.
    await put({ ...settings, timeZone: "America/New_York" }).expect(200);
    await put({ ...settings, enabled: false }).expect(200);
    expect(await confirmations()).toBe(0);
    await put().expect(200);
    expect(
      await mongoService.emailSend.countDocuments({
        userId: user._id,
        stepKey: "confirmation",
      }),
    ).toBe(1);
    const { user: other } = await UtilDriver.setupTestUser();
    const response = await driver
      .getServer()
      .get(path)
      .set("Cookie", cookie(other._id.toString()))
      .expect(200);
    expect(response.body.preferences).toBeNull();
  });

  it("starts the history import on opt-in and refuses accounts that unsubscribed from all email", async () => {
    const client = getSyncServiceClient();
    const importHistory = spyOn(
      client,
      "importReflectionHistory",
    ).mockResolvedValue({ ok: true, value: { queued: 0 } } as never);
    const { user } = await UtilDriver.setupTestUser();
    const put = (body = settings) =>
      driver
        .getServer()
        .put(path)
        .set("Cookie", cookie(user._id.toString()))
        .send(body);
    await put().expect(200);
    await waitFor(() => expect(importHistory).toHaveBeenCalled());
    await put({ ...settings, enabled: false }).expect(200);
    const paused = await driver
      .getServer()
      .get(path)
      .set("Cookie", cookie(user._id.toString()))
      .expect(200);
    expect(paused.body.paused).toBe(true);
    await mongoService.user.updateOne(
      { _id: user._id },
      { $set: { "emailPreferences.unsubscribedAt": new Date() } },
    );
    const refused = await put().expect(403);
    expect(refused.body.message).toContain("unsubscribed from all");
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
