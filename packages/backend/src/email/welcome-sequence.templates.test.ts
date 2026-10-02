import { appendWelcomeEmailUtm } from "@backend/email/email-layout";
import {
  buildWelcomeResendTemplateVariables,
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

  it("includes USER_FIRST_NAME when first name is present", () => {
    const variables = buildWelcomeResendTemplateVariables({
      ctaUrl: "https://app.example.com",
      unsubscribeUrl: "https://api.example.com/unsub",
      firstName: "Ada",
    });
    expect(variables.USER_FIRST_NAME).toBe("Ada");
    expect(variables.CTA_URL).toBe("https://app.example.com");
  });

  it("trims USER_FIRST_NAME and omits it when empty", () => {
    expect(
      buildWelcomeResendTemplateVariables({
        ctaUrl: "https://app.example.com",
        unsubscribeUrl: "",
        firstName: "  Grace  ",
      }).USER_FIRST_NAME,
    ).toBe("Grace");

    const missing = buildWelcomeResendTemplateVariables({
      ctaUrl: "https://app.example.com",
      unsubscribeUrl: "",
    });
    expect(missing).not.toHaveProperty("USER_FIRST_NAME");

    const empty = buildWelcomeResendTemplateVariables({
      ctaUrl: "https://app.example.com",
      unsubscribeUrl: "",
      firstName: "   ",
    });
    expect(empty).not.toHaveProperty("USER_FIRST_NAME");
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
