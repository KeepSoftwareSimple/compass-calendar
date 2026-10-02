import { appendWelcomeEmailUtm } from "@backend/email/email-layout";
import {
  getWelcomeStepCtaBaseHref,
  getWelcomeStepTemplateAlias,
  WELCOME_STEP_TEMPLATE_ALIAS,
} from "@backend/email/welcome-sequence.templates";
import { describe, expect, it } from "bun:test";

describe("welcome sequence Resend templates", () => {
  it("maps every welcome step to a template alias", () => {
    const stepKeys = [
      "welcome",
      "shortcuts",
      "connect-calendar",
      "booking",
      "trial-ending",
    ] as const;
    for (const stepKey of stepKeys) {
      expect(getWelcomeStepTemplateAlias(stepKey)).toBe(
        WELCOME_STEP_TEMPLATE_ALIAS[stepKey],
      );
      expect(getWelcomeStepCtaBaseHref(stepKey)).toBeTruthy();
    }
  });

  it("tags CTA URLs with welcome drip utm params", () => {
    const base = getWelcomeStepCtaBaseHref("connect-calendar");
    expect(base).toBeTruthy();
    const ctaUrl = appendWelcomeEmailUtm(base!, "connect-calendar");
    expect(ctaUrl).toContain("utm_source=email");
    expect(ctaUrl).toContain("utm_campaign=welcome");
    expect(ctaUrl).toContain("utm_content=connect-calendar");
    expect(ctaUrl).toContain("settings=accounts");
  });
});
