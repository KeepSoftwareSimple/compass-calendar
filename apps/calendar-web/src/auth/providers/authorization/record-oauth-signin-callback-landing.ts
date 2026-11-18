import {
  OAUTH_CALLBACK_RECEIVED_EVENT,
  isOAuthCallbackQueryEmpty,
} from "@core/analytics/oauth-signup.events";
import { type ProviderKind } from "@core/types/sync/identity.contracts";
import { trackSignupStep } from "@web/auth/posthog/signup-funnel";
import { track } from "@web/auth/posthog/track";
import { relayProviderOAuthCallbackTelemetry } from "@web/auth/providers/authorization/relay-provider-oauth-callback-telemetry";

function shouldRelayProviderOAuthCallbackTelemetry(
  provider: ProviderKind,
  search: string,
): boolean {
  // Apple records on the form POST instead, so a relay here would double-count.
  if (provider === "apple") return false;
  const query = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(query);
  // Emptiness is core's rule, not this file's: the backend callback service
  // gates on the same function, so both doors agree on what is junk.
  return !isOAuthCallbackQueryEmpty({
    state: params.get("state"),
    code: params.get("code"),
    providerError: params.get("error"),
  });
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
