import {
  type WelcomeStepKey,
  welcomeStepValue,
} from "@backend/email/welcome-sequence";
import { getWelcomeEmailContent } from "@backend/email/welcome-sequence.content";

/** Resend published template alias per welcome drip step. */
export const WELCOME_STEP_TEMPLATE_ALIAS: Record<
  WelcomeStepKey,
  string | null
> = {
  "cmd-k": "04-cmdk",
  "shortcut-list": "14-",
  "jump-around": "24-jump-around",
  "adjusting-times": "34-adjusting-times",
  roundup: "44-roundup",
  // Personalized reviews are rendered from calendar data, not a hosted template.
  "weekly-review": null,
  "trial-ending": "compass-trial-ending",
};

export function getWelcomeStepTemplateAlias(
  stepKey: string,
): string | undefined {
  return welcomeStepValue(WELCOME_STEP_TEMPLATE_ALIAS, stepKey) ?? undefined;
}

export function buildWelcomeResendTemplateVariables(input: {
  ctaUrl: string;
  unsubscribeUrl: string;
  firstName?: string;
}): Record<string, string> {
  const variables: Record<string, string> = {
    CTA_URL: input.ctaUrl,
    CTA_LABEL: ctaLabelFromUrl(input.ctaUrl),
    UNSUBSCRIBE_URL: input.unsubscribeUrl,
  };
  const trimmedFirstName = input.firstName?.trim();
  if (trimmedFirstName) {
    variables["USER_FIRST_NAME"] = trimmedFirstName;
  }
  return variables;
}

/** Base CTA href before UTM params. Same destinations as the preview content. */
export function getWelcomeStepCtaBaseHref(stepKey: string): string | undefined {
  return getWelcomeEmailContent(stepKey)?.cta.href;
}

/** Visible CTA link text: the bare host (utm params stay in CTA_URL only). */
export function ctaLabelFromUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "compasscalendar.com";
  }
}
