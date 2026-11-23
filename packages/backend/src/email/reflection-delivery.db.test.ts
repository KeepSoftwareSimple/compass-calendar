import { type Request, type Response } from "express";
import { ObjectId } from "mongodb";
import {
  ProviderCalendarSchema,
  ProviderConnectionSchema,
} from "@core/types/sync/connection.contracts";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import { CONFIG } from "@backend/common/constants/config.constants";
import mongoService from "@backend/common/services/mongo.service";
import { getSyncServiceClient } from "@backend/common/services/sync-service/sync-service.factory";
import emailUnsubscribeController from "@backend/email/controllers/email.unsubscribe.controller";
import { EmailDispatchService } from "@backend/email/email-dispatch.service";
import { EmailSendRecordSchema } from "@backend/email/email-send.record";
import { emailSendRepository } from "@backend/email/email-send.repository";
import * as emailClient from "@backend/email/providers/email.client";
import * as reflectionContext from "@backend/email/reflection-context";
import {
  dispatchReflection,
  dispatchReflectionBatch,
} from "@backend/email/reflection-dispatch";
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

describe("opt-in reflection delivery", () => {
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

  it("enqueues exactly one weekly edition across concurrent cycles and skips accounts that have not opted in", async () => {
    await mongoService.user.insertOne({
      _id: new ObjectId(),
      email: "other@example.com",
      firstName: "Other",
      lastName: "",
      name: "Other",
      locale: "en",
    });
    await Promise.all([enqueueDueReflections(now), enqueueDueReflections(now)]);
    const rows = await mongoService.emailSend.find({}).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.recipientEmail).toBe("trial@example.com");
    expect(rows[0]?.reflection?.cadence).toBe("weekly");
    expect(rows[0]?.sendAt.toISOString()).toBe("2026-11-01T17:30:00.000Z");
    expect(
      (
        await mongoService.user.findOne({ _id: userId })
      )?.reflectionNextSendAt?.toISOString(),
    ).toBe("2026-11-08T17:30:00.000Z");
  });

  // A welcome-email unsubscribe stamps `unsubscribedAt`, not
  // `reflectionDisabledAt`. Enrollment must not re-queue a review afterwards.
  it("stops weekly reviews after an unscoped unsubscribe", async () => {
    await enqueueDueReflections(now);
    expect(
      await mongoService.emailSend.countDocuments({ status: "queued" }),
    ).toBe(1);

    const token = createUnsubscribeToken(
      userId.toHexString(),
      CONFIG.EMAIL_UNSUBSCRIBE_SECRET!,
    );
    const res = {
      status: mock(() => res),
      type: mock(() => res),
      send: mock(() => {}),
    };
    await emailUnsubscribeController.confirmUnsubscribe(
      { body: { token } } as Request,
      res as unknown as Response,
    );
    expect(
      (await mongoService.user.findOne({ _id: userId }))?.emailPreferences
        ?.unsubscribedAt,
    ).toBeDefined();
    expect(
      await mongoService.emailSend.countDocuments({ status: "queued" }),
    ).toBe(0);

    await mongoService.user.updateOne(
      { _id: userId },
      { $unset: { reflectionNextSendAt: "" } },
    );
    await enqueueDueReflections(now);
    expect(
      await mongoService.emailSend.countDocuments({ status: "queued" }),
    ).toBe(0);
  });

  it("does not send a private edition on weekdays", async () => {
    const monday = new Date("2026-11-23T17:31:00Z");
    setSystemTime(monday);
    await enqueueDueReflections(monday);
    expect(await mongoService.emailSend.countDocuments({})).toBe(0);
    expect(
      (
        await mongoService.user.findOne({ _id: userId })
      )?.reflectionNextSendAt?.toISOString(),
    ).toBe("2026-11-29T17:30:00.000Z");
  });

  it("cancels queued legacy daily editions", async () => {
    await enqueueDueReflections(now);
    const row = (await mongoService.emailSend.findOne({}))!;
    const send = mock(async () => ({ messageId: "unexpected" }));
    await dispatchReflection(
      { ...row, reflection: { ...row.reflection!, cadence: "daily" } },
      { send, verifyWebhook: () => [] },
    );
    expect(send).not.toHaveBeenCalled();
    expect(
      (await mongoService.emailSend.findOne({ _id: row._id }))?.status,
    ).toBe("skipped");
  });

  it.each([
    "actionRequired",
    "disconnected",
    "revokedDuringPreparation",
  ] as const)(
    "withholds public reviews from unavailable calendar connections: %s",
    async (state) => {
      const connectionId = new ObjectId().toHexString();
      const calendarId = new ObjectId().toHexString();
      const scope = {
        tenantId: userId.toHexString(),
        principalId: userId.toHexString(),
      };
      const createdAt = now.toISOString();
      const calendar = ProviderCalendarSchema.parse({
        ...scope,
        id: calendarId,
        connectionId,
        providerCalendarId: "primary",
        displayName: "Calendar",
        color: null,
        active: true,
        primary: true,
        accessRole: "owner",
        capabilities: {
          canReadEvents: true,
          canWriteEvents: true,
          canReadBusy: true,
          canInviteAttendees: true,
        },
        createdAt,
        updatedAt: createdAt,
      });
      let reads = 0;
      const client = getSyncServiceClient();
      spyOn(client, "listCalendars").mockResolvedValue({
        ok: true,
        value: { calendars: [calendar] },
      });
      spyOn(client, "listConnections").mockImplementation(async () => {
        const healthy = state === "revokedDuringPreparation" && reads++ === 0;
        const currentState = healthy
          ? "healthy"
          : state === "disconnected"
            ? "disconnected"
            : "actionRequired";
        const connection = ProviderConnectionSchema.parse({
          ...scope,
          id: connectionId,
          provider: "google",
          account: {
            providerAccountId: "account",
            email: "trial@example.com",
            displayName: "Trial",
          },
          capabilities: ["readEvents"],
          state: currentState,
          stateReason:
            currentState === "actionRequired" ? "authorizationRevoked" : null,
          lastSyncedAt: createdAt,
          lastHealthyAt: createdAt,
          createdAt,
          updatedAt: createdAt,
        });
        return { ok: true, value: { connections: [connection] } };
      });
      await enqueueDueReflections(now);
      const row = (await mongoService.emailSend.findOne({}))!;
      const send = mock(async () => ({ messageId: "unexpected" }));
      await dispatchReflection(row, { send, verifyWebhook: () => [] });
      expect(send).not.toHaveBeenCalled();
      const result = await mongoService.emailSend.findOne({ _id: row._id });
      expect(result?.reflection?.prepared).toBeUndefined();
      expect(result?.status).toBe(
        state === "revokedDuringPreparation" ? "skipped" : "queued",
      );
    },
  );

  it("prepares four reviews at a time while serializing provider sends and recovering after an error", async () => {
    for (let index = 0; index < 5; index++)
      await mongoService.user.insertOne({
        _id: new ObjectId(),
        email: `batch-${index}@example.com`,
        firstName: "Batch",
        lastName: "",
        name: "Batch",
        locale: "en",
        reflectionPreferences: {
          enabled: true,
          timeZone: "America/Denver",
          excludedCalendarIds: [],
        },
      });
    await enqueueDueReflections(now);
    const rows = await mongoService.emailSend.find({}).toArray();
    expect(rows).toHaveLength(6);
    let preparing = 0;
    let maxPreparing = 0;
    let preparedCount = 0;
    let releaseFirstBatch!: () => void;
    const firstBatch = new Promise<void>((resolve) => {
      releaseFirstBatch = resolve;
    });
    spyOn(reflectionContext, "prepareReflection").mockImplementation(
      async (_row, user) => {
        maxPreparing = Math.max(maxPreparing, ++preparing);
        if (++preparedCount <= 4) {
          if (preparedCount === 4) releaseFirstBatch();
          await firstBatch;
        }
        preparing--;
        return {
          subject: "Your weekly review",
          html: "<p>Review</p>",
          text: "Review",
          pdfBase64: null,
          memoryIds: [],
          calendarIds: [],
          lifeRevision: user.lifePreferences?.revision ?? 0,
        };
      },
    );
    let sending = 0;
    let maxSending = 0;
    let attempts = 0;
    const send = mock(async () => {
      maxSending = Math.max(maxSending, ++sending);
      await new Promise((resolve) => setTimeout(resolve, 10));
      sending--;
      if (++attempts === 1) throw new Error("temporary provider failure");
      return { messageId: `batch-${attempts}` };
    });
    await dispatchReflectionBatch(rows, { send, verifyWebhook: () => [] });
    expect(maxPreparing).toBe(4);
    expect(maxSending).toBe(1);
    expect(send).toHaveBeenCalledTimes(6);
    expect(
      await mongoService.emailSend.countDocuments({ status: "sent" }),
    ).toBe(5);
    expect(
      await mongoService.emailSend.countDocuments({
        status: "queued",
        attemptCount: 1,
      }),
    ).toBe(1);
  });

  it("never enrolls an account that has not opted in, even with a pending onboarding review", async () => {
    const newId = new ObjectId();
    await mongoService.user.insertOne({
      _id: newId,
      email: "new@example.com",
      firstName: "New",
      lastName: "",
      name: "New",
      locale: "en",
    });
    await mongoService.emailSend.insertOne(
      EmailSendRecordSchema.parse({
        _id: `${newId.toHexString()}:weekly-review`,
        userId: newId,
        sequence: "welcome",
        stepKey: "weekly-review",
        status: "queued",
        sendAt: new Date("2026-11-03T17:30:00Z"),
        nextAttemptAt: new Date("2026-11-03T17:30:00Z"),
        attemptCount: 0,
        lastError: null,
        providerMessageId: null,
        sentAt: null,
        deliveredAt: null,
        createdAt: now,
        updatedAt: now,
      }),
    );
    await enqueueDueReflections(now);
    expect(
      (await mongoService.user.findOne({ _id: newId }))?.reflectionPreferences,
    ).toBeUndefined();
    expect(
      await mongoService.emailSend.countDocuments({
        userId: newId,
        sequence: "reflection",
      }),
    ).toBe(0);
  });

  const onboardingRow = () =>
    EmailSendRecordSchema.parse({
      _id: `${userId.toHexString()}:weekly-review`,
      userId,
      sequence: "welcome",
      stepKey: "weekly-review",
      status: "queued",
      sendAt: now,
      nextAttemptAt: now,
      attemptCount: 0,
      lastError: null,
      providerMessageId: null,
      sentAt: null,
      deliveredAt: null,
      createdAt: now,
      updatedAt: now,
    });

  it("retries the onboarding review with frozen content across date and calendar changes", async () => {
    const row = onboardingRow();
    await mongoService.emailSend.insertOne(row);
    spyOn(emailSendRepository, "claimDue").mockResolvedValue([row]);
    let attempts = 0;
    const send = mock(async (_input: unknown) => {
      if (++attempts === 1) throw new Error("ambiguous delivery");
      return { messageId: "onboarding-retry" };
    });
    spyOn(emailClient, "buildEmailProvider").mockReturnValue({
      send,
      verifyWebhook: () => [],
    });
    const service = new EmailDispatchService();
    await service.dispatchDue();
    expect(
      (await mongoService.emailSend.findOne({ _id: row._id }))?.reflection
        ?.prepared,
    ).toBeDefined();
    setSystemTime(new Date(now.getTime() + 86_400_000));
    const read = spyOn(
      getSyncServiceClient(),
      "readReflection",
    ).mockRejectedValue(new Error("history changed"));
    read.mockClear();
    await service.dispatchDue();
    expect(read).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]![0]).toEqual(send.mock.calls[0]![0]);
    const sent = await mongoService.emailSend.findOne({ _id: row._id });
    expect(sent?.status).toBe("sent");
    expect(sent?.reflection?.prepared).toBeUndefined();
  });

  it("clears a pending onboarding snapshot when reviews are paused", async () => {
    const row = onboardingRow();
    await mongoService.emailSend.insertOne(row);
    spyOn(emailSendRepository, "claimDue").mockResolvedValue([row]);
    spyOn(emailClient, "buildEmailProvider").mockReturnValue({
      send: mock(async () => {
        throw new Error("ambiguous delivery");
      }),
      verifyWebhook: () => [],
    });
    await new EmailDispatchService().dispatchDue();
    expect(
      (await mongoService.emailSend.findOne({ _id: row._id }))?.reflection
        ?.prepared,
    ).toBeDefined();
    const token = createUnsubscribeToken(
      userId.toHexString(),
      CONFIG.EMAIL_UNSUBSCRIBE_SECRET!,
    );
    const res = {
      status: mock(() => res),
      type: mock(() => res),
      send: mock(() => {}),
    };
    await emailUnsubscribeController.confirmUnsubscribe(
      { body: { token, scope: "reflection" } } as Request,
      res as unknown as Response,
    );
    const canceled = await mongoService.emailSend.findOne({ _id: row._id });
    expect(canceled?.status).toBe("canceled");
    expect(canceled?.reflection?.prepared).toBeUndefined();
  });

  it("delivers the final onboarding review with an introduction and the user's calendar content", async () => {
    const row = EmailSendRecordSchema.parse({
      _id: `${userId.toHexString()}:weekly-review`,
      userId,
      sequence: "welcome",
      stepKey: "weekly-review",
      status: "queued",
      sendAt: now,
      nextAttemptAt: now,
      attemptCount: 0,
      lastError: null,
      providerMessageId: null,
      sentAt: null,
      deliveredAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await mongoService.emailSend.insertOne(row);
    spyOn(emailSendRepository, "claimDue").mockResolvedValue([row]);
    const send = mock(async (_input: unknown) => ({
      messageId: "onboarding-review",
    }));
    spyOn(emailClient, "buildEmailProvider").mockReturnValue({
      send,
      verifyWebhook: () => [],
    });
    await new EmailDispatchService().dispatchDue();
    expect(send).toHaveBeenCalledTimes(1);
    const content = send.mock.calls[0]![0] as unknown as {
      subject: string;
      html: string;
      text: string;
      attachments: unknown[];
    };
    expect(content.subject).toBe("Your weekly review (5/5)");
    expect(content.text).toContain("Sunday at 10:30 a.m.");
    expect(content.text).toContain("Settings > Notifications");
    expect(content.text).toContain("Your past week, Oct 25-31");
    expect(content.text).toContain("Next week, Nov 1-7");
    expect(content.attachments).toHaveLength(1);
    expect(
      (await mongoService.emailSend.findOne({ _id: row._id }))?.status,
    ).toBe("sent");
  });

  it("does not send the onboarding review after a user pauses reviews", async () => {
    await mongoService.user.updateOne(
      { _id: userId },
      { $set: { "reflectionPreferences.enabled": false } },
    );
    const row = EmailSendRecordSchema.parse({
      _id: `${userId.toHexString()}:weekly-review`,
      userId,
      sequence: "welcome",
      stepKey: "weekly-review",
      status: "queued",
      sendAt: now,
      nextAttemptAt: now,
      attemptCount: 0,
      lastError: null,
      providerMessageId: null,
      sentAt: null,
      deliveredAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await mongoService.emailSend.insertOne(row);
    spyOn(emailSendRepository, "claimDue").mockResolvedValue([row]);
    const send = mock(async () => ({ messageId: "unexpected" }));
    spyOn(emailClient, "buildEmailProvider").mockReturnValue({
      send,
      verifyWebhook: () => [],
    });
    await new EmailDispatchService().dispatchDue();
    expect(send).not.toHaveBeenCalled();
    expect(
      (await mongoService.emailSend.findOne({ _id: row._id }))?.status,
    ).toBe("skipped");
  });

  it("sends a named PDF attachment, clears personal preparation data, and does not resend", async () => {
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
      "compass-life-in-weeks-2026-11-01.pdf",
    );
    expect(payload?.attachments?.[0]?.contentType).toBe("application/pdf");
    expect(payload?.attachments?.[0]?.contentId).toBeUndefined();
    expect(payload?.html).not.toContain("<img");
    expect(payload?.html).not.toContain("cid:");
    expect(payload?.personal).toBe(true);
    expect(payload?.text).toContain("/week/2026-11-02");
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
