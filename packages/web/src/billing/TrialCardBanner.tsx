import { type FC, useEffect, useRef, useState } from "react";
import { track } from "@web/auth/posthog/track";
import { checkoutPanelActions } from "@web/billing/checkout-panel.store";
import { OVERLAY_LETTER_SHORTCUT } from "@web/billing/overlay-letter-shortcut";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
import {
  POINTER_ACTION_ATTRIBUTE,
  POINTER_ACTIONS,
  pointerShortcutAttributes,
} from "@web/shortcuts/keyboard-only/pointer-action";
import { START_TRIAL_SHORTCUT_KEY } from "@web/shortcuts/notice-focus/useNoticeActionShortcut";
import { useAppShortcut } from "@web/shortcuts/useAppShortcut";

function trialCardBannerMessage(daysLeft: number): string {
  if (daysLeft <= 0) {
    return "Your trial ends today. Add a card to keep creating events.";
  }
  if (daysLeft === 1) {
    return "Your trial ends in 1 day. Add a card to keep creating events.";
  }
  return `Your trial ends in ${daysLeft} days. Add a card to keep creating events.`;
}

/**
 * Non-blocking ask to add a card while a local trial still has three or
 * fewer days left. Dismiss lasts for this tab session only.
 */
export const TrialCardBanner: FC<{ daysLeft: number }> = ({ daysLeft }) => {
  const [dismissed, setDismissed] = useState(false);
  const shownRef = useRef(false);

  useEffect(() => {
    if (shownRef.current) return;
    shownRef.current = true;
    track("billing_gate_shown", { status: "trial_ending" });
  }, []);

  const openCheckout = () => {
    track("billing_gate_cta_clicked", { cta: "trial_banner_checkout" });
    checkoutPanelActions.open({ kind: "trial_banner" });
  };

  useAppShortcut(
    START_TRIAL_SHORTCUT_KEY,
    () => {
      if (dismissed) return;
      openCheckout();
    },
    OVERLAY_LETTER_SHORTCUT,
  );

  if (dismissed) return null;

  return (
    <div
      className="flex items-center justify-center gap-3 border-warning/40 border-b bg-warning/10 px-4 py-2 text-sm text-text"
      data-notice=""
      role="status"
    >
      <p>{trialCardBannerMessage(daysLeft)}</p>
      <button
        className="c-focus-ring inline-flex items-center gap-2 font-medium text-warning underline-offset-4 hover:underline"
        onClick={openCheckout}
        type="button"
        {...pointerShortcutAttributes(START_TRIAL_SHORTCUT_KEY)}
        {...{ [POINTER_ACTION_ATTRIBUTE]: POINTER_ACTIONS.startTrial }}
      >
        Add a card
        <ShortcutKeys keys={START_TRIAL_SHORTCUT_KEY} />
      </button>
      <button
        className="c-focus-ring font-medium text-text-muted underline-offset-4 hover:underline"
        onClick={() => setDismissed(true)}
        type="button"
      >
        Dismiss
      </button>
    </div>
  );
};
