import { Logger } from "@core/logger/winston.logger";
import { emailListIncludes } from "@core/util/email.util";
import { CONFIG } from "@backend/common/constants/config.constants";
import { renderBookingHostEmail } from "@backend/email/booking-host-email.content";
import { loadBookingHostEmailDispatchContext } from "@backend/email/booking-host-email.context";
import { type BookingHostEmailKind } from "@backend/email/booking-host-email.id";
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
import { appendWelcomeEmailUtm } from "@backend/email/email-layout";
import { type EmailSendRecord } from "@backend/email/email-send.record";
import { emailSendRepository } from "@backend/email/email-send.repository";
import {
  buildUnsubscribeTokenForUser,
  buildUnsubscribeUrls,
  type EmailUnsubscribeScope,
  isBookingHostEmailStopped,
  isEmailSequenceStopped,
} from "@backend/email/email-unsubscribe";
import { buildEmailProvider } from "@backend/email/providers/email.client";
import {
  type EmailProvider,
  type EmailSendInput,
} from "@backend/email/providers/email.port";
import { findWelcomeStep } from "@backend/email/welcome-sequence";
import { loadWelcomeSequenceUser } from "@backend/email/welcome-sequence.context";
import { isWelcomeEmailEnabled } from "@backend/email/welcome-sequence.enrollment";
import {
  deferPreviewLoopDailyCap,
  ensurePreviewLoopEnrollments,
  handlePreviewLoopAfterSend,
  isPreviewLoopOverDailyCap,
  isPreviewLoopRow,
  welcomeUserForSkipIf,
} from "@backend/email/welcome-sequence.preview-loop";
import {
  buildWelcomeResendTemplateVariables,
  getWelcomeStepCtaBaseHref,
  getWelcomeStepTemplateAlias,
} from "@backend/email/welcome-sequence.templates";
import { isSyntheticAccount } from "@backend/user/synthetic-account.service";

