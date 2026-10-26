import { trackSignupStep } from "@web/auth/posthog/signup-funnel";
import { track } from "@web/auth/posthog/track";

export function trackGoogleOAuthScopesRecoveryViewed(): void {
  track("google_oauth_scopes_recovery_viewed", { provider: "google" });
  trackSignupStep("google_oauth_scopes_recovery_viewed", { method: "google" });
}

export function trackGoogleOAuthScopesRecoveryRetryClicked(
  missingScopeCount: number,
): void {
  track("google_oauth_scopes_recovery_retry_clicked", {
    provider: "google",
    missing_scope_count: missingScopeCount,
  });
  trackSignupStep("google_oauth_scopes_recovery_retry_clicked", {
    method: "google",
  });
}

export function trackGoogleOAuthScopesRecoverySucceeded(): void {
  track("google_oauth_scopes_recovery_succeeded", { provider: "google" });
  trackSignupStep("google_oauth_scopes_recovery_succeeded", {
    method: "google",
  });
}
