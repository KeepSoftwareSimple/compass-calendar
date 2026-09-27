import { GithubLogoIcon } from "@phosphor-icons/react/dist/csr/GithubLogo";
import { LinkedinLogoIcon } from "@phosphor-icons/react/dist/csr/LinkedinLogo";
import { XLogoIcon } from "@phosphor-icons/react/dist/csr/XLogo";
import { type FC, useState } from "react";
import { SOCIAL_LINKS } from "@web/common/constants/social.constants";
import { APP_VERSION } from "@web/common/constants/version.constants";
import { copyText } from "@web/common/utils/clipboard/clipboard.util";
import { OverlayPanel } from "@web/components/OverlayPanel/OverlayPanel";
import {
  selectIsAboutOpen,
  settingsActions,
  useSettingsStore,
} from "@web/settings/settings.store";
import { usePaletteAwareOverlayDismiss } from "@web/settings/usePaletteAwareOverlayDismiss";
import { useAppLockReason } from "@web/shortcuts/app-lock";

const SOCIAL_ICONS = {
  x: XLogoIcon,
  linkedin: LinkedinLogoIcon,
  github: GithubLogoIcon,
} as const;

const OUTLINE_BUTTON_CLASSNAME =
  "c-focus-ring shrink-0 rounded border border-border bg-surface-overlay px-2 py-1 text-xs text-text transition-colors hover:bg-surface-panel";

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

  if (!isOpen) return null;

  const handleCopyVersion = () => {
    void copyText(APP_VERSION).then((didCopy) => {
      if (!didCopy) return;
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPIED_LABEL_DURATION_MS);
    });
  };

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
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <div className="flex items-center gap-3">
          {SOCIAL_LINKS.map(({ id, label, href }) => {
            const SocialIcon = SOCIAL_ICONS[id];
            return (
              <a
                key={id}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="c-focus-ring text-text-muted transition-colors hover:text-text"
              >
                <SocialIcon size={18} weight="bold" />
              </a>
            );
          })}
        </div>
      </div>
    </OverlayPanel>
  );
};
