import { type Request, type Response } from "express";
import { Status } from "@core/errors/status.codes";
import { Logger } from "@core/logger/winston.logger";
import {
  type BillingCheckoutResponse,
  BillingCheckoutResponseSchema,
  type BillingStatusResponse,
  type BillingSubscriptionResponse,
  BillingSubscriptionResponseSchema,
} from "@core/types/billing.types";
import { zObjectId } from "@core/types/type.utils";
import {
  BillingHttpError,
  logBillingHttpError,
} from "@backend/billing/billing.errors";
import billingService from "@backend/billing/services/billing.service";
import stripeService from "@backend/billing/services/stripe.service";

const logger = Logger("app:billing");

const sendBillingError = (res: Response, e: unknown) => {
  if (e instanceof BillingHttpError) {
    logBillingHttpError(logger, e);
    res.status(e.status).json({ error: e.clientMessage });
    return;
  }
  const message = e instanceof Error ? e.message : "Unexpected error";
  if (message === "User not found") {
    res.status(Status.NOT_FOUND).json({ error: "User not found" });
    return;
  }
  logger.error(message, e);
  res.status(Status.INTERNAL_SERVER).json({ error: "Internal server error" });
};

class BillingController {
  getStatus = async (
    req: Request<never, BillingStatusResponse, never, never>,
    res: Response<BillingStatusResponse | { error: string }>,
  ) => {
    try {
      const userId = zObjectId.parse(req.session?.getUserId());
      const status = await billingService.getStatus(userId.toString());
      res.status(Status.OK).json(status);
    } catch (e) {
      sendBillingError(res, e);
    }
  };

  createCheckoutSession = async (
    req: Request<never, BillingCheckoutResponse, never, never>,
    res: Response<BillingCheckoutResponse | { error: string }>,
  ) => {
    try {
      const userId = zObjectId.parse(req.session?.getUserId());
      const result = await stripeService.createCheckoutSession(
        userId.toString(),
      );
      res.status(Status.OK).json(result);
    } catch (e) {
      sendBillingError(res, e);
    }
  };

  endTrial = async (
    req: Request<never, BillingStatusResponse, never, never>,
    res: Response<BillingStatusResponse | { error: string }>,
  ) => {
    try {
      const userId = zObjectId.parse(req.session?.getUserId());
      const status = await stripeService.endTrialNow(userId.toString());
      res.status(Status.OK).json(status);
    } catch (e) {
      sendBillingError(res, e);
    }
  };

  createPaymentMethodSession = async (
    req: Request<never, BillingCheckoutResponse, never, never>,
    res: Response<BillingCheckoutResponse | { error: string }>,
  ) => {
    try {
      const userId = zObjectId.parse(req.session?.getUserId());
      const result = await stripeService.createPaymentMethodSession(
        userId.toString(),
      );
      res.status(Status.OK).json(BillingCheckoutResponseSchema.parse(result));
    } catch (e) {
      sendBillingError(res, e);
    }
  };

  getSubscription = async (
    req: Request<never, BillingSubscriptionResponse, never, never>,
    res: Response<BillingSubscriptionResponse | { error: string }>,
  ) => {
    try {
      const userId = zObjectId.parse(req.session?.getUserId());
      const summary = await stripeService.getSubscriptionSummary(
        userId.toString(),
      );
      res
        .status(Status.OK)
        .json(BillingSubscriptionResponseSchema.parse(summary));
    } catch (e) {
      sendBillingError(res, e);
    }
  };

  cancelSubscription = async (
    req: Request<never, BillingStatusResponse, never, never>,
    res: Response<BillingStatusResponse | { error: string }>,
  ) => {
    try {
      const userId = zObjectId.parse(req.session?.getUserId());
      const status = await stripeService.setCancelAtPeriodEnd(
        userId.toString(),
        true,
      );
      res.status(Status.OK).json(status);
    } catch (e) {
      sendBillingError(res, e);
    }
  };

  resumeSubscription = async (
    req: Request<never, BillingStatusResponse, never, never>,
    res: Response<BillingStatusResponse | { error: string }>,
  ) => {
    try {
      const userId = zObjectId.parse(req.session?.getUserId());
      const status = await stripeService.setCancelAtPeriodEnd(
        userId.toString(),
        false,
      );
      res.status(Status.OK).json(status);
    } catch (e) {
      sendBillingError(res, e);
    }
  };
}

export default new BillingController();
