import Stripe from "stripe";
import { Status } from "@core/errors/status.codes";
import {
  BillingHttpError,
  logBillingHttpError,
  wrapStripeFailure,
} from "@backend/billing/billing.errors";
import { describe, expect, it, mock } from "bun:test";

describe("wrapStripeFailure", () => {
  it("maps StripeConnectionError to BAD_GATEWAY when statusCode is missing", () => {
    const connectionError = new Stripe.errors.StripeConnectionError({
      message: "An error occurred with our connection to Stripe.",
    });

    expect(() => wrapStripeFailure(connectionError)).toThrow(BillingHttpError);
    expect(() => wrapStripeFailure(connectionError)).toThrow(
      expect.objectContaining({ status: Status.BAD_GATEWAY }),
    );
  });
});

describe("logBillingHttpError", () => {
  it("logs client billing errors at warn without attaching the error", () => {
    const logger = { error: mock(), warn: mock() };
    const error = new BillingHttpError(
      Status.CONFLICT,
      "No billing account yet.",
    );

    logBillingHttpError(logger, error);

    expect(logger.warn).toHaveBeenCalledWith("No billing account yet.");
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("logs server billing errors at error with cause when present", () => {
    const logger = { error: mock(), warn: mock() };
    const cause = new Error("Stripe unavailable");
    const error = new BillingHttpError(
      Status.BAD_GATEWAY,
      "Couldn't start billing. Please try again in a moment.",
      cause,
    );

    logBillingHttpError(logger, error);

    expect(logger.error).toHaveBeenCalledWith("Stripe unavailable", cause);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
