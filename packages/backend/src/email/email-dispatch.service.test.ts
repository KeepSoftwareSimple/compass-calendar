import { ObjectId } from "mongodb";
import { CONFIG } from "@backend/common/constants/config.constants";
import * as bookingHostContext from "@backend/email/booking-host-email.context";
import { EmailDispatchService } from "@backend/email/email-dispatch.service";
import { type EmailSendRecord } from "@backend/email/email-send.record";
import { emailSendRepository } from "@backend/email/email-send.repository";
import * as emailClient from "@backend/email/providers/email.client";
import * as welcomeContext from "@backend/email/welcome-sequence.context";
import * as previewLoop from "@backend/email/welcome-sequence.preview-loop";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

const baseRow = (overrides: Partial<EmailSendRecord> = {}): EmailSendRecord => {
  const userId = overrides.userId ?? new ObjectId();
  const stepKey = overrides.stepKey ?? "cmd-k";
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    _id: overrides._id ?? `${userId.toHexString()}:${stepKey}`,
    userId,
    sequence: "welcome",
    stepKey,
    status: "queued",
    sendAt: now,
    attemptCount: overrides.attemptCount ?? 0,
    nextAttemptAt: now,
    lastError: null,
    providerMessageId: null,
    sentAt: null,
    deliveredAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
};

