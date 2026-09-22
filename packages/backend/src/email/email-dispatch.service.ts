import { Logger } from "@core/logger/winston.logger";
import { normalizeEmail } from "@core/util/email.util";
import { CONFIG } from "@backend/common/constants/config.constants";
import { emailAnalytics } from "@backend/email/email.analytics";
import {
  EMAIL_SEND_BATCH_SIZE,
  EMAIL_SEND_CLAIM_LEASE_MS,
  EMAIL_SEND_POLL_INTERVAL_MS,
  EMAIL_SEND_PROVIDER_SPACING_MS,
  emailSendBackoffMs,
} from "@backend/email/email.constants";
import {
  startEmailSendHeartbeat,
  stopEmailSendHeartbeat,
} from "@backend/email/email.heartbeat";
import { renderWelcomeEmail } from "@backend/email/email-layout";
import { type EmailSendRecord } from "@backend/email/email-send.record";
import { emailSendRepository } from "@backend/email/email-send.repository";
import {
  buildUnsubscribeTokenForUser,
  buildUnsubscribeUrls,
  isEmailSequenceStopped,
} from "@backend/email/email-unsubscribe";
import { buildEmailProvider } from "@backend/email/providers/email.client";
import { type EmailProvider } from "@backend/email/providers/email.port";
import { findWelcomeStep } from "@backend/email/welcome-sequence";
import { getWelcomeEmailContent } from "@backend/email/welcome-sequence.content";
import { loadWelcomeSequenceUser } from "@backend/email/welcome-sequence.context";
import { isWelcomeEmailEnabled } from "@backend/email/welcome-sequence.enrollment";

const logger = Logger("app:email.dispatch");

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const isAllowlistedRecipient = (email: string): boolean => {
  const allowlist = CONFIG.EMAIL_ALLOWLIST;
  if (allowlist.length === 0) {
    return true;
  }
  const normalized = normalizeEmail(email);
  return allowlist.some((entry) => normalizeEmail(entry) === normalized);
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const isInvalidRecipientError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message;
  return (
    /\(\s*4\d\d\s*\)/.test(message) &&
    /invalid|recipient|bounce|undeliverable/i.test(message)
  );
};

export class EmailDispatchService {
  #pollTimer: ReturnType<typeof setInterval> | undefined;
  #pendingCycle: Promise<void> | undefined;
  #provider: EmailProvider | undefined;

  private getProvider(): EmailProvider {
    if (!this.#provider) {
      this.#provider = buildEmailProvider(CONFIG);
    }
    return this.#provider;
  }

  startPolling = (): void => {
    if (!isWelcomeEmailEnabled() || this.#pollTimer) {
      return;
    }
    startEmailSendHeartbeat();
    this.#runCycle();
    this.#pollTimer = setInterval(() => {
      this.#runCycle();
    }, EMAIL_SEND_POLL_INTERVAL_MS);
  };

  stopPolling = async (): Promise<void> => {
    stopEmailSendHeartbeat();
    if (this.#pollTimer) {
      clearInterval(this.#pollTimer);
      this.#pollTimer = undefined;
    }
    await this.#pendingCycle;
  };

  dispatchDue = async (): Promise<void> => {
    if (!isWelcomeEmailEnabled()) {
      return;
    }

    const now = new Date();
    const claimed = await emailSendRepository.claimDue(
      now,
      EMAIL_SEND_BATCH_SIZE,
      EMAIL_SEND_CLAIM_LEASE_MS,
    );

    for (const row of claimed) {
      await this.#dispatchRow(row);
      await sleep(EMAIL_SEND_PROVIDER_SPACING_MS);
    }
  };

  #runCycle = (): void => {
    const cycle = this.dispatchDue().catch((error: unknown) => {
      logger.error(
        "Welcome email dispatch cycle failed",
        error instanceof Error
          ? { message: error.message }
          : { error: String(error) },
      );
    });
    this.#pendingCycle = cycle;
    void cycle.finally(() => {
      if (this.#pendingCycle === cycle) {
        this.#pendingCycle = undefined;
      }
    });
  };

  async #dispatchRow(row: EmailSendRecord): Promise<void> {
    const userIdHex = row.userId.toHexString();
    const skip = async (reason: string) => {
      await emailSendRepository.markSkipped(row._id, reason);
      void emailAnalytics.capture({
        event: "email_skipped",
        userId: userIdHex,
        step: row.stepKey,
      });
      logger.info("Welcome email skipped", {
        rowId: row._id,
        stepKey: row.stepKey,
      });
    };

    const step = findWelcomeStep(row.stepKey);
    if (!step) {
      await skip("Unknown welcome step");
      return;
    }

    const user = await loadWelcomeSequenceUser(row.userId);
    if (!user) {
      await skip("User not found");
      return;
    }

    if (step.skipIf?.(user)) {
      await skip("Step skipped by skipIf");
      return;
    }

    if (isEmailSequenceStopped(user.emailPreferences)) {
      await emailSendRepository.markCanceled(row._id);
      return;
    }

    if (!isAllowlistedRecipient(user.email)) {
      await skip("Recipient not allowlisted");
      return;
    }

    const content = getWelcomeEmailContent(row.stepKey);
    if (!content) {
      await skip("Missing email content");
      return;
    }

    const unsubscribeToken = buildUnsubscribeTokenForUser(userIdHex);
    const unsubscribe =
      unsubscribeToken !== null
        ? buildUnsubscribeUrls(unsubscribeToken)
        : undefined;
    const rendered = renderWelcomeEmail(
      row.stepKey,
      content,
      unsubscribe
        ? {
            httpsUrl: unsubscribe.httpsUrl,
            listUnsubscribeHeader: unsubscribe.listUnsubscribeHeader,
          }
        : undefined,
    );

    const headers: Record<string, string> = {};
    if (unsubscribe) {
      headers["List-Unsubscribe"] = unsubscribe.listUnsubscribeHeader;
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    }

    try {
      const result = await this.getProvider().send({
        idempotencyKey: row._id,
        to: user.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        headers,
      });
      await emailSendRepository.markSent(row._id, result.messageId);
      void emailAnalytics.capture({
        event: "email_sent",
        userId: userIdHex,
        step: row.stepKey,
      });
      logger.info("Welcome email sent", {
        rowId: row._id,
        stepKey: row.stepKey,
      });
    } catch (error) {
      const message = errorMessage(error);
      if (isInvalidRecipientError(error)) {
        await skip(message);
        return;
      }

      const nextAttemptAt = new Date(
        Date.now() + emailSendBackoffMs(row.attemptCount + 1),
      );
      const updated = await emailSendRepository.recordFailure(
        row._id,
        message,
        nextAttemptAt,
      );
      if (updated?.status === "failed") {
        void emailAnalytics.capture({
          event: "email_failed",
          userId: userIdHex,
          step: row.stepKey,
        });
      }
      logger.warn("Welcome email send failed", {
        rowId: row._id,
        stepKey: row.stepKey,
        message,
      });
    }
  }
}

const emailDispatchService = new EmailDispatchService();
export default emailDispatchService;
