import { QueryClient } from "@tanstack/react-query";
import { seedPendingEventMutations } from "@web/__tests__/utils/event-query-test-data";
import {
  claimCoalescedReplaceSignal,
  releaseCoalescedReplaceSignal,
  waitForPendingEventMutations,
} from "./event.mutation.runtime";
import { describe, expect, it, spyOn } from "bun:test";

describe("waitForPendingEventMutations", () => {
  it("returns immediately when no event mutations are pending", async () => {
    await waitForPendingEventMutations(new QueryClient());
  });

  it("proceeds after the timeout when a mutation never settles", async () => {
    const queryClient = new QueryClient();
    seedPendingEventMutations(queryClient, ["hung-event"]);
    const warn = spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await waitForPendingEventMutations(queryClient, 20);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe("coalesced replace abort", () => {
  it("aborts the previous in-flight signal when the same write key is claimed again", () => {
    const first = claimCoalescedReplaceSignal("evt-coalesce-1");
    const second = claimCoalescedReplaceSignal("evt-coalesce-1");
    expect(first.aborted).toBe(true);
    expect(second.aborted).toBe(false);
    releaseCoalescedReplaceSignal("evt-coalesce-1", second);
  });
});
