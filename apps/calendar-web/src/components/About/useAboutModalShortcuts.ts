import { useCallback } from "react";
import { openExternalUrl } from "@web/common/utils/browser/open-external-url.util";
import { useAppShortcut } from "@web/shortcuts/useAppShortcut";
import {
  ABOUT_OVERLAY_SHORTCUT,
  ABOUT_SOCIAL_LINKS,
  ABOUT_SOCIAL_SHORTCUTS,
  type AboutSocialLinkId,
  COPY_VERSION_SHORTCUT,
} from "./about-modal.constants";

export function useAboutModalShortcuts(
  isOpen: boolean,
  onCopyVersion: () => void,
): void {
  const overlayShortcut = {
    enabled: isOpen,
    ...ABOUT_OVERLAY_SHORTCUT,
  } as const;

  const openSocialLink = useCallback((id: AboutSocialLinkId) => {
    const link = ABOUT_SOCIAL_LINKS.find((entry) => entry.id === id);
    if (!link) return;
    openExternalUrl(link.href);
  }, []);

  useAppShortcut(COPY_VERSION_SHORTCUT, onCopyVersion, overlayShortcut);
  useAppShortcut(
    ABOUT_SOCIAL_SHORTCUTS.x,
    () => openSocialLink("x"),
    overlayShortcut,
  );
  useAppShortcut(
    ABOUT_SOCIAL_SHORTCUTS.linkedin,
    () => openSocialLink("linkedin"),
    overlayShortcut,
  );
  useAppShortcut(
    ABOUT_SOCIAL_SHORTCUTS.github,
    () => openSocialLink("github"),
    overlayShortcut,
  );
  useAppShortcut(
    ABOUT_SOCIAL_SHORTCUTS.blog,
    () => openSocialLink("blog"),
    overlayShortcut,
  );
}
