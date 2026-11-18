/** Server- and client-side OAuth signup funnel events (see `track.ts`). */
export const OAUTH_CALLBACK_RECEIVED_EVENT = "oauth_callback_received" as const;
export const OAUTH_FAILED_EVENT = "oauth_failed" as const;

/** Shared with sync calendar connect callbacks (`connection.routes.ts`). */
export const OAUTH_CALLBACK_EVENT = "oauth_callback" as const;

export type AuthOAuthFlow = "signup" | "login";

export type AuthOAuthCallbackOutcome = "success" | "failure";

export type OAuthFailedReason =
  | "access_denied"
  | "invalid_state"
  | "token_exchange_failed"
  | "missing_code"
  | "user_create_failed"
  | "other";

/**
 * The single rule for "this callback carries nothing": no state, no code, no
 * provider error. Whitespace-only values count as absent, so a crawler GET
 * with a blank param is ignored the same way a bare one is. The backend
 * callback service and the web landing recorder both gate on this function so
 * they cannot disagree about what counts as junk traffic.
 */
export function isOAuthCallbackQueryEmpty(input: {
  state: string | null | undefined;
  code: string | null | undefined;
  providerError: string | null | undefined;
}): boolean {
  const hasValue = (value: string | null | undefined) =>
    typeof value === "string" && value.trim().length > 0;
  return (
    !hasValue(input.state) &&
    !hasValue(input.code) &&
    !hasValue(input.providerError)
  );
}

export function oauthFailedReasonFromCallbackQuery(input: {
  state: string | null | undefined;
  code: string | null | undefined;
  providerError: string | null | undefined;
}): OAuthFailedReason | undefined {
  if (isOAuthCallbackQueryEmpty(input)) return undefined;
  if (input.providerError === "access_denied") return "access_denied";
  if (input.providerError) return "other";
  if (!input.state) return "invalid_state";
  if (!input.code) return "missing_code";
  return undefined;
}

export function authOAuthCallbackOutcomeFromQuery(input: {
  state: string | null | undefined;
  code: string | null | undefined;
  providerError: string | null | undefined;
}): {
  outcome: AuthOAuthCallbackOutcome;
  reason?: OAuthFailedReason;
} {
  const reason = oauthFailedReasonFromCallbackQuery(input);
  if (reason) {
    return { outcome: "failure", reason };
  }
  return { outcome: "success" };
}
