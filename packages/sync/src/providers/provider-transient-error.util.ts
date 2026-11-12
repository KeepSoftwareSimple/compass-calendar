import { ProviderError } from "@sync/providers/provider-error";

const RETRYABLE_NETWORK_CODES = new Set([
  "ECONNABORTED",
  "ETIMEDOUT",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
]);

export function providerHttpResponseFacts(error: unknown): {
  readonly status?: number;
  readonly contentType?: string;
} {
  const response = (
    error as { response?: { status?: number; headers?: unknown } }
  )?.response;
  const status =
    typeof response?.status === "number" ? response.status : undefined;
  const headers = response?.headers;
  if (!headers || typeof headers !== "object") {
    return { status, contentType: undefined };
  }
  if (typeof (headers as Headers).get === "function") {
    const contentType = (headers as Headers).get("content-type") ?? undefined;
    return { status, contentType: contentType ?? undefined };
  }
  const record = headers as Record<string, string | string[] | undefined>;
  const raw = record["content-type"] ?? record["Content-Type"];
  const contentType = Array.isArray(raw) ? raw[0] : raw;
  return { status, contentType };
}

function isJsonParseFailure(error: Error): boolean {
  if (error instanceof SyntaxError) return true;
  if (error.message === "Failed to parse JSON") return true;
  if (/^JSON Parse error:/i.test(error.message)) return true;
  if (/Unexpected token.*in JSON/i.test(error.message)) return true;
  return false;
}

/** HTML gateways and truncated bodies that fail JSON parse should retry. */
export function isRetryableProviderResponseParseFailure(
  error: unknown,
): boolean {
  if (!(error instanceof Error) || !isJsonParseFailure(error)) return false;
  const { status, contentType } = providerHttpResponseFacts(error);
  if (status === undefined) return true;
  if (status >= 500 || status === 429) return true;
  if (contentType && !contentType.toLowerCase().includes("application/json")) {
    return true;
  }
  return false;
}

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
  if (error.message.includes("The operation timed out.")) {
    return true;
  }
  return isRetryableProviderResponseParseFailure(error);
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
