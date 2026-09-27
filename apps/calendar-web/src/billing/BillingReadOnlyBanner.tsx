import { type FC } from "react";
import { track } from "@web/auth/posthog/track";
import { BillingBanner } from "@web/billing/BillingBanner";
import { billingPreviewActions } from "@web/billing/billing-preview.store";
import { checkoutPanelActions } from "@web/billing/checkout-panel.store";
import { START_TRIAL_SHORTCUT_KEY } from "@web/shortcuts/notice-focus/useNoticeActionShortcut";

/**
 * Shown while a gated user is looking around the real calendar. Writes still
 * fail server-side; this is the standing reminder of why, plus the way out.
 * `S` matches the billing-gate Start trial binding so look-around keeps the
 * same key after the overlay unmounts.
 */
export const BillingReadOnlyBanner: FC = () => {
  return (
    <BillingBanner
      ctaLabel="Start your free 7-day trial to save changes"
      message="You're looking around in read-only mode."
      onCta={() => {
        track("billing_gate_cta_clicked", { cta: "banner_checkout" });
        billingPreviewActions.exit();
        checkoutPanelActions.open({ kind: "banner" });
      }}
      shortcutKey={START_TRIAL_SHORTCUT_KEY}
    />
  );
};
