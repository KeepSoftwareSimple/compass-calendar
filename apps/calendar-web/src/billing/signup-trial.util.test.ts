import { BILLING_PLAN } from "@core/constants/billing.constants";
import dayjs from "@core/util/date/dayjs";
import { shouldOfferSignupTrialStep } from "@web/billing/billing.query";
import {
  formatSignupTrialTitle,
  formatTrialAskChargeLine,
  formatTrialChargeDate,
} from "@web/billing/signup-trial-format.util";
import { formatTrialStartPriceLine } from "@web/billing/trial-start-display.util";
import { describe, expect, it } from "bun:test";

describe("shouldOfferSignupTrialStep", () => {
  it("is true when billing is configured and enforced", () => {
    expect(
      shouldOfferSignupTrialStep({
        version: "test",
        providers: {
          google: { signIn: false, connect: false },
          microsoft: { signIn: false, connect: false },
          apple: { signIn: false, connect: false },
        },
        sync: { cloudMutationMode: "enabled", execution: "passive" },
        billing: {
          isConfigured: true,
          enforcement: true,
          trialLengthDays: 7,
          publishableKey: "pk_test",
        },
      }),
    ).toBe(true);
  });

  it("is false for self-host or paused enforcement", () => {
    expect(
      shouldOfferSignupTrialStep({
        version: "test",
        providers: {
          google: { signIn: false, connect: false },
          microsoft: { signIn: false, connect: false },
          apple: { signIn: false, connect: false },
        },
        sync: { cloudMutationMode: "enabled", execution: "passive" },
        billing: {
          isConfigured: false,
          enforcement: false,
          trialLengthDays: 7,
          publishableKey: null,
        },
      }),
    ).toBe(false);
  });
});

describe("formatSignupTrialTitle", () => {
  it("uses trial length from config", () => {
    expect(formatSignupTrialTitle(7)).toBe("Start your 7-day free trial");
  });
});

describe("formatTrialChargeDate", () => {
  it("formats the charge date from a pinned clock", () => {
    const pinned = dayjs("2026-01-15T12:00:00.000Z");
    expect(formatTrialChargeDate(7, pinned)).toBe("Thursday, January 22");
  });
});

describe("formatTrialAskChargeLine", () => {
  it("builds the trial ask charge copy from trial length", () => {
    const pinned = dayjs("2026-01-15T12:00:00.000Z");
    expect(formatTrialAskChargeLine(7, pinned)).toBe(
      "No charge until Thursday, January 22. Cancel anytime.",
    );
  });
});

describe("formatTrialStartPriceLine", () => {
  it("matches the trial ask copy", () => {
    expect(formatTrialStartPriceLine(BILLING_PLAN.DISPLAY_PRICE, 7)).toBe(
      "$7.99/mo after 7 days. Cancel anytime in Settings.",
    );
  });
});
