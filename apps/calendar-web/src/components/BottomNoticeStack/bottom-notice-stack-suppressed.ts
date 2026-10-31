/** True while auth or a blocking onboarding modal owns the screen. */
export function isBottomNoticeStackSuppressed(input: {
  isAuthModalOpen: boolean;
  welcomeModalOpen: boolean;
  shortcutShowcaseOpen: boolean;
}): boolean {
  return (
    input.isAuthModalOpen ||
    input.welcomeModalOpen ||
    input.shortcutShowcaseOpen
  );
}

/** True while the up-next banner and its shortcuts must stay hidden. */
export function isUpNextBannerSuppressed(input: {
  isAuthModalOpen: boolean;
  welcomeModalOpen: boolean;
  shortcutShowcaseOpen: boolean;
}): boolean {
  return isBottomNoticeStackSuppressed(input);
}
