import { type FC, type RefObject, useEffect } from "react";
import { checkoutPanelActions } from "@web/billing/checkout-panel.store";
import { TrialStartAsk } from "@web/billing/TrialStartAsk";

type StartTrialStepProps = {
  onDismiss: () => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
};

/** Post-signup trial step inside AuthModal. */
export const StartTrialStep: FC<StartTrialStepProps> = ({
  onDismiss,
  initialFocusRef,
}) => {
  useEffect(
    () => () => {
      checkoutPanelActions.close();
    },
    [],
  );

  return (
    <TrialStartAsk
      checkoutSource={{ kind: "signup_trial_step" }}
      initialFocusRef={initialFocusRef}
      onCheckoutComplete={onDismiss}
      trackSignupView
    />
  );
};
