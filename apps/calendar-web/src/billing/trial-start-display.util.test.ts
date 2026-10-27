import { BILLING_PLAN } from "@core/constants/billing.constants";
import {
  formatTrialStartPriceLine,
  resolveBillingDisplayPrice,
} from "@web/billing/trial-start-display.util";
import { describe, expect, it } from "bun:test";

describe("resolveBillingDisplayPrice", () => {
  it("falls back to the plan constant when subscription price is missing", () => {
    expect(resolveBillingDisplayPrice(null)).toEqual(
      BILLING_PLAN.DISPLAY_PRICE,
    );
  });
});

describe("formatTrialStartPriceLine", () => {
  it("uses short interval copy for the trial ask", () => {
    expect(formatTrialStartPriceLine(BILLING_PLAN.DISPLAY_PRICE, 7)).toBe(
      "$7.99/mo after 7 days. Cancel anytime in Settings.",
    );
  });

  it("drops the Settings hint when already in Settings", () => {
    expect(
      formatTrialStartPriceLine(BILLING_PLAN.DISPLAY_PRICE, 7, "settings"),
    ).toBe("$7.99/mo after 7 days. Cancel anytime.");
  });
});
