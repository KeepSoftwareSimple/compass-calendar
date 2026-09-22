import { type Request, type Response } from "express";
import { Status } from "@core/errors/status.codes";
import { Logger } from "@core/logger/winston.logger";
import { CONFIG } from "@backend/common/constants/config.constants";
import { buildEmailProvider } from "@backend/email/providers/email.client";
import { processEmailWebhookEvent } from "@backend/email/services/email.webhook.service";
import { isWelcomeEmailEnabled } from "@backend/email/welcome-sequence.enrollment";

const logger = Logger("app:email.webhook");

function headerValue(
  headers: Request["headers"],
  name: string,
): string | undefined {
  const raw = headers[name];
  if (raw === undefined) {
    return undefined;
  }
  return Array.isArray(raw) ? raw[0] : raw;
}

export class EmailWebhookController {
  handleResend = async (req: Request, res: Response): Promise<void> => {
    if (!isWelcomeEmailEnabled()) {
      res.status(Status.NOT_FOUND).json({ error: "Email is not configured" });
      return;
    }

    if (!Buffer.isBuffer(req.body)) {
      logger.error(
        "Resend webhook body was not a Buffer; signature verification cannot run",
      );
      res.status(Status.BAD_REQUEST).json({ error: "Invalid webhook payload" });
      return;
    }

    try {
      const events = buildEmailProvider(CONFIG).verifyWebhook(
        req.body,
        req.headers,
      );
      const eventId = headerValue(req.headers, "svix-id") ?? "";
      for (const event of events) {
        const id = eventId || `${event.type}:${JSON.stringify(event.data)}`;
        await processEmailWebhookEvent(event, id);
      }
      res.status(Status.OK).json({ received: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Webhook error";
      logger.error(message, error);
      res.status(Status.BAD_REQUEST).json({ error: message });
    }
  };
}

export default new EmailWebhookController();
