import { type FC } from "react";
import { track } from "@web/auth/posthog/track";
import { BillingBanner } from "@web/billing/BillingBanner";
import { cardUpdateActions } from "@web/billing/card-update.store";
import { settingsActions } from "@web/settings/settings.store";

/**
 * Non-blocking banner during Stripe's dunning window. The account stays
 * writable; this is the only past_due UI.
 */
export const BillingPastDueBanner: FC = () => {
  return (
    <BillingBanner
      ctaLabel="Update card"
      message="Payment failed. Update your card to keep Compass after this period."
      onCta={() => {
        track("billing_gate_cta_clicked", { cta: "past_due_update_card" });
        cardUpdateActions.open();
        settingsActions.openSettings("billing");
      }}
    />
  );
};
