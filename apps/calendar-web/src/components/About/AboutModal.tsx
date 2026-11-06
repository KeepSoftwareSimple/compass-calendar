import { ArticleIcon } from "@phosphor-icons/react/dist/csr/Article";
import { GithubLogoIcon } from "@phosphor-icons/react/dist/csr/GithubLogo";
import { LinkedinLogoIcon } from "@phosphor-icons/react/dist/csr/LinkedinLogo";
import { XLogoIcon } from "@phosphor-icons/react/dist/csr/XLogo";
import classNames from "classnames";
import { type FC, useCallback, useState } from "react";
import { APP_VERSION } from "@web/common/constants/version.constants";
import { copyText } from "@web/common/utils/clipboard/clipboard.util";
import { OverlayPanel } from "@web/components/OverlayPanel/OverlayPanel";
import { ShortcutHint } from "@web/components/Shortcuts/ShortcutHint";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
import { StableLabel } from "@web/components/StableLabel/StableLabel";
import {
  selectIsAboutOpen,
  settingsActions,
  useSettingsStore,
} from "@web/settings/settings.store";
import { usePaletteAwareOverlayDismiss } from "@web/settings/usePaletteAwareOverlayDismiss";
import { useAppLockReason } from "@web/shortcuts/app-lock";
import {
  ABOUT_SOCIAL_LINKS,
  ABOUT_SOCIAL_SHORTCUTS,
  COPY_VERSION_SHORTCUT,
} from "./about-modal.constants";
import { useAboutModalShortcuts } from "./useAboutModalShortcuts";

const SOCIAL_ICONS = {
  x: XLogoIcon,
  linkedin: LinkedinLogoIcon,
  github: GithubLogoIcon,
  blog: ArticleIcon,
} as const;

const OUTLINE_BUTTON_CLASSNAME =
  "c-focus-ring inline-flex shrink-0 items-center rounded border border-border bg-surface-overlay px-2 py-1 text-xs text-text transition-colors hover:bg-surface-panel";

const COPIED_LABEL_DURATION_MS = 2000;

/** "About Compass" (via the palette's About item): version + social links. */
export const AboutModal: FC = () => {
  const isOpen = useSettingsStore(selectIsAboutOpen);
  const [copied, setCopied] = useState(false);
  const { skipFocusRestoreRef, handleDismiss } = usePaletteAwareOverlayDismiss(
    isOpen,
    settingsActions.closeAbout,
  );
  useAppLockReason("aboutModal", isOpen);

  const handleCopyVersion = useCallback(() => {
    void copyText(APP_VERSION).then((didCopy) => {
      if (!didCopy) return;
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPIED_LABEL_DURATION_MS);
    });
  }, []);

  useAboutModalShortcuts(isOpen, handleCopyVersion);

  if (!isOpen) return null;

  return (
    <OverlayPanel
      align="start"
      onDismiss={handleDismiss}
      skipFocusRestoreRef={skipFocusRestoreRef}
      title="About Compass"
      variant="modal"
    >
      <div className="flex w-full flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-text-muted">
            Version: {APP_VERSION}
          </span>
          <button
            className={OUTLINE_BUTTON_CLASSNAME}
            onClick={handleCopyVersion}
            type="button"
          >
            <StableLabel labels={["Copy", "Copied"]}>
              {copied ? "Copied" : "Copy"}
            </StableLabel>
            <ShortcutKeys className="ml-1.5" keys={COPY_VERSION_SHORTCUT} />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {ABOUT_SOCIAL_LINKS.map(({ id, label, href }) => {
            const SocialIcon = SOCIAL_ICONS[id];
            const shortcut = ABOUT_SOCIAL_SHORTCUTS[id];
            return (
              <a
                key={id}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className={classNames(
                  "c-focus-ring inline-flex shrink-0 items-center gap-1 text-text-muted transition-colors hover:text-text",
                )}
              >
                <SocialIcon size={18} weight="bold" />
                <ShortcutHint>{shortcut}</ShortcutHint>
              </a>
            );
          })}
        </div>
      </div>
    </OverlayPanel>
  );
};
