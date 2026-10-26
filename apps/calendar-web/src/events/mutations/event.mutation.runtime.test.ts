import { QueryClient } from "@tanstack/react-query";
import {
  claimCoalescedReplaceSignal,
  releaseCoalescedReplaceSignal,
  waitForPendingEventMutations,
} from "./event.mutation.runtime";
import { describe, expect, it } from "bun:test";

describe("waitForPendingEventMutations", () => {
  it("returns immediately when no event mutations are pending", async () => {
    await waitForPendingEventMutations(new QueryClient());
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
