import { type FC } from "react";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
import {
  type NoticeActionKey,
  useNoticeActionShortcut,
} from "@web/shortcuts/notice-focus/useNoticeActionShortcut";

type BillingBannerProps = {
  message: string;
  ctaLabel: string;
  disabled?: boolean;
  onCta: () => void;
  onDismiss?: () => void;
  dismissLabel?: string;
  shortcutKey?: NoticeActionKey;
};

/**
 * The non-blocking billing notice. `data-notice` is what the notice-focus
 * shortcut scans for, so it belongs here rather than in each caller.
 * A `shortcutKey` binds the CTA while the banner is mounted: clicks are
 * blocked in keyboard-only mode, so the keycap is the path to the action.
 */
export const BillingBanner: FC<BillingBannerProps> = ({
  message,
  ctaLabel,
  disabled = false,
  onCta,
  onDismiss,
  dismissLabel = "Dismiss",
  shortcutKey,
}) => {
  useNoticeActionShortcut(shortcutKey, onCta, { enabled: !disabled });

  return (
    <div
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 border-warning/40 border-b bg-warning/10 px-4 py-2 text-sm text-text"
      data-notice=""
      role="status"
    >
      <p>{message}</p>
      <div className="flex shrink-0 items-center gap-2">
        <button
          className="c-focus-ring inline-flex items-center gap-2 font-medium text-warning underline-offset-4 hover:underline"
          disabled={disabled}
          onClick={onCta}
          type="button"
        >
          {ctaLabel}
          {shortcutKey ? <ShortcutKeys keys={shortcutKey} /> : null}
        </button>
        {onDismiss ? (
          <button
            className="c-focus-ring rounded-xs px-2 py-1 text-text-muted hover:bg-surface-overlay hover:text-text"
            onClick={onDismiss}
            type="button"
          >
            {dismissLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
};
