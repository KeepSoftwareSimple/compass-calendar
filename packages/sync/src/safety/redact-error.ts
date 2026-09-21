/**
 * Reduce a provider-SDK / gaxios error to a bare message before attaching it
 * as a cause. googleapis and google-auth-library retain the full request
 * config on the error object (Authorization bearer, client_secret, auth code,
 * refresh_token). Propagating the raw object would leak secrets the moment any
 * caller logs the cause chain. The message is response-derived and safe for
 * diagnostics.
 */
export function redactedCause(error: unknown): Error | undefined {
  if (!(error instanceof Error)) return undefined;
  const redacted = new Error(error.message);
  redacted.name = error.name;
  redacted.stack = error.stack;
  return redacted;
}
