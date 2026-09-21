import { Status } from "@core/errors/status.codes";
import {
  BillingHttpError,
  logBillingHttpError,
} from "@backend/billing/billing.errors";
import { describe, expect, it, mock } from "bun:test";

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
