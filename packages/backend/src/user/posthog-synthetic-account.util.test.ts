import { isPosthogSyntheticAccount } from "@backend/user/posthog-synthetic-account.util";
import { describe, expect, it } from "bun:test";

describe("posthog synthetic account helpers", () => {
  it("flags compasscaltest.invalid and journey inboxes for PostHog", () => {
    expect(isPosthogSyntheticAccount("x@compasscaltest.invalid")).toBe(true);
    expect(isPosthogSyntheticAccount("runner+journey1@example.com")).toBe(true);
    expect(isPosthogSyntheticAccount("real.user@gmail.com")).toBe(false);
  });

  it("respects persisted isSynthetic on the user document", () => {
    expect(isPosthogSyntheticAccount(undefined, true)).toBe(true);
    expect(isPosthogSyntheticAccount("real.user@gmail.com", false)).toBe(false);
  });
});
