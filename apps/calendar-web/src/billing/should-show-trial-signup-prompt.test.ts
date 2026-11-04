import { type BillingSubscriptionStatus } from "@core/types/user.types";
import { shouldShowTrialSignupPrompt } from "@web/billing/should-show-trial-signup-prompt";
import { type AppAccess } from "@web/billing/useAppAccess";
import { describe, expect, it } from "bun:test";

const open: AppAccess = { kind: "open" };

const server = (
  status: BillingSubscriptionStatus,
  isReadOnly = false,
): AppAccess => ({
  kind: "server",
  status,
  isReadOnly,
  trialEndsAt: null,
});

describe("shouldShowTrialSignupPrompt", () => {
  it("shows trial prompts for anonymous visitors", () => {
    expect(shouldShowTrialSignupPrompt(open, false)).toBe(true);
  });

  it("hides trial prompts for paying subscribers", () => {
    expect(shouldShowTrialSignupPrompt(server("active"), true)).toBe(false);
  });

  it("hides trial prompts for trialing subscribers", () => {
    expect(shouldShowTrialSignupPrompt(server("trialing"), true)).toBe(false);
  });

  it("hides trial prompts while billing status is still loading", () => {
    expect(shouldShowTrialSignupPrompt(open, true)).toBe(false);
  });

  it("shows trial prompts for signed-in users awaiting checkout", () => {
    expect(
      shouldShowTrialSignupPrompt(server("awaiting_checkout", true), true),
    ).toBe(true);
  });

  it("shows trial prompts for signed-in users with no subscription row", () => {
    expect(shouldShowTrialSignupPrompt(server("none"), true)).toBe(true);
  });

  it("does not offer trial signup after cancel or expiry", () => {
    expect(shouldShowTrialSignupPrompt(server("canceled", true), true)).toBe(
      false,
    );
    expect(shouldShowTrialSignupPrompt(server("expired", true), true)).toBe(
      false,
    );
  });
});
