import { CONFIG } from "@backend/common/constants/config.constants";

const appUrl = (): string => CONFIG.FRONTEND_URL.replace(/\/$/, "");

const settingsHref = (page: "accounts" | "billing"): string =>
  `${appUrl()}/?settings=${page}`;

const meetingSetupHref = (): string => `${appUrl()}/?meetingSetup=1`;

/** Resend published template alias per welcome drip step. */
export const WELCOME_STEP_TEMPLATE_ALIAS: Record<string, string> = {
  welcome: "compass-welcome",
  shortcuts: "compass-shortcuts",
  "connect-calendar": "compass-connect-calendar",
  booking: "compass-booking",
  "trial-ending": "compass-trial-ending",
};

export function getWelcomeStepTemplateAlias(
  stepKey: string,
): string | undefined {
  return WELCOME_STEP_TEMPLATE_ALIAS[stepKey];
}

/** Base CTA href before UTM params (same destinations as legacy in-code content). */
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
    variables.USER_FIRST_NAME = trimmedFirstName;
  }
  return variables;
}

export function getWelcomeStepCtaBaseHref(stepKey: string): string | undefined {
  switch (stepKey) {
    case "welcome":
    case "shortcuts":
      return appUrl();
    case "connect-calendar":
      return settingsHref("accounts");
    case "booking":
      return meetingSetupHref();
    case "trial-ending":
      return settingsHref("billing");
    default:
      return undefined;
  }
}
