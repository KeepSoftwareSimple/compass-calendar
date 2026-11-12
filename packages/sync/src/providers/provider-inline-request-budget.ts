import { AsyncLocalStorage } from "node:async_hooks";

// The backend's Sync HTTP client times out at COMMAND_TIMEOUT_MS (30s). Inline
// command execution must finish and answer before that, including a provider
// budget short enough for serialization. Stale-command retry covers the rest.
export const INLINE_COMMAND_REQUEST_BUDGET_MS = 24_000;

// In-request retries must not sleep on multi-minute Retry-After headers.
export const INLINE_REQUEST_MAX_RETRY_AFTER_MS = 2_000;

interface InlineBudget {
  readonly deadlineAt: number;
}

const storage = new AsyncLocalStorage<InlineBudget>();

export function runWithInlineProviderRequestBudget<T>(
  fn: () => Promise<T>,
  nowMs: () => number = Date.now,
): Promise<T> {
  return storage.run(
    { deadlineAt: nowMs() + INLINE_COMMAND_REQUEST_BUDGET_MS },
    fn,
  );
}

export function inlineProviderRequestBudgetRemainingMs(
  nowMs: number = Date.now(),
): number | undefined {
  const budget = storage.getStore();
  if (!budget) return undefined;
  return Math.max(0, budget.deadlineAt - nowMs);
}

export function capDelayForInlineProviderRequest(delayMs: number): number {
  const remaining = inlineProviderRequestBudgetRemainingMs();
  if (remaining === undefined) return delayMs;
  return Math.min(delayMs, remaining, INLINE_REQUEST_MAX_RETRY_AFTER_MS);
}

export class InlineProviderRequestBudgetExhaustedError extends Error {
  constructor() {
    super("Inline provider request budget exhausted");
    this.name = "InlineProviderRequestBudgetExhaustedError";
  }
}
