import {
  isBottomNoticeStackSuppressed,
  isUpNextBannerSuppressed,
} from "@web/components/BottomNoticeStack/bottom-notice-stack-suppressed";
import { describe, expect, it } from "bun:test";

describe("isBottomNoticeStackSuppressed", () => {
  it("is false when auth and onboarding are clear", () => {
    expect(
      isBottomNoticeStackSuppressed({
        isAuthModalOpen: false,
        activeOnboardingSurface: null,
      }),
    ).toBe(false);
  });

  it("is true while the auth modal is open", () => {
    expect(
      isBottomNoticeStackSuppressed({
        isAuthModalOpen: true,
        activeOnboardingSurface: null,
      }),
    ).toBe(true);
  });

  it("is true while a blocking onboarding surface is active", () => {
    expect(
      isBottomNoticeStackSuppressed({
        isAuthModalOpen: false,
        activeOnboardingSurface: "welcomeModal",
      }),
    ).toBe(true);
  });

  it("is false while only the first-event prompt is active", () => {
    expect(
      isBottomNoticeStackSuppressed({
        isAuthModalOpen: false,
        activeOnboardingSurface: "firstEventPrompt",
      }),
    ).toBe(false);
  });
});

describe("isUpNextBannerSuppressed", () => {
  it("is true while the first-event prompt is active", () => {
    expect(
      isUpNextBannerSuppressed({
        isAuthModalOpen: false,
        activeOnboardingSurface: "firstEventPrompt",
      }),
    ).toBe(true);
  });
});