describe("EmailDispatchService", () => {
  const originalProvider = CONFIG.EMAIL_PROVIDER;
  const originalAllowlist = [...CONFIG.EMAIL_ALLOWLIST];
  const originalSyntheticBases = [...CONFIG.SYNTHETIC_JOURNEY_EMAILS];

  beforeEach(() => {
    spyOn(emailSendRepository, "isQueued").mockResolvedValue(true);
  });

  afterEach(() => {
    CONFIG.EMAIL_PROVIDER = originalProvider;
    CONFIG.EMAIL_ALLOWLIST = originalAllowlist;
    CONFIG.SYNTHETIC_JOURNEY_EMAILS = originalSyntheticBases;
    mock.restore();
  });

  it("sends skipIf-gated steps for preview loop rows", async () => {
    CONFIG.EMAIL_PROVIDER = "log";
    CONFIG.EMAIL_ALLOWLIST = [];
    CONFIG.EMAIL_UNSUBSCRIBE_SECRET = "unsub-secret";
    const row = baseRow({
      stepKey: "trial-ending",
      _id: "preview-loop:abc:1:trial-ending",
      previewLoop: true,
      recipientEmail: "founder@example.com",
      previewLoopGeneration: 1,
    });
    const send = mock(async () => ({ messageId: "msg-preview" }));
    spyOn(emailClient, "buildEmailProvider").mockReturnValue({
      send,
      verifyWebhook: () => [],
    });
    spyOn(emailSendRepository, "claimDue").mockResolvedValue([row]);
    spyOn(emailSendRepository, "markSent").mockResolvedValue(row);
    spyOn(welcomeContext, "loadWelcomeSequenceUser").mockResolvedValue({
      email: "founder@example.com",
      billing: undefined,
    });
    spyOn(previewLoop, "isPreviewLoopOverDailyCap").mockResolvedValue(false);
    spyOn(previewLoop, "handlePreviewLoopAfterSend").mockResolvedValue(
      undefined,
    );
    spyOn(previewLoop, "ensurePreviewLoopEnrollments").mockResolvedValue(
      undefined,
    );

    await new EmailDispatchService().dispatchDue();

    expect(send).toHaveBeenCalled();
  });

  it("marks skipIf steps as skipped without calling the provider", async () => {
    CONFIG.EMAIL_PROVIDER = "log";
    const row = baseRow({ stepKey: "trial-ending" });
    const send = mock(async () => ({ messageId: "msg-1" }));
    spyOn(emailClient, "buildEmailProvider").mockReturnValue({
      send,
      verifyWebhook: () => [],
    });
    spyOn(emailSendRepository, "claimDue").mockResolvedValue([row]);
    const markSkipped = spyOn(
      emailSendRepository,
      "markSkipped",
    ).mockResolvedValue(row);
    spyOn(welcomeContext, "loadWelcomeSequenceUser").mockResolvedValue({
      email: "guest@example.com",
      billing: undefined,
    });

    await new EmailDispatchService().dispatchDue();

    expect(markSkipped).toHaveBeenCalledWith(row._id, "Step skipped by skipIf");
    expect(send).not.toHaveBeenCalled();
  });

  it("marks non-allowlisted recipients as skipped", async () => {
    CONFIG.EMAIL_PROVIDER = "log";
    CONFIG.EMAIL_ALLOWLIST = ["allowed@example.com"];
    const row = baseRow();
    spyOn(emailSendRepository, "claimDue").mockResolvedValue([row]);
    const markSkipped = spyOn(
      emailSendRepository,
      "markSkipped",
    ).mockResolvedValue(row);
    spyOn(welcomeContext, "loadWelcomeSequenceUser").mockResolvedValue({
      email: "guest@example.com",
      billing: undefined,
    });

    await new EmailDispatchService().dispatchDue();

    expect(markSkipped).toHaveBeenCalledWith(
      row._id,
      "Recipient not allowlisted",
    );
  });

  it("skips welcome sends for configured synthetic journey plus addresses", async () => {
    CONFIG.EMAIL_PROVIDER = "log";
    CONFIG.EMAIL_ALLOWLIST = [];
    CONFIG.SYNTHETIC_JOURNEY_EMAILS = ["lance.essert@gmail.com"];
    const row = baseRow();
    const send = mock(async () => ({ messageId: "msg-1" }));
    spyOn(emailClient, "buildEmailProvider").mockReturnValue({
      send,
      verifyWebhook: () => [],
    });
    spyOn(emailSendRepository, "claimDue").mockResolvedValue([row]);
    const markSkipped = spyOn(
      emailSendRepository,
      "markSkipped",
    ).mockResolvedValue(row);
    spyOn(welcomeContext, "loadWelcomeSequenceUser").mockResolvedValue({
      email: "lance.essert+journey1730123456789@gmail.com",
      billing: undefined,
    });

    await new EmailDispatchService().dispatchDue();

    expect(markSkipped).toHaveBeenCalledWith(row._id, "Synthetic account");
    expect(send).not.toHaveBeenCalled();
  });

  it("passes USER_FIRST_NAME when the user has a first name", async () => {
    CONFIG.EMAIL_PROVIDER = "log";
    CONFIG.EMAIL_ALLOWLIST = [];
    CONFIG.EMAIL_UNSUBSCRIBE_SECRET = "unsub-secret";
    const row = baseRow();
    spyOn(emailSendRepository, "claimDue").mockResolvedValue([row]);
    spyOn(welcomeContext, "loadWelcomeSequenceUser").mockResolvedValue({
      email: "guest@example.com",
      firstName: "Ada",
      billing: undefined,
    });
    const send = mock(async () => ({ messageId: "provider-123" }));
    spyOn(emailClient, "buildEmailProvider").mockReturnValue({
      send,
      verifyWebhook: () => [],
    });
    spyOn(emailSendRepository, "markSent").mockResolvedValue(row);

    await new EmailDispatchService().dispatchDue();

    expect(send.mock.calls[0]?.[0].template?.variables.USER_FIRST_NAME).toBe(
      "Ada",
    );
  });

  it("omits USER_FIRST_NAME when first name is missing or blank", async () => {
    CONFIG.EMAIL_PROVIDER = "log";
    CONFIG.EMAIL_ALLOWLIST = [];
    CONFIG.EMAIL_UNSUBSCRIBE_SECRET = "unsub-secret";
    const row = baseRow();
    spyOn(emailSendRepository, "claimDue").mockResolvedValue([row]);
    spyOn(welcomeContext, "loadWelcomeSequenceUser").mockResolvedValue({
      email: "guest@example.com",
      billing: undefined,
    });
    const send = mock(async () => ({ messageId: "provider-123" }));
    spyOn(emailClient, "buildEmailProvider").mockReturnValue({
      send,
      verifyWebhook: () => [],
    });
    spyOn(emailSendRepository, "markSent").mockResolvedValue(row);

    await new EmailDispatchService().dispatchDue();

    expect(send.mock.calls[0]?.[0].template?.variables).not.toHaveProperty(
      "USER_FIRST_NAME",
    );
  });

  it("marks sent rows with the provider message id", async () => {
    CONFIG.EMAIL_PROVIDER = "log";
    CONFIG.EMAIL_ALLOWLIST = [];
    CONFIG.EMAIL_UNSUBSCRIBE_SECRET = "unsub-secret";
    const row = baseRow();
    spyOn(emailSendRepository, "claimDue").mockResolvedValue([row]);
    spyOn(welcomeContext, "loadWelcomeSequenceUser").mockResolvedValue({
      email: "guest@example.com",
      billing: undefined,
    });
    const markSent = spyOn(emailSendRepository, "markSent").mockResolvedValue(
      row,
    );
    const send = mock(async () => ({ messageId: "provider-123" }));
    spyOn(emailClient, "buildEmailProvider").mockReturnValue({
      send,
      verifyWebhook: () => [],
    });

    await new EmailDispatchService().dispatchDue();

    expect(markSent).toHaveBeenCalledWith(row._id, "provider-123");
    const sendInput = send.mock.calls[0]?.[0];
    expect(sendInput?.template?.id).toBe("04-cmdk");
    expect(sendInput?.template?.variables.CTA_URL).toContain(
      "utm_source=email",
    );
    expect(sendInput?.template?.variables.CTA_URL).toContain(
      "utm_content=cmd-k",
    );
    expect(sendInput?.template?.variables.UNSUBSCRIBE_URL).toContain("token=");
    expect(sendInput?.headers["List-Unsubscribe"]).toContain("mailto:");
    expect(send.mock.calls[0]?.[0].headers["List-Unsubscribe"]).toContain(
      "https://",
    );
    expect(send.mock.calls[0]?.[0].headers["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
  });

  it("cancels before send when the user unsubscribes after the row was claimed", async () => {
    CONFIG.EMAIL_PROVIDER = "log";
    const row = baseRow();
    const send = mock(async () => ({ messageId: "msg-1" }));
    spyOn(emailClient, "buildEmailProvider").mockReturnValue({
      send,
      verifyWebhook: () => [],
    });
    spyOn(emailSendRepository, "claimDue").mockResolvedValue([row]);
    spyOn(emailSendRepository, "isQueued").mockResolvedValue(true);
    const markCanceled = spyOn(
      emailSendRepository,
      "markCanceled",
    ).mockResolvedValue(row);
    const loadUser = spyOn(welcomeContext, "loadWelcomeSequenceUser");
    loadUser.mockResolvedValueOnce({
      email: "guest@example.com",
      billing: undefined,
    });
    loadUser.mockResolvedValueOnce({
      email: "guest@example.com",
      billing: undefined,
      emailPreferences: { unsubscribedAt: new Date() },
    });

    await new EmailDispatchService().dispatchDue();

    expect(markCanceled).toHaveBeenCalledWith(row._id);
    expect(send).not.toHaveBeenCalled();
  });

  it("cancels queued rows for unsubscribed users without calling the provider", async () => {
    CONFIG.EMAIL_PROVIDER = "log";
    const row = baseRow();
    const send = mock(async () => ({ messageId: "msg-1" }));
    spyOn(emailClient, "buildEmailProvider").mockReturnValue({
      send,
      verifyWebhook: () => [],
    });
    spyOn(emailSendRepository, "claimDue").mockResolvedValue([row]);
    const markCanceled = spyOn(
      emailSendRepository,
      "markCanceled",
    ).mockResolvedValue(row);
    spyOn(welcomeContext, "loadWelcomeSequenceUser").mockResolvedValue({
      email: "guest@example.com",
      billing: undefined,
      emailPreferences: { unsubscribedAt: new Date() },
    });

    await new EmailDispatchService().dispatchDue();

    expect(markCanceled).toHaveBeenCalledWith(row._id);
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ["an upstream error", "Resend send failed (500): upstream"],
    [
      "a rejected API key",
      'Resend send failed (401): {"statusCode":401,"name":"validation_error","message":"API key is invalid"}',
    ],
  ])("records failure with backoff on %s", async (_label, message) => {
    CONFIG.EMAIL_PROVIDER = "log";
    const row = baseRow();
    spyOn(emailSendRepository, "claimDue").mockResolvedValue([row]);
    spyOn(welcomeContext, "loadWelcomeSequenceUser").mockResolvedValue({
      email: "guest@example.com",
      billing: undefined,
    });
    const recordFailure = spyOn(
      emailSendRepository,
      "recordFailure",
    ).mockResolvedValue(row);
    const markSkipped = spyOn(emailSendRepository, "markSkipped");
    spyOn(emailClient, "buildEmailProvider").mockReturnValue({
      send: mock(async () => {
        throw new Error(message);
      }),
      verifyWebhook: () => [],
    });

    await new EmailDispatchService().dispatchDue();

    expect(recordFailure).toHaveBeenCalled();
    expect(markSkipped).not.toHaveBeenCalled();
  });

  it("skips the row when the provider rejects the recipient", async () => {
    CONFIG.EMAIL_PROVIDER = "log";
    const row = baseRow();
    spyOn(emailSendRepository, "claimDue").mockResolvedValue([row]);
    spyOn(welcomeContext, "loadWelcomeSequenceUser").mockResolvedValue({
      email: "guest@example.com",
      billing: undefined,
    });
    const recordFailure = spyOn(emailSendRepository, "recordFailure");
    const markSkipped = spyOn(
      emailSendRepository,
      "markSkipped",
    ).mockResolvedValue(row);
    const message =
      'Resend send failed (422): {"statusCode":422,"name":"validation_error","message":"Invalid `to` field."}';
    spyOn(emailClient, "buildEmailProvider").mockReturnValue({
      send: mock(async () => {
        throw new Error(message);
      }),
      verifyWebhook: () => [],
    });

    await new EmailDispatchService().dispatchDue();

    expect(markSkipped).toHaveBeenCalledWith(row._id, message);
    expect(recordFailure).not.toHaveBeenCalled();
  });

  it("cancels booking-host rows when the host opted out without calling the provider", async () => {
    CONFIG.EMAIL_PROVIDER = "log";
    const reservationId = new ObjectId();
    const row = baseRow({
      sequence: "booking-host",
      stepKey: "booked",
      _id: `booking-host:${reservationId.toHexString()}:1:booked`,
      reservationId,
    });
    const send = mock(async () => ({ messageId: "msg-booking" }));
    spyOn(emailClient, "buildEmailProvider").mockReturnValue({
      send,
      verifyWebhook: () => [],
    });
    spyOn(emailSendRepository, "claimDue").mockResolvedValue([row]);
    const markCanceled = spyOn(
      emailSendRepository,
      "markCanceled",
    ).mockResolvedValue(row);
    spyOn(
      bookingHostContext,
      "loadBookingHostEmailDispatchContext",
    ).mockResolvedValue({
      user: {
        email: "host@example.com",
        firstName: "Host",
        emailPreferences: { bookingHostEmailDisabledAt: new Date() },
      },
      reservation: {
        guestName: "Alex",
        guestEmail: "alex@example.com",
        notes: null,
        guestTimeZone: "America/New_York",
        slotStart: new Date(),
        slotEnd: new Date(),
      },
      page: { timeZone: "America/Los_Angeles", durationMinutes: 30 },
      durationMinutes: 30,
      conference: "meet",
      openInCompassUrl: "https://app.compasscalendar.com/week/2026-10-24",
    });

    await new EmailDispatchService().dispatchDue();

    expect(markCanceled).toHaveBeenCalledWith(row._id);
    expect(send).not.toHaveBeenCalled();
  });

  it("sends inline booking-host email content through the provider", async () => {
    CONFIG.EMAIL_PROVIDER = "log";
    CONFIG.EMAIL_UNSUBSCRIBE_SECRET = "unsub-secret";
    const reservationId = new ObjectId();
    const row = baseRow({
      sequence: "booking-host",
      stepKey: "cancelled",
      _id: `booking-host:${reservationId.toHexString()}:1:cancelled`,
      reservationId,
    });
    const send = mock(async () => ({ messageId: "msg-booking-cancel" }));
    spyOn(emailClient, "buildEmailProvider").mockReturnValue({
      send,
      verifyWebhook: () => [],
    });
    spyOn(emailSendRepository, "claimDue").mockResolvedValue([row]);
    spyOn(emailSendRepository, "markSent").mockResolvedValue(row);
    spyOn(
      bookingHostContext,
      "loadBookingHostEmailDispatchContext",
    ).mockResolvedValue({
      user: {
        email: "host@example.com",
        firstName: "Host",
      },
      reservation: {
        guestName: "Alex",
        guestEmail: "alex@example.com",
        notes: "Notes",
        guestTimeZone: "America/New_York",
        slotStart: new Date("2026-10-24T17:00:00.000Z"),
        slotEnd: new Date("2026-10-24T17:30:00.000Z"),
      },
      page: { timeZone: "America/Los_Angeles", durationMinutes: 30 },
      durationMinutes: 30,
      conference: "none",
      openInCompassUrl: "https://app.compasscalendar.com/week/2026-10-24",
    });

    await new EmailDispatchService().dispatchDue();

    expect(send).toHaveBeenCalledTimes(1);
    const payload = send.mock.calls[0]?.[0] as {
      subject?: string;
      html?: string;
      text?: string;
    };
    expect(payload.subject).toContain("cancelled");
    expect(payload.html).toContain("Turn off booking alert emails");
    expect(payload.text).toContain("Alex");
  });
});
