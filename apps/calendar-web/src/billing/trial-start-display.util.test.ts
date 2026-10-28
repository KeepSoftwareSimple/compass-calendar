import { BILLING_PLAN } from "@core/constants/billing.constants";
import dayjs from "@core/util/date/dayjs";
import {
  formatTrialAskSubline,
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

describe("formatTrialAskSubline", () => {
  const pinned = dayjs("2026-01-15T12:00:00.000Z");

  it("includes catalog price and charge date", () => {
    expect(
      formatTrialAskSubline(
        { amount: 799, currency: "usd", interval: "month" },
        7,
        pinned,
      ),
    ).toBe(
      "$7.99/mo after. No charge until Thursday, January 22. Cancel anytime.",
    );
  });

  it("uses the plan fallback when subscription price is missing", () => {
    expect(
      formatTrialAskSubline(resolveBillingDisplayPrice(null), 7, pinned),
    ).toBe(
      "$7.99/mo after. No charge until Thursday, January 22. Cancel anytime.",
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
