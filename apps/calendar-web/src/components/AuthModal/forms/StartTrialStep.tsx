import { useQuery } from "@tanstack/react-query";
import { type FC, useEffect, useRef } from "react";
import { type BillingSubscriptionResponse } from "@core/types/billing.types";
import dayjs from "@core/util/date/dayjs";
import {
  trackTrialStepAbandoned,
  trackTrialStepViewed,
} from "@web/auth/posthog/signup-funnel";
import {
  billingSubscriptionQueryOptions,
  useAppConfigQuery,
  useStripePublishableKey,
} from "@web/billing/billing.query";
import { formatBillingMoney } from "@web/billing/billing-display";
import { checkoutPanelActions } from "@web/billing/checkout-panel.store";
import {
  EMBEDDED_CHECKOUT_PANEL_CLASSNAME,
  EmbeddedCheckoutPanel,
} from "@web/billing/EmbeddedCheckoutPanel";
import { readSignupTrialMethod } from "@web/billing/signup-trial.util";

type BillingPrice = NonNullable<BillingSubscriptionResponse["price"]>;

/** Charge date copy: "Monday, September 29" from trial length and a reference instant. */
export function formatTrialChargeDate(
  trialLengthDays: number,
  now: dayjs.Dayjs = dayjs(),
): string {
  return now.add(trialLengthDays, "day").format("dddd, MMMM D");
}

/** Same shape as Settings > Billing plan price line. */
export function formatSignupTrialPlanPrice(
  price: BillingPrice | null | undefined,
): string | null {
  if (!price) return null;
  return `${formatBillingMoney(price.amount, price.currency)} per ${price.interval}`;
}

type StartTrialStepProps = {
  onDismiss: () => void;
};

/**
 * Post-signup trial step: charge-date copy and embedded Checkout inside AuthModal.
 */
export const StartTrialStep: FC<StartTrialStepProps> = ({ onDismiss }) => {
  const signupMethod = readSignupTrialMethod();
  const configQuery = useAppConfigQuery();
  const trialLengthDays = configQuery.data?.billing.trialLengthDays ?? 7;
  const chargeDateLabel = formatTrialChargeDate(trialLengthDays);
  const publishableKey = useStripePublishableKey();
  const subscriptionQuery = useQuery({
    ...billingSubscriptionQueryOptions(),
    enabled: true,
  });
  const planPriceLine = formatSignupTrialPlanPrice(
    subscriptionQuery.data?.price,
  );
  const viewedRef = useRef(false);

  useEffect(() => {
    checkoutPanelActions.holdSource({ kind: "signup_trial_step" });
    return () => {
      checkoutPanelActions.close();
    };
  }, []);

  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    trackTrialStepViewed({ source: "signup_trial_step", method: signupMethod });
  }, [signupMethod]);

  const handleDismiss = () => {
    trackTrialStepAbandoned({
      source: "signup_trial_step",
      method: signupMethod,
    });
    onDismiss();
  };

  return (
    <div
      className={`flex w-full flex-col items-center gap-4 ${EMBEDDED_CHECKOUT_PANEL_CLASSNAME}`}
    >
      <p className="text-sm text-text-muted">
        Your card will not be charged until {chargeDateLabel}. Cancel anytime
        from Settings and you will not be billed.
      </p>
      {planPriceLine ? (
        <p className="text-sm text-text">{planPriceLine}</p>
      ) : null}
      {publishableKey ? (
        <EmbeddedCheckoutPanel
          onBack={handleDismiss}
          onCheckoutComplete={onDismiss}
          publishableKey={publishableKey}
        />
      ) : (
        <p className="text-sm text-text-muted">Loading checkout...</p>
      )}
    </div>
  );
};
