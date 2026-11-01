import {
  BOTTOM_NOTICE_OBSTACLE_GAP_PX,
  resolveUpNextBannerClearancePx,
  spansOverlap,
  stackReachesSidebarFooter,
} from "@web/components/BottomNoticeStack/bottom-notice-stack-lift.util";
import { describe, expect, it } from "bun:test";

// Default stack: left inset 16px, width min(24rem, 100vw - 2rem).
const stackAt = (viewportWidth: number) => ({
  left: 16,
  right: 16 + Math.min(384, viewportWidth - 32),
});

describe("stackReachesSidebarFooter", () => {
  it("keeps the default inset at 1280px with the right sidebar open", () => {
    // 1280 - 345 sidebar - 32 divider = 903
    expect(stackReachesSidebarFooter(stackAt(1280), 903)).toBe(false);
  });

  it("keeps the default inset when the sidebar is closed", () => {
    expect(stackReachesSidebarFooter(stackAt(560), 560)).toBe(false);
    expect(stackReachesSidebarFooter(stackAt(360), 360)).toBe(false);
  });

  it("lifts at 360px when the open sidebar sits under the stack", () => {
    // 360 - 232 clamped sidebar - 32 divider = 96
    expect(stackReachesSidebarFooter(stackAt(360), 96)).toBe(true);
  });

  it("does not lift without a main column", () => {
    expect(stackReachesSidebarFooter(stackAt(360), null)).toBe(false);
  });
});

describe("resolveUpNextBannerClearancePx", () => {
  const banner = { left: 326, right: 614, top: 800 - 24 - 52 };

  it("returns null while the banner is hidden", () => {
    expect(resolveUpNextBannerClearancePx(stackAt(1280), null, 800)).toBeNull();
  });

  it("returns null when the banner does not share the stack's columns", () => {
    expect(
      resolveUpNextBannerClearancePx(
        stackAt(1280),
        { ...banner, left: 500, right: 788 },
        800,
      ),
    ).toBeNull();
  });

  it("lifts the stack just above a visible overlapping banner", () => {
    expect(resolveUpNextBannerClearancePx(stackAt(1280), banner, 800)).toBe(
      24 + 52 + BOTTOM_NOTICE_OBSTACLE_GAP_PX,
    );
  });
});

describe("spansOverlap", () => {
  it("treats touching edges as clear", () => {
    expect(
      spansOverlap({ left: 0, right: 100 }, { left: 100, right: 200 }),
    ).toBe(false);
  });
});
