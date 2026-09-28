import dayjs from "@core/util/date/dayjs";
import {
  formatSignupTrialPlanPrice,
  formatTrialChargeDate,
  shouldOfferSignupTrialStep,
} from "@web/billing/signup-trial.util";
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

describe("formatTrialChargeDate", () => {
  it("formats the charge date from a pinned clock", () => {
    const pinned = dayjs("2026-01-15T12:00:00.000Z");
    expect(formatTrialChargeDate(7, pinned)).toBe("Thursday, January 22");
  });
});

describe("formatSignupTrialPlanPrice", () => {
  it("matches the settings plan price line", () => {
    expect(
      formatSignupTrialPlanPrice({
        amount: 1200,
        currency: "usd",
        interval: "month",
      }),
    ).toBe("$12.00 per month");
  });
});
