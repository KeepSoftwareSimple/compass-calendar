import { ProviderError } from "@sync/providers/provider-error";

const RETRYABLE_NETWORK_CODES = new Set([
  "ECONNABORTED",
  "ETIMEDOUT",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
]);

/** Request timeouts and similar network faults that should retry, not page. */
export function isRetryableProviderNetworkFailure(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return true;
  }
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: string | number }).code;
  if (typeof code === "string" && RETRYABLE_NETWORK_CODES.has(code)) {
    return true;
  }
  return error.message.includes("The operation timed out.");
}

/** Retryable provider-port failures stay at warn so they do not open a PostHog
 * exception alert (error-level only). Terminal failures still page. */
export function isTransientProviderError(error: unknown): boolean {
  let current: unknown = error;
  const seen = new WeakSet<object>();

  while (current instanceof Error) {
    if (seen.has(current)) break;
    seen.add(current);

    if (current instanceof ProviderError && current.reason === "transient") {
      return true;
    }
    if (isRetryableProviderNetworkFailure(current)) {
      return true;
    }

    current = current.cause;
  }

  return false;
}

export type SyncJobEngineLogger = {
  error: (message: string, meta?: unknown) => void;
  warn: (message: string, meta?: unknown) => void;
};

export function logSyncJobEngineError(
  logger: SyncJobEngineLogger,
  message: string,
  error: unknown,
): void {
  if (isTransientProviderError(error)) {
    logger.warn(message, error);
    return;
  }
  logger.error(message, error);
}
