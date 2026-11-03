import { type Request, type Response } from "express";
import type Stripe from "stripe";
import { Status } from "@core/errors/status.codes";
import { Logger } from "@core/logger/winston.logger";
import { processStripeEvent } from "@backend/billing/services/billing.webhook.service";
import {
  type StripeBillingGateway,
  stripeBillingGateway,
} from "@backend/billing/services/stripe.client";
import { CONFIG } from "@backend/common/constants/config.constants";
import { isStripeConfigured } from "@backend/common/constants/config.util";

const logger = Logger("app:billing.webhook");

export class BillingWebhookController {
  constructor(
    private readonly stripe: StripeBillingGateway = stripeBillingGateway,
  ) {}

  handleStripe = async (req: Request, res: Response) => {
    if (!isStripeConfigured(CONFIG) || !CONFIG.STRIPE_WEBHOOK_SECRET) {
      res.status(Status.NOT_FOUND).json({ error: "Stripe is not configured" });
      return;
    }

    if (!Buffer.isBuffer(req.body)) {
      logger.error(
        "Stripe webhook body was not a Buffer; signature verification cannot run",
      );
      res.status(Status.BAD_REQUEST).json({ error: "Invalid webhook payload" });
      return;
    }

    const signature = req.headers["stripe-signature"];
    if (typeof signature !== "string" || signature.length === 0) {
      res
        .status(Status.BAD_REQUEST)
        .json({ error: "Missing Stripe signature" });
      return;
    }

    let event: Stripe.Event;
    try {
      // Must be the async variant: under Bun the SDK selects
      // SubtleCryptoProvider, whose synchronous HMAC path throws
      // unconditionally, so constructEvent() rejects every signature.
      event = await this.stripe.constructWebhookEvent(
        req.body,
        signature,
        CONFIG.STRIPE_WEBHOOK_SECRET,
      );
    } catch (e) {
      logger.error("Stripe webhook signature verification failed", e);
      res
        .status(Status.BAD_REQUEST)
        .json({ error: "Invalid Stripe webhook signature" });
      return;
    }

    try {
      await processStripeEvent(event, this.stripe);
      res.status(Status.OK).json({ received: true });
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      logger.error("Stripe webhook processing failed", {
        eventId: event.id,
        eventType: event.type,
        stack: err.stack,
        cause: err,
      });
      res
        .status(Status.INTERNAL_SERVER)
        .json({ error: "Stripe webhook processing failed" });
    }
  };
}

export default new BillingWebhookController();
