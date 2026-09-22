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
  shortcutKey,
}) => {
  useNoticeActionShortcut(shortcutKey, onCta, { enabled: !disabled });

  return (
    <div
      className="flex items-center justify-center gap-3 border-warning/40 border-b bg-warning/10 px-4 py-2 text-sm text-text"
      data-notice=""
      role="status"
    >
      <p>{message}</p>
      <button
        className="c-focus-ring inline-flex items-center gap-2 font-medium text-warning underline-offset-4 hover:underline"
        disabled={disabled}
        onClick={onCta}
        type="button"
      >
        {ctaLabel}
        {shortcutKey ? <ShortcutKeys keys={shortcutKey} /> : null}
      </button>
    </div>
  );
};
