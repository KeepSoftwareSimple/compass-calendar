import { ObjectId } from "mongodb";
import { CONFIG } from "@backend/common/constants/config.constants";
import { EmailDispatchService } from "@backend/email/email-dispatch.service";
import { type EmailSendRecord } from "@backend/email/email-send.record";
import { emailSendRepository } from "@backend/email/email-send.repository";
import * as emailClient from "@backend/email/providers/email.client";
import * as welcomeContext from "@backend/email/welcome-sequence.context";
import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

const baseRow = (overrides: Partial<EmailSendRecord> = {}): EmailSendRecord => {
  const userId = overrides.userId ?? new ObjectId();
  const stepKey = overrides.stepKey ?? "welcome";
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
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
};

describe("EmailDispatchService", () => {
  const originalProvider = CONFIG.EMAIL_PROVIDER;
  const originalAllowlist = [...CONFIG.EMAIL_ALLOWLIST];

  afterEach(() => {
    CONFIG.EMAIL_PROVIDER = originalProvider;
    CONFIG.EMAIL_ALLOWLIST = originalAllowlist;
    mock.restore();
  });

  it("marks skipIf steps as skipped without calling the provider", async () => {
    CONFIG.EMAIL_PROVIDER = "log";
    const row = baseRow({ stepKey: "connect-calendar" });
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
      hasConnectedCalendar: true,
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
      hasConnectedCalendar: false,
      billing: undefined,
    });

    await new EmailDispatchService().dispatchDue();

    expect(markSkipped).toHaveBeenCalledWith(
      row._id,
      "Recipient not allowlisted",
    );
  });

  it("marks sent rows with the provider message id", async () => {
    CONFIG.EMAIL_PROVIDER = "log";
    CONFIG.EMAIL_ALLOWLIST = [];
    const row = baseRow();
    spyOn(emailSendRepository, "claimDue").mockResolvedValue([row]);
    spyOn(welcomeContext, "loadWelcomeSequenceUser").mockResolvedValue({
      email: "guest@example.com",
      hasConnectedCalendar: false,
      billing: undefined,
    });
    const markSent = spyOn(emailSendRepository, "markSent").mockResolvedValue(
      row,
    );
    spyOn(emailClient, "buildEmailProvider").mockReturnValue({
      send: mock(async () => ({ messageId: "provider-123" })),
      verifyWebhook: () => [],
    });

    await new EmailDispatchService().dispatchDue();

    expect(markSent).toHaveBeenCalledWith(row._id, "provider-123");
  });

  it("records failure with backoff when the provider throws", async () => {
    CONFIG.EMAIL_PROVIDER = "log";
    const row = baseRow();
    spyOn(emailSendRepository, "claimDue").mockResolvedValue([row]);
    spyOn(welcomeContext, "loadWelcomeSequenceUser").mockResolvedValue({
      email: "guest@example.com",
      hasConnectedCalendar: false,
      billing: undefined,
    });
    const recordFailure = spyOn(
      emailSendRepository,
      "recordFailure",
    ).mockResolvedValue(row);
    spyOn(emailClient, "buildEmailProvider").mockReturnValue({
      send: mock(async () => {
        throw new Error("Resend send failed (500): upstream");
      }),
      verifyWebhook: () => [],
    });

    await new EmailDispatchService().dispatchDue();

    expect(recordFailure).toHaveBeenCalled();
  });
});
