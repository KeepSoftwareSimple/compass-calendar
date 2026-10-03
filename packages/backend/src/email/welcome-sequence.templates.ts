import {
  isWelcomeStepKey,
  type WelcomeStepKey,
} from "@backend/email/welcome-sequence";
import { getWelcomeEmailContent } from "@backend/email/welcome-sequence.content";

/** Resend published template alias per welcome drip step. */
export const WELCOME_STEP_TEMPLATE_ALIAS: Record<WelcomeStepKey, string> = {
  welcome: "compass-welcome",
  shortcuts: "compass-shortcuts",
  "connect-calendar": "compass-connect-calendar",
  booking: "compass-booking",
  "trial-ending": "compass-trial-ending",
};

export function getWelcomeStepTemplateAlias(
  stepKey: string,
): string | undefined {
  return isWelcomeStepKey(stepKey)
    ? WELCOME_STEP_TEMPLATE_ALIAS[stepKey]
    : undefined;
}

export function buildWelcomeResendTemplateVariables(input: {
  ctaUrl: string;
  unsubscribeUrl: string;
  firstName?: string;
}): Record<string, string> {
  const variables: Record<string, string> = {
    CTA_URL: input.ctaUrl,
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