const logger = Logger("app:email.dispatch");

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const isAllowlistedRecipient = (email: string): boolean => {
  const allowlist = CONFIG.EMAIL_ALLOWLIST;
  return allowlist.length === 0 || emailListIncludes(allowlist, email);
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * The unsubscribe links for a recipient and the headers that carry them.
 * Both are absent when the signing secret is unset: a send without a token
 * goes out with no unsubscribe affordance rather than a broken one.
 */
const resolveUnsubscribe = (
  userIdHex: string,
  scope?: EmailUnsubscribeScope,
): {
  readonly unsubscribe: ReturnType<typeof buildUnsubscribeUrls> | undefined;
  readonly headers: Record<string, string>;
} => {
  const token = buildUnsubscribeTokenForUser(userIdHex);
  if (token === null) {
    return { unsubscribe: undefined, headers: {} };
  }
  const unsubscribe = buildUnsubscribeUrls(token, scope);
  return {
    unsubscribe,
    headers: {
      "List-Unsubscribe": unsubscribe.listUnsubscribeHeader,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
};

const isInvalidRecipientError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }
  // Only request-validation statuses mean the address itself is bad. A 401 or
  // 403 ("API key is invalid") is our misconfiguration and must retry toward
  // `failed`, or a revoked key silently skips every email.
  const message = error.message;
  return (
    /\(\s*(400|422)\s*\)/.test(message) &&
    /invalid|recipient|bounce|undeliverable/i.test(message)
  );
};

/** The per-row facts every dispatch path reports on: ids, log prefix, analytics. */
type DispatchRowContext = {
  readonly row: EmailSendRecord;
  readonly userIdHex: string;
  readonly label: string;
  readonly analyticsBase?: Record<string, boolean | number | string>;
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
      if (row.sequence === "booking-host") {
        await this.#dispatchBookingHostRow(row);
      } else {
        await this.#dispatchWelcomeRow(row);
      }
      await sleep(EMAIL_SEND_PROVIDER_SPACING_MS);
    }

    await ensurePreviewLoopEnrollments(now);
  };

  #runCycle = (): void => {
    if (this.#pendingCycle) {
      return;
    }
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

  async #skipRow(context: DispatchRowContext, reason: string): Promise<void> {
    const { row, userIdHex, label, analyticsBase } = context;
    await emailSendRepository.markSkipped(row._id, reason);
    void emailAnalytics.capture({
      event: "email_skipped",
      userId: userIdHex,
      step: row.stepKey,
      properties: analyticsBase,
    });
    logger.info(`${label} skipped`, {
      rowId: row._id,
      stepKey: row.stepKey,
      reason,
    });
  }

  // The tail every sequence shares: re-check the stop signal and the row's
  // claim inside the try so an unsubscribe or a competing worker that lands
  // mid-dispatch cancels the row instead of double-sending, then send and
  // either record the send or back off toward `failed`.
  async #deliverRow(
    context: DispatchRowContext,
    delivery: {
      readonly stillSendable: () => Promise<boolean>;
      readonly send: EmailSendInput;
      readonly afterSent?: () => Promise<void>;
    },
  ): Promise<void> {
    const { row, userIdHex, label, analyticsBase } = context;

    try {
      if (!(await delivery.stillSendable())) {
        await emailSendRepository.markCanceled(row._id);
        return;
      }
      if (!(await emailSendRepository.isQueued(row._id))) {
        return;
      }

      const result = await this.getProvider().send(delivery.send);
      const marked = await emailSendRepository.markSent(
        row._id,
        result.messageId,
      );
      if (!marked) {
        return;
      }
      void emailAnalytics.capture({
        event: "email_sent",
        userId: userIdHex,
        step: row.stepKey,
        properties: analyticsBase,
      });
      logger.info(`${label} sent`, {
        rowId: row._id,
        stepKey: row.stepKey,
      });
      await delivery.afterSent?.();
    } catch (error) {
      const message = errorMessage(error);
      if (isInvalidRecipientError(error)) {
        await this.#skipRow(context, message);
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
          properties: analyticsBase,
        });
      }
      logger.warn(`${label} send failed`, {
        rowId: row._id,
        stepKey: row.stepKey,
        message,
      });
    }
  }

  async #dispatchBookingHostRow(row: EmailSendRecord): Promise<void> {
    const userIdHex = row.userId.toHexString();
    const kind = row.stepKey as BookingHostEmailKind;
    const context: DispatchRowContext = {
      row,
      userIdHex,
      label: "Booking host email",
      analyticsBase: {
        sequence: "booking-host",
        kind,
        reservation_id: row.reservationId?.toHexString() ?? "",
      },
    };
    const skip = (reason: string) => this.#skipRow(context, reason);

    const reservationId = row.reservationId;
    if (!reservationId) {
      await skip("Missing reservation");
      return;
    }

    const booking = await loadBookingHostEmailDispatchContext({
      userId: row.userId,
      reservationId,
    });
    if (!booking) {
      await skip("Missing booking context");
      return;
    }

    if (isSyntheticAccount(booking.user.email, booking.user.isSynthetic)) {
      await skip("Synthetic account");
      return;
    }

    if (isBookingHostEmailStopped(booking.user.emailPreferences)) {
      await emailSendRepository.markCanceled(row._id);
      return;
    }

    if (!isAllowlistedRecipient(booking.user.email)) {
      await skip("Recipient not allowlisted");
      return;
    }

    const reservation = booking.reservation;

    const { unsubscribe, headers } = resolveUnsubscribe(
      userIdHex,
      "booking-host",
    );

    const rendered = renderBookingHostEmail({
      kind,
      guestName: reservation.guestName,
      guestEmail: reservation.guestEmail,
      notes: reservation.notes,
      durationMinutes: booking.durationMinutes,
      pageTimeZone: booking.page.timeZone,
      guestTimeZone: reservation.guestTimeZone,
      slotStart: reservation.slotStart,
      slotEnd: reservation.slotEnd,
      previousSlotStart: reservation.previousSlotStart,
      conference: booking.conference,
      openInCompassUrl: booking.openInCompassUrl,
      unsubscribe,
    });

    await this.#deliverRow(context, {
      stillSendable: async () => {
        const fresh = await loadBookingHostEmailDispatchContext({
          userId: row.userId,
          reservationId,
        });
        return (
          !!fresh && !isBookingHostEmailStopped(fresh.user.emailPreferences)
        );
      },
      send: {
        idempotencyKey: row._id,
        to: booking.user.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        headers,
      },
    });
  }

  async #dispatchWelcomeRow(row: EmailSendRecord): Promise<void> {
    const userIdHex = row.userId.toHexString();
    const previewLoop = isPreviewLoopRow(row);
    const context: DispatchRowContext = {
      row,
      userIdHex,
      label: "Welcome email",
      analyticsBase: previewLoop ? { preview_loop: true } : undefined,
    };
    const skip = (reason: string) => this.#skipRow(context, reason);

    const step = findWelcomeStep(row.stepKey);
    if (!step) {
      await skip("Unknown welcome step");
      return;
    }

    const now = new Date();
    const user = await loadWelcomeSequenceUser(row.userId);
    if (!user) {
      await skip("User not found");
      return;
    }

    if (isSyntheticAccount(user.email, user.isSynthetic)) {
      await skip("Synthetic account");
      return;
    }

    if (step.skipIf?.(welcomeUserForSkipIf(user, previewLoop))) {
      await skip("Step skipped by skipIf");
      return;
    }

    if (previewLoop && row.recipientEmail) {
      const capped = await isPreviewLoopOverDailyCap(row.recipientEmail, now);
      if (capped) {
        await deferPreviewLoopDailyCap(row, now);
        logger.info("Welcome email preview loop daily cap reached", {
          rowId: row._id,
          stepKey: row.stepKey,
        });
        return;
      }
    }

    if (isEmailSequenceStopped(user.emailPreferences)) {
      await emailSendRepository.markCanceled(row._id);
      return;
    }

    if (!isAllowlistedRecipient(user.email)) {
      await skip("Recipient not allowlisted");
      return;
    }

    const templateAlias = getWelcomeStepTemplateAlias(row.stepKey);
    const ctaBaseHref = getWelcomeStepCtaBaseHref(row.stepKey);
    if (!templateAlias || !ctaBaseHref) {
      await skip("Missing email template");
      return;
    }

    const { unsubscribe, headers } = resolveUnsubscribe(userIdHex);

    const ctaUrl = appendWelcomeEmailUtm(ctaBaseHref, row.stepKey);
    const templateVariables = buildWelcomeResendTemplateVariables({
      ctaUrl,
      unsubscribeUrl: unsubscribe?.httpsUrl ?? "",
      firstName: user.firstName,
    });

    await this.#deliverRow(context, {
      stillSendable: async () => {
        const fresh = await loadWelcomeSequenceUser(row.userId);
        return !!fresh && !isEmailSequenceStopped(fresh.emailPreferences);
      },
      send: {
        idempotencyKey: row._id,
        to: user.email,
        template: {
          id: templateAlias,
          variables: templateVariables,
        },
        headers,
      },
      ...(previewLoop
        ? { afterSent: () => handlePreviewLoopAfterSend(row, now) }
        : {}),
    });
  }
}

const emailDispatchService = new EmailDispatchService();
export default emailDispatchService;
