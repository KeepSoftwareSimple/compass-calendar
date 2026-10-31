import { type OnboardingSurfaceKind } from "@web/components/RootShell/onboarding-surface";

/** True while auth or a blocking onboarding surface owns the screen. */
export function isBottomNoticeStackSuppressed(input: {
  isAuthModalOpen: boolean;
  activeOnboardingSurface: OnboardingSurfaceKind | null;
}): boolean {
  if (input.isAuthModalOpen) return true;
  if (input.activeOnboardingSurface === null) return false;
  // First-event prompt renders inside the stack; other surfaces are modals/overlays.
  return input.activeOnboardingSurface !== "firstEventPrompt";
}

/** True while the up-next banner and its shortcuts must stay hidden. */
export function isUpNextBannerSuppressed(input: {
  isAuthModalOpen: boolean;
  activeOnboardingSurface: OnboardingSurfaceKind | null;
}): boolean {
  return input.isAuthModalOpen || input.activeOnboardingSurface !== null;
}
