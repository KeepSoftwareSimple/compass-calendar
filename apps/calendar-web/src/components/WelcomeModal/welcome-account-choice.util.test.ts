import { BILLING_PLAN } from "@core/constants/billing.constants";
import {
  welcomeTrialCardTermsLine,
  welcomeTrialPrimaryProvider,
} from "./welcome-account-choice.util";
import { describe, expect, it } from "bun:test";

describe("welcome-account-choice.util", () => {
  it("prefers Google for the trial primary when sign-in providers include it", () => {
    expect(welcomeTrialPrimaryProvider(["microsoft", "google"])).toBe("google");
    expect(welcomeTrialPrimaryProvider(["google"])).toBe("google");
    expect(welcomeTrialPrimaryProvider(["microsoft"])).toBe("microsoft");
    expect(welcomeTrialPrimaryProvider([])).toBeNull();
  });

  it("uses billing trial length and card requirement in the terms line", () => {
    expect(welcomeTrialCardTermsLine()).toBe(
      `${BILLING_PLAN.TRIAL_LENGTH_DAYS}-day free trial. Card required.`,
    );
  });
});
