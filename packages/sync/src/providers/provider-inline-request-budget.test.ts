import { INLINE_COMMAND_REQUEST_BUDGET_MS } from "@core/types/sync/command.contracts";
import {
  capDelayForInlineProviderRequest,
  INLINE_REQUEST_MAX_RETRY_AFTER_MS,
  inlineProviderRequestBudgetRemainingMs,
  runWithInlineProviderRequestBudget,
} from "@sync/providers/provider-inline-request-budget";
import { describe, expect, it } from "bun:test";

describe("provider-inline-request-budget", () => {
  it("caps Retry-After sleeps during an inline command request", () => {
    let now = 1_000;
    runWithInlineProviderRequestBudget(
      () => {
        expect(capDelayForInlineProviderRequest(600_000)).toBeLessThanOrEqual(
          INLINE_REQUEST_MAX_RETRY_AFTER_MS,
        );
        now += 1;
        expect(inlineProviderRequestBudgetRemainingMs(now)).toBe(
          INLINE_COMMAND_REQUEST_BUDGET_MS - 1,
        );
      },
      () => now,
    );
  });
});
