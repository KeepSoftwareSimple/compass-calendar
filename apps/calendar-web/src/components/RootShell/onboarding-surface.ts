/** Ordered onboarding/teaching surfaces; highest priority first. */
export const ONBOARDING_SURFACE_PRIORITY = [
  "billingGate",
  "checkoutCelebration",
  "welcomeModal",
  "shortcutShowcase",
  "welcomeGuide",
  "connectCalendarPrompt",
  "firstEventPrompt",
  "pointerHint",
] as const;

export type OnboardingSurfaceKind =
  (typeof ONBOARDING_SURFACE_PRIORITY)[number];

export type OnboardingSurfaceFlags = Record<OnboardingSurfaceKind, boolean>;

/** Returns the highest-priority surface that wants the screen, or null. */
export function selectActiveSurface(
  flags: OnboardingSurfaceFlags,
): OnboardingSurfaceKind | null {
  for (const kind of ONBOARDING_SURFACE_PRIORITY) {
    if (flags[kind]) return kind;
  }
  return null;
}
