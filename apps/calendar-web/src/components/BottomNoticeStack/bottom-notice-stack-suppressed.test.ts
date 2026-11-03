import { isBottomNoticeStackSuppressed } from "@web/components/BottomNoticeStack/bottom-notice-stack-suppressed";
import { describe, expect, it } from "bun:test";

const clear = {
  isAuthModalOpen: false,
  welcomeModalOpen: false,
  shortcutShowcaseOpen: false,
};

describe("isBottomNoticeStackSuppressed", () => {
  it("is false when auth and blocking modals are clear", () => {
    expect(isBottomNoticeStackSuppressed(clear)).toBe(false);
  });

  it("is true while the auth modal is open", () => {
    expect(
      isBottomNoticeStackSuppressed({ ...clear, isAuthModalOpen: true }),
    ).toBe(true);
  });

  it("is true while the welcome modal is open", () => {
    expect(
      isBottomNoticeStackSuppressed({ ...clear, welcomeModalOpen: true }),
    ).toBe(true);
  });

  it("is true while the shortcut showcase is open", () => {
    expect(
      isBottomNoticeStackSuppressed({ ...clear, shortcutShowcaseOpen: true }),
    ).toBe(true);
  });
});
