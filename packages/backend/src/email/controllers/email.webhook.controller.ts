import { type Request, type Response } from "express";
import { Status } from "@core/errors/status.codes";
import { Logger } from "@core/logger/winston.logger";
import { CONFIG } from "@backend/common/constants/config.constants";
import { readHttpHeader } from "@backend/email/http-header.util";
import { buildEmailProvider } from "@backend/email/providers/email.client";
import { type EmailWebhookEvent } from "@backend/email/providers/email.port";
import { processEmailWebhookEvent } from "@backend/email/services/email.webhook.service";
import { isWelcomeEmailEnabled } from "@backend/email/welcome-sequence.enrollment";

const logger = Logger("app:email.webhook");

export class EmailWebhookController {
  handleResend = async (req: Request, res: Response): Promise<void> => {
    if (!isWelcomeEmailEnabled()) {
      res.status(Status.NOT_FOUND).json({ error: "Email is not configured" });
      return;
    }

    // Unsigned or forged requests are client errors anyone can send, so they
    // log at warn. Only `error` reaches PostHog error tracking.
    if (!Buffer.isBuffer(req.body)) {
      logger.warn(
        "Resend webhook body was not a Buffer; signature verification cannot run",
      );
      res.status(Status.BAD_REQUEST).json({ error: "Invalid webhook payload" });
      return;
    }

    let events: EmailWebhookEvent[];
    try {
      events = buildEmailProvider(CONFIG).verifyWebhook(req.body, req.headers);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Webhook error";
      logger.warn(`Resend webhook rejected: ${message}`);
      res.status(Status.BAD_REQUEST).json({ error: message });
      return;
    }

    try {
      const eventId = readHttpHeader(req.headers, "svix-id") ?? "";
      for (const event of events) {
        const id = eventId || `${event.type}:${JSON.stringify(event.data)}`;
        await processEmailWebhookEvent(event, id);
      }
      res.status(Status.OK).json({ received: true });
    } catch (error) {
      logger.error("Resend webhook processing failed", error);
      res
        .status(Status.INTERNAL_SERVER)
        .json({ error: "Webhook processing failed" });
    }
  };
}

export default new EmailWebhookController();
