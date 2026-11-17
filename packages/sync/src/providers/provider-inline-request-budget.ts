import { INLINE_COMMAND_REQUEST_BUDGET_MS } from "@core/types/sync/command.contracts";
import { AsyncLocalStorage } from "node:async_hooks";

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
