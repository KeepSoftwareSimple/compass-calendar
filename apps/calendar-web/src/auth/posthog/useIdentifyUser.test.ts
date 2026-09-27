import { renderHook } from "@testing-library/react";
import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const identify = mock();
const usePostHog = mock(() => ({ identify }));

// bun's mock.module is global and leaks into every other test file in the
// run. Spread the real module so unrelated suites (e.g. anything rendering
// PostHogProvider) still see its full surface, and only override usePostHog
// while this file runs - the flag flips back to the real implementation in
// afterAll.
const actualPosthogReact = {
  ...(await import("@web/auth/posthog/posthog-react")),
};
let isUsePostHogMocked = true;

mock.module("@web/auth/posthog/posthog-react", () => ({
  ...actualPosthogReact,
  usePostHog: () => {
    const impl = isUsePostHogMocked
      ? usePostHog
      : actualPosthogReact.usePostHog;
    return impl();
  },
}));

afterAll(() => {
  isUsePostHogMocked = false;
});

const { useIdentifyUser } = await import("./useIdentifyUser");

describe("useIdentifyUser", () => {
  beforeEach(() => {
    identify.mockClear();
  });

  it("identifies with userId as the distinct_id and email as a property", () => {
    renderHook(() => useIdentifyUser("user@example.com", "user-123"));

    expect(identify).toHaveBeenCalledWith("user-123", {
      email: "user@example.com",
      user_id: "user-123",
    });
  });

  it("does not identify when userId or email is missing", () => {
    renderHook(() => useIdentifyUser(null, null));

    expect(identify).not.toHaveBeenCalled();
  });

  it("does not identify on public booking routes", () => {
    window.history.pushState({}, "", "/meet/sentinel-host-slug");
    renderHook(() => useIdentifyUser("guest@example.test", "user-123"));

    expect(identify).not.toHaveBeenCalled();
    window.history.pushState({}, "", "/week");
  });
});
