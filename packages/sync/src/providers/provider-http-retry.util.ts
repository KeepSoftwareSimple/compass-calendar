import {
  capDelayForInlineProviderRequest,
  InlineProviderRequestBudgetExhaustedError,
  inlineProviderRequestBudgetRemainingMs,
} from "@sync/providers/provider-inline-request-budget";

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_DELAY_MS = 1_000;
const MAX_RETRY_AFTER_MS = 10 * 60_000;

export function isRetryableProviderHttpStatus(
  status: number | undefined,
): boolean {
  if (status === undefined) return false;
  return status === 429 || status === 503 || status >= 500;
}

export function parseRetryAfterMs(
  header: string | null | undefined,
  nowMs: number = Date.now(),
): number | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  if (!trimmed) return undefined;

  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(MAX_RETRY_AFTER_MS, Math.round(seconds * 1_000));
  }

  const dateMs = Date.parse(trimmed);
  if (Number.isNaN(dateMs)) return undefined;
  return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, dateMs - nowMs));
}

export function providerHttpRetryDelayMs(
  attempt: number,
  retryAfterMs: number | undefined,
  baseDelayMs: number = DEFAULT_BASE_DELAY_MS,
): number {
  if (retryAfterMs !== undefined) return retryAfterMs;
  const exp = Math.min(attempt - 1, 6);
  return Math.min(MAX_RETRY_AFTER_MS, baseDelayMs * 2 ** exp);
}

export async function withRetryableProviderHttp<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelayMs?: number;
    sleep?: (ms: number) => Promise<void>;
    readRetryAfterMs?: (error: unknown) => number | undefined;
    isRetryable?: (error: unknown) => boolean;
  } = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const readRetryAfterMs = options.readRetryAfterMs ?? (() => undefined);
  const isRetryable =
    options.isRetryable ??
    ((error: unknown) => {
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      return isRetryableProviderHttpStatus(status);
    });

  let attempt = 0;
  while (true) {
    attempt += 1;
    const remainingBeforeAttempt = inlineProviderRequestBudgetRemainingMs();
    if (remainingBeforeAttempt !== undefined && remainingBeforeAttempt <= 0) {
      throw new InlineProviderRequestBudgetExhaustedError();
    }
    try {
      return await operation();
    } catch (error) {
      if (attempt >= maxAttempts || !isRetryable(error)) {
        throw error;
      }
      const delayMs = capDelayForInlineProviderRequest(
        providerHttpRetryDelayMs(
          attempt,
          readRetryAfterMs(error),
          options.baseDelayMs,
        ),
      );
      const remainingAfterDelay = inlineProviderRequestBudgetRemainingMs();
      if (
        remainingAfterDelay !== undefined &&
        (remainingAfterDelay <= 0 || delayMs <= 0)
      ) {
        throw new InlineProviderRequestBudgetExhaustedError();
      }
      await sleep(delayMs);
    }
  }
}
