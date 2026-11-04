import { type Request, type Response } from "express";
import { ObjectId } from "mongodb";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import { CONFIG } from "@backend/common/constants/config.constants";
import mongoService from "@backend/common/services/mongo.service";
import { getSyncServiceClient } from "@backend/common/services/sync-service/sync-service.factory";
import emailUnsubscribeController from "@backend/email/controllers/email.unsubscribe.controller";
import { EmailSendRecordSchema } from "@backend/email/email-send.record";
import { dispatchReflection } from "@backend/email/reflection-dispatch";
import { enqueueDueReflections } from "@backend/email/reflection-enrollment";
import { createUnsubscribeToken } from "@backend/email/unsubscribe-token";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  setSystemTime,
  spyOn,
} from "bun:test";

describe("private reflection delivery", () => {
  const original = { ...CONFIG };
  const userId = new ObjectId();
  const now = new Date("2026-11-01T17:31:00Z");
  beforeAll(() => setupTestDb(import.meta.url));
  afterAll(cleanupTestDb);
  beforeEach(async () => {
    await cleanupCollections();
    setSystemTime(now);
    Object.assign(CONFIG, {
      REFLECTION_ENABLED: true,
      REFLECTION_ROLLOUT_ENABLED: false,
      REFLECTION_TRIAL_USER_ID: userId.toHexString(),
      REFLECTION_TRIAL_EMAIL: "trial@example.com",
      EMAIL_PROVIDER: "log",
      EMAIL_ALLOWLIST: [],
      EMAIL_UNSUBSCRIBE_SECRET: "reflection-test",
    });
    await mongoService.user.insertOne({
      _id: userId,
      email: "trial@example.com",
      firstName: "Trial",
      lastName: "User",
      name: "Trial User",
      locale: "en",
      lifePreferences: {
        revision: 1,
        preferences: {
          birthDate: "1990-02-03",
          lifespan: 79,
          variation: "average",
        },
      },
      reflectionPreferences: {
        enabled: true,
        timeZone: "America/Denver",
        excludedCalendarIds: [],
      },
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
        historyComplete: true,
        oldestYear: null,
        nextCursor: null,
        truncated: false,
      },
    });
  });
  afterEach(() => {
    Object.assign(CONFIG, original);
    mock.restore();
    setSystemTime();
  });

  it("enqueues exactly one daily edition across concurrent cycles and never enrolls another account", async () => {
    await mongoService.user.insertOne({
      _id: new ObjectId(),
      email: "other@example.com",
      firstName: "Other",
      lastName: "",
      name: "Other",
      locale: "en",
      reflectionPreferences: {
        enabled: true,
        timeZone: "America/Denver",
        excludedCalendarIds: [],
      },
    });
    await Promise.all([enqueueDueReflections(now), enqueueDueReflections(now)]);
    const rows = await mongoService.emailSend.find({}).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.recipientEmail).toBe("trial@example.com");
    expect(rows[0]?.reflection?.cadence).toBe("daily");
    expect(rows[0]?.sendAt.toISOString()).toBe("2026-11-01T17:30:00.000Z");
    expect(
      (
        await mongoService.user.findOne({ _id: userId })
      )?.reflectionNextSendAt?.toISOString(),
    ).toBe("2026-11-02T17:30:00.000Z");
  });

  it("sends a named PNG attachment, clears personal preparation data, and does not resend", async () => {
    await enqueueDueReflections(now);
    const row = EmailSendRecordSchema.parse(
      await mongoService.emailSend.findOne({ userId }),
    );
    const send = mock(async () => ({ messageId: "reflection-message" }));
    const provider = { send, verifyWebhook: () => [] };
    await dispatchReflection(row, provider);
    expect(send).toHaveBeenCalledTimes(1);
    const payload = send.mock.calls[0]?.[0];
    expect(payload?.to).toBe("trial@example.com");
    expect(payload?.attachments?.[0]?.filename).toBe(
      "compass-life-in-weeks-2026-11-01.png",
    );
    expect(payload?.personal).toBe(true);
    expect(payload?.text).toContain("/week/2026-11-01");
    const sent = await mongoService.emailSend.findOne({ _id: row._id });
    expect(sent?.status).toBe("sent");
    expect(sent?.reflection?.prepared).toBeUndefined();
    await dispatchReflection(row, provider);
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      (await mongoService.emailSend.findOne({ _id: row._id }))?.status,
    ).toBe("sent");
  });

  it("searches every available prior year and drains old-history pages before sending", async () => {
    const seen = new Set<string>();
    let oldestPages = 0;
    spyOn(getSyncServiceClient(), "readReflection").mockImplementation(
      async (_principal, query) => {
        for (const window of query.windows) seen.add(window.key);
        const oldest = query.windows.some(
          (window) => window.key === "history:2010",
        );
        if (oldest) oldestPages++;
        const secondPage = oldest && !!query.cursor;
        return {
          ok: true,
          correlationId: "history-test",
          value: {
            oldestYear: 2010,
            historyComplete: true,
            truncated: false,
            nextCursor: oldest && !query.cursor ? "oldest-page-2" : null,
            events: secondPage
              ? [
                  {
                    id: "old-memory",
                    eventId: "old-memory",
                    seriesId: "old-series",
                    calendarId: "calendar",
                    title: "Walk with a friend in 2010",
                    recurring: true,
                    uid: null,
                    windowKey: "history:2010",
                    schedule: {
                      kind: "timed",
                      start: "2010-10-28T16:00:00Z",
                      end: "2010-10-28T17:00:00Z",
                      timeZone: "America/Denver",
                    },
                  },
                ]
              : [],
          },
        };
      },
    );
    await enqueueDueReflections(now);
    const row = EmailSendRecordSchema.parse(
      await mongoService.emailSend.findOne({ userId }),
    );
    const send = mock(async () => ({ messageId: "historical-reflection" }));
    await dispatchReflection(row, { send, verifyWebhook: () => [] });
    expect(seen.size).toBe(18);
    expect(seen.has("history:2025")).toBe(true);
    expect(seen.has("history:2010")).toBe(true);
    expect(oldestPages).toBe(2);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]?.text).toContain(
      "Walk with a friend in 2010",
    );
  });

  it("fails closed if the trial binding disappears and expires missed morning sends", async () => {
    CONFIG.REFLECTION_TRIAL_EMAIL = undefined;
    await enqueueDueReflections(now);
    expect(await mongoService.emailSend.countDocuments()).toBe(0);
    CONFIG.REFLECTION_TRIAL_EMAIL = "trial@example.com";
    await enqueueDueReflections(now);
    const row = EmailSendRecordSchema.parse(
      await mongoService.emailSend.findOne({ userId }),
    );
    setSystemTime(new Date("2026-11-01T20:00:00Z"));
    const send = mock(async () => ({ messageId: "unexpected" }));
    await dispatchReflection(row, { send, verifyWebhook: () => [] });
    expect(send).not.toHaveBeenCalled();
    expect(
      (await mongoService.emailSend.findOne({ _id: row._id }))?.status,
    ).toBe("skipped");
  });

  it("retries an ambiguous provider response with the same frozen content and idempotency key", async () => {
    await enqueueDueReflections(now);
    const row = EmailSendRecordSchema.parse(
      await mongoService.emailSend.findOne({ userId }),
    );
    const send = mock(async () => ({
      messageId: "accepted",
    })).mockRejectedValueOnce(
      new Error("Response lost after provider acceptance"),
    );
    const provider = { send, verifyWebhook: () => [] };
    await dispatchReflection(row, provider);
    const retry = EmailSendRecordSchema.parse(
      await mongoService.emailSend.findOne({ _id: row._id }),
    );
    expect(retry.status).toBe("queued");
    expect(retry.attemptCount).toBe(1);
    expect(retry.reflection?.prepared).toBeDefined();
    const read = spyOn(getSyncServiceClient(), "readReflection");
    read.mockClear();
    await dispatchReflection(retry, provider);
    expect(read).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[0]).toEqual(send.mock.calls[0]?.[0]);
    expect(
      (await mongoService.emailSend.findOne({ _id: row._id }))?.status,
    ).toBe("sent");
  });

  it("discards a prepared retry after life settings change", async () => {
    await enqueueDueReflections(now);
    const row = EmailSendRecordSchema.parse(
      await mongoService.emailSend.findOne({ userId }),
    );
    const send = mock(async () => {
      throw new Error("Try again later");
    });
    const provider = { send, verifyWebhook: () => [] };
    await dispatchReflection(row, provider);
    const retry = EmailSendRecordSchema.parse(
      await mongoService.emailSend.findOne({ _id: row._id }),
    );
    await mongoService.user.updateOne(
      { _id: userId },
      { $inc: { "lifePreferences.revision": 1 } },
    );
    await dispatchReflection(retry, provider);
    expect(send).toHaveBeenCalledTimes(1);
    const canceled = await mongoService.emailSend.findOne({ _id: row._id });
    expect(canceled?.status).toBe("skipped");
    expect(canceled?.reflection?.prepared).toBeUndefined();
  });

  it("reflection opt-out cancels queued editions without changing welcome preferences", async () => {
    await enqueueDueReflections(now);
    const token = createUnsubscribeToken(
      userId.toHexString(),
      "reflection-test",
    );
    const req = { body: { token, scope: "reflection" }, query: {} } as Request;
    const res = {
      status: mock(() => res),
      type: mock(() => res),
      send: mock(() => res),
    } as unknown as Response;
    await emailUnsubscribeController.confirmUnsubscribe(req, res);
    const user = await mongoService.user.findOne({ _id: userId });
    expect(user?.emailPreferences?.reflectionDisabledAt).toBeInstanceOf(Date);
    expect(user?.emailPreferences?.unsubscribedAt).toBeUndefined();
    expect((await mongoService.emailSend.findOne({ userId }))?.status).toBe(
      "canceled",
    );
  });
});
