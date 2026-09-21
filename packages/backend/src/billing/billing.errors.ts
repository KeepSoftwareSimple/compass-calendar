import Stripe from "stripe";
import { Status } from "@core/errors/status.codes";

export class BillingHttpError extends Error {
  readonly status: number;
  readonly clientMessage: string;

  constructor(status: number, clientMessage: string, cause?: unknown) {
    const detail = cause instanceof Error ? cause.message : clientMessage;
    super(detail);
    this.name = "BillingHttpError";
    this.status = status;
    this.clientMessage = clientMessage;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

const BILLING_CLIENT_MESSAGE =
  "Couldn't start billing. Please try again in a moment.";

type BillingLogger = {
  error: (message: string, meta?: unknown) => void;
  warn: (message: string, meta?: unknown) => void;
};

/** Expected billing HTTP outcomes (4xx) stay at warn so PostHog exception
 * autocapture (error-level only) does not open Discord alerts. */
export function logBillingHttpError(
  logger: BillingLogger,
  error: BillingHttpError,
): void {
  if (error.status >= Status.INTERNAL_SERVER) {
    logger.error(error.message, error.cause ?? error);
    return;
  }
  logger.warn(error.message);
}

export function wrapStripeFailure(e: unknown): never {
  if (e instanceof Stripe.errors.StripeError) {
    const stripeStatus = e.statusCode ?? 0;
    const status =
      stripeStatus === 429 || stripeStatus >= 500
        ? Status.BAD_GATEWAY
        : Status.BAD_REQUEST;
    throw new BillingHttpError(status, BILLING_CLIENT_MESSAGE, e);
  }
  throw e;
}
