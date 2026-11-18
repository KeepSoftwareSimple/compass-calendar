import {
  clearHiddenEventIntentIfCurrent,
  hasPendingHiddenIntent,
  mergePendingHiddenIntents,
  registerHiddenEventIntent,
  resetHiddenEventMutationCoordinatorForTests,
} from "@web/events/hidden/hidden-event-mutation-coordinator";
import { afterEach, describe, expect, it } from "bun:test";

describe("hidden-event-mutation-coordinator", () => {
  afterEach(() => {
    resetHiddenEventMutationCoordinatorForTests();
  });

  it("clears intent after a matching settle", () => {
    const seq = registerHiddenEventIntent("evt-1", true);
    clearHiddenEventIntentIfCurrent("evt-1", seq, true);
    expect(hasPendingHiddenIntent("evt-1")).toBe(false);
  });

  it("merges a pending hide into a fetched list", () => {
    registerHiddenEventIntent("evt-inflight", true);
    expect(mergePendingHiddenIntents([])).toEqual(["evt-inflight"]);
  });

  it("merges a pending unhide over a fetched list", () => {
    registerHiddenEventIntent("evt-remove", false);
    expect(mergePendingHiddenIntents(["evt-remove", "other"])).toEqual([
      "other",
    ]);
  });
});
