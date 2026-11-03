import { type FC, useCallback, useState } from "react";
import { BILLING_PLAN } from "@core/constants/billing.constants";
import { track } from "@web/auth/posthog/track";
import {
  dismissAwaitingCheckoutBannerForSession,
  isAwaitingCheckoutBannerDismissedForSession,
} from "@web/billing/awaiting-checkout-banner.util";
import { BillingBanner } from "@web/billing/BillingBanner";
import { useAppConfigQuery } from "@web/billing/billing.query";
import { formatExploreTrialBannerMessage } from "@web/billing/signup-trial-format.util";
import { TRIAL_START_PRIMARY_LABEL } from "@web/billing/TrialStartAsk";
import { requestTrialStep } from "@web/billing/trial-step-request";
import { START_TRIAL_SHORTCUT_KEY } from "@web/shortcuts/notice-focus/useNoticeActionShortcut";

/**
 * Non-blocking nudge while the account is read-only `awaiting_checkout`.
 * Writes and shortcuts open the trial step; this banner is the calm opt-in.
 * Dismiss hides it for this browser tab session only.
 */
export const BillingAwaitingCheckoutBanner: FC = () => {
  const trialLengthDays =
    useAppConfigQuery().data?.billing.trialLengthDays ??
    BILLING_PLAN.TRIAL_LENGTH_DAYS;
  const [dismissed, setDismissed] = useState(
    isAwaitingCheckoutBannerDismissedForSession,
  );

  const dismiss = useCallback(() => {
    dismissAwaitingCheckoutBannerForSession();
    setDismissed(true);
  }, []);

  if (dismissed) {
    return null;
  }

  return (
    <BillingBanner
      ctaLabel={TRIAL_START_PRIMARY_LABEL}
      dismissLabel="Dismiss"
      message={formatExploreTrialBannerMessage(trialLengthDays)}
      onCta={() => {
        track("billing_gate_cta_clicked", { cta: "explore_banner" });
        void requestTrialStep({ trigger: "banner" });
      }}
      onDismiss={dismiss}
      shortcutKey={START_TRIAL_SHORTCUT_KEY}
    />
  );
};
