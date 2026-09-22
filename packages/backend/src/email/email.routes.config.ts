import express from "express";
import rateLimit from "express-rate-limit";
import { CommonRoutesConfig } from "@backend/common/common.routes.config";
import emailUnsubscribeController from "@backend/email/controllers/email.unsubscribe.controller";
import emailWebhookController from "@backend/email/controllers/email.webhook.controller";

export const RESEND_WEBHOOK_PATH = "/api/email/webhooks/resend";

const unsubscribeLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

const resendWebhookLimiter = rateLimit({
  windowMs: 60_000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Resend HMAC is over the exact request bytes. SuperTokens and
 * `express.json()` both parse JSON and would destroy the signature, so this
 * route must be mounted before those middlewares.
 */
export function mountResendEmailWebhook(app: express.Application): void {
  app.post(
    RESEND_WEBHOOK_PATH,
    resendWebhookLimiter,
    express.raw({ type: "*/*" }),
    emailWebhookController.handleResend,
  );
}

export class EmailRoutes extends CommonRoutesConfig {
  constructor(app: express.Application) {
    super(app, "EmailRoutes");
  }

  configureRoutes(): express.Application {
    this.app
      .route("/api/email/unsubscribe")
      .get(unsubscribeLimiter, emailUnsubscribeController.showConfirmation)
      .post(
        unsubscribeLimiter,
        express.urlencoded({ extended: false }),
        emailUnsubscribeController.confirmUnsubscribe,
      );

    return this.app;
  }
}
