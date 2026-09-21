import {
  ONBOARDING_SURFACE_PRIORITY,
  type OnboardingSurfaceFlags,
  type OnboardingSurfaceKind,
  selectActiveSurface,
} from "@web/components/RootShell/onboarding-surface";
import { describe, expect, it } from "bun:test";

const none = (): OnboardingSurfaceFlags =>
  Object.fromEntries(
    ONBOARDING_SURFACE_PRIORITY.map((kind) => [kind, false]),
  ) as OnboardingSurfaceFlags;

const only = (kind: OnboardingSurfaceKind): OnboardingSurfaceFlags => ({
  ...none(),
  [kind]: true,
});

describe("selectActiveSurface", () => {
  it("returns null when nothing is eligible", () => {
    expect(selectActiveSurface(none())).toBeNull();
  });

  for (const kind of ONBOARDING_SURFACE_PRIORITY) {
    it(`selects ${kind} when it is the only eligible surface`, () => {
      expect(selectActiveSurface(only(kind))).toBe(kind);
    });
  }

  for (
    let index = 0;
    index < ONBOARDING_SURFACE_PRIORITY.length - 1;
    index += 1
  ) {
    const higher = ONBOARDING_SURFACE_PRIORITY[index];
    const lower = ONBOARDING_SURFACE_PRIORITY[index + 1];
    it(`prefers ${higher} over ${lower}`, () => {
      const flags = { ...none(), [higher]: true, [lower]: true };
      expect(selectActiveSurface(flags)).toBe(higher);
    });
  }
});
