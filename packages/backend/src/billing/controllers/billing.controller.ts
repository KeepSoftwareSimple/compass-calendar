import { type Request, type Response } from "express";
import { Status } from "@core/errors/status.codes";
import { Logger } from "@core/logger/winston.logger";
import {
  type BillingCheckoutRequest,
  BillingCheckoutRequestSchema,
  type BillingCheckoutResponse,
  BillingCheckoutResponseSchema,
  type BillingStatusResponse,
  type BillingSubscriptionResponse,
  BillingSubscriptionResponseSchema,
} from "@core/types/billing.types";
import { zObjectId } from "@core/types/object-id.schema";
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

const sessionUserId = (req: Request): string =>
  zObjectId.parse(req.session?.getUserId()).toString();

const respondWithCheckoutSession = async (
  req: Request<never, BillingCheckoutResponse, BillingCheckoutRequest, never>,
  res: Response<BillingCheckoutResponse | { error: string }>,
  createSession: (
    userId: string,
    options: BillingCheckoutRequest,
  ) => Promise<BillingCheckoutResponse>,
) => {
  try {
    const body = BillingCheckoutRequestSchema.parse(req.body ?? {});
    const result = await createSession(sessionUserId(req), body);
    res.status(Status.OK).json(BillingCheckoutResponseSchema.parse(result));
  } catch (e) {
    sendBillingError(res, e);
  }
};

class BillingController {
  getStatus = async (
    req: Request<never, BillingStatusResponse, never, never>,
    res: Response<BillingStatusResponse | { error: string }>,
  ) => {
    try {
      const status = await billingService.getStatus(sessionUserId(req));
      res.status(Status.OK).json(status);
    } catch (e) {
      sendBillingError(res, e);
    }
  };

  createCheckoutSession = async (
    req: Request<never, BillingCheckoutResponse, BillingCheckoutRequest, never>,
    res: Response<BillingCheckoutResponse | { error: string }>,
  ) =>
    respondWithCheckoutSession(req, res, stripeService.createCheckoutSession);

  endTrial = async (
    req: Request<never, BillingStatusResponse, never, never>,
    res: Response<BillingStatusResponse | { error: string }>,
  ) => {
    try {
      const status = await stripeService.endTrialNow(sessionUserId(req));
      res.status(Status.OK).json(status);
    } catch (e) {
      sendBillingError(res, e);
    }
  };

  createPaymentMethodSession = async (
    req: Request<never, BillingCheckoutResponse, BillingCheckoutRequest, never>,
    res: Response<BillingCheckoutResponse | { error: string }>,
  ) =>
    respondWithCheckoutSession(
      req,
      res,
      stripeService.createPaymentMethodSession,
    );

  getSubscription = async (
    req: Request<never, BillingSubscriptionResponse, never, never>,
    res: Response<BillingSubscriptionResponse | { error: string }>,
  ) => {
    try {
      const summary = await stripeService.getSubscriptionSummary(
        sessionUserId(req),
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
  ) => this.setCancelAtPeriodEnd(req, res, true);

  resumeSubscription = async (
    req: Request<never, BillingStatusResponse, never, never>,
    res: Response<BillingStatusResponse | { error: string }>,
  ) => this.setCancelAtPeriodEnd(req, res, false);

  private setCancelAtPeriodEnd = async (
    req: Request<never, BillingStatusResponse, never, never>,
    res: Response<BillingStatusResponse | { error: string }>,
    cancel: boolean,
  ) => {
    try {
      const status = await stripeService.setCancelAtPeriodEnd(
        sessionUserId(req),
        cancel,
      );
      res.status(Status.OK).json(status);
    } catch (e) {
      sendBillingError(res, e);
    }
  };
}

export default new BillingController();
