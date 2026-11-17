import { OAUTH_CALLBACK_RECEIVED_EVENT } from "@core/analytics/oauth-signup.events";
import { type ProviderKind } from "@core/types/sync/identity.contracts";
import { trackSignupStep } from "@web/auth/posthog/signup-funnel";
import { track } from "@web/auth/posthog/track";
import { relayProviderOAuthCallbackTelemetry } from "@web/auth/providers/authorization/relay-provider-oauth-callback-telemetry";

function oauthCallbackSearchHasParams(search: string): boolean {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(query);
  return Boolean(
    params.get("state")?.trim() ||
      params.get("code")?.trim() ||
      params.get("error")?.trim(),
  );
}

function shouldRelayProviderOAuthCallbackTelemetry(
  provider: ProviderKind,
  search: string,
): boolean {
  if (provider === "apple") return false;
  return oauthCallbackSearchHasParams(search);
}

/**
 * Records that the user returned from the provider before any success or
 * failure branch. Order: server relay, then client funnel + landing events.
 */
export function recordOAuthSignInCallbackLanding(
  provider: ProviderKind,
  search: string,
): void {
  if (shouldRelayProviderOAuthCallbackTelemetry(provider, search)) {
    relayProviderOAuthCallbackTelemetry(provider, search);
  }
  trackSignupStep("oauth_callback_returned", { method: provider });
  track(OAUTH_CALLBACK_RECEIVED_EVENT, { provider });
}
