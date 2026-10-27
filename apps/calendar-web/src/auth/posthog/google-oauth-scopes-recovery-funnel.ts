import { trackSignupStep } from "@web/auth/posthog/signup-funnel";
import { track } from "@web/auth/posthog/track";

function trackGoogleOAuthScopesRecovery(
  step:
    | "google_oauth_scopes_recovery_viewed"
    | "google_oauth_scopes_recovery_retry_clicked"
    | "google_oauth_scopes_recovery_succeeded",
  extra?: { missing_scope_count: number },
): void {
  track(step, { provider: "google", ...extra });
  trackSignupStep(step, { method: "google" });
}

export function trackGoogleOAuthScopesRecoveryViewed(): void {
  trackGoogleOAuthScopesRecovery("google_oauth_scopes_recovery_viewed");
}

export function trackGoogleOAuthScopesRecoveryRetryClicked(
  missingScopeCount: number,
): void {
  trackGoogleOAuthScopesRecovery("google_oauth_scopes_recovery_retry_clicked", {
    missing_scope_count: missingScopeCount,
  });
}

export function trackGoogleOAuthScopesRecoverySucceeded(): void {
  trackGoogleOAuthScopesRecovery("google_oauth_scopes_recovery_succeeded");
}
