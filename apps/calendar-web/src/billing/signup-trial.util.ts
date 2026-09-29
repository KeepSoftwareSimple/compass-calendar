import { type SignupMethod } from "@web/auth/posthog/signup-funnel";
import { sessionBrowserStore } from "@web/common/storage/browser-key-value.store";

const SIGNUP_TRIAL_METHOD_KEY = "signupTrialMethod";

export function rememberSignupTrialMethod(method: SignupMethod): void {
  sessionBrowserStore.set(SIGNUP_TRIAL_METHOD_KEY, method);
}

export function readSignupTrialMethod(
  fallback: SignupMethod = "email",
): SignupMethod {
  const stored = sessionBrowserStore.get(SIGNUP_TRIAL_METHOD_KEY);
  if (
    stored === "email" ||
    stored === "google" ||
    stored === "microsoft" ||
    stored === "apple"
  ) {
    return stored;
  }
  return fallback;
}

export function clearSignupTrialMethod(): void {
  sessionBrowserStore.remove(SIGNUP_TRIAL_METHOD_KEY);
}
