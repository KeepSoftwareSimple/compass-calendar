import { appendWelcomeEmailUtm } from "@backend/email/email-layout";
import { WELCOME_SEQUENCE } from "@backend/email/welcome-sequence";
import {
  buildWelcomeResendTemplateVariables,
  getWelcomeStepCtaBaseHref,
  getWelcomeStepTemplateAlias,
  WELCOME_STEP_TEMPLATE_ALIAS,
} from "@backend/email/welcome-sequence.templates";
import { describe, expect, it } from "bun:test";

describe("welcome sequence Resend templates", () => {
  it("maps hosted steps to aliases and uses inline rendering for the review", () => {
    // Driven off WELCOME_SEQUENCE, not a copy of it: a step added to the drip
    // without an alias or content has to fail here, not in production.
    expect(WELCOME_SEQUENCE.length).toBeGreaterThan(0);
    expect(getWelcomeStepTemplateAlias("weekly-review")).toBeUndefined();
    for (const step of WELCOME_SEQUENCE) {
      expect(getWelcomeStepTemplateAlias(step.key)).toBe(
        WELCOME_STEP_TEMPLATE_ALIAS[step.key] ?? undefined,
      );
      expect(getWelcomeStepCtaBaseHref(step.key)).toBeTruthy();
    }
  });

  it("returns nothing for a step key that is no longer in the drip", () => {
    expect(getWelcomeStepTemplateAlias("retired-step")).toBeUndefined();
    expect(getWelcomeStepCtaBaseHref("retired-step")).toBeUndefined();
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
    const base = getWelcomeStepCtaBaseHref("trial-ending");
    expect(base).toBeTruthy();
    const ctaUrl = appendWelcomeEmailUtm(base!, "trial-ending");
    expect(ctaUrl).toContain("utm_source=email");
    expect(ctaUrl).toContain("utm_campaign=welcome");
    expect(ctaUrl).toContain("utm_content=trial-ending");
    expect(ctaUrl).toContain("settings=billing");
  });

  it("sets CTA_LABEL to the bare host while CTA_URL keeps utm params", () => {
    const url =
      "https://staging.compasscalendar.com/?utm_source=email&utm_campaign=welcome&utm_content=cmd-k";
    const variables = buildWelcomeResendTemplateVariables({
      ctaUrl: url,
      unsubscribeUrl: "",
    });
    expect(variables.CTA_URL).toBe(url);
    expect(variables.CTA_LABEL).toBe("staging.compasscalendar.com");
  });
});
