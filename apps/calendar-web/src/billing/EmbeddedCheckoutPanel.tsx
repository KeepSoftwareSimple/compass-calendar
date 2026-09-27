import { useQueryClient } from "@tanstack/react-query";
import { type FC, Suspense, useCallback } from "react";
import { BillingApi } from "@web/api/billing.api";
import { completeCheckoutSession } from "@web/billing/complete-checkout-session";
import { getEmbeddedCheckoutComponent } from "@web/billing/embedded-checkout/embedded-checkout.seam";
import { focusOnPointerEnter } from "@web/common/utils/focus-on-pointer-enter";

export const EMBEDDED_CHECKOUT_PANEL_CLASSNAME =
  "max-w-full gap-4 border border-border bg-surface text-center text-text shadow-xl";
export const EMBEDDED_CHECKOUT_SECONDARY_BUTTON_CLASSNAME =
  "c-button c-button-secondary inline-flex items-center justify-center rounded-full px-6 py-2";

const fetchCheckoutClientSecret = () =>
  BillingApi.createCheckoutSession().then((response) => response.clientSecret);

type EmbeddedCheckoutPanelProps = {
  publishableKey: string;
  onBack: () => void;
};

/**
 * Writable-session Checkout plus Back. The billing gate and the trial-banner
 * overlay both host this same panel; only the surrounding OverlayPanel differs.
 */
export const EmbeddedCheckoutPanel: FC<EmbeddedCheckoutPanelProps> = ({
  publishableKey,
  onBack,
}) => {
  const queryClient = useQueryClient();
  const EmbeddedCheckout = getEmbeddedCheckoutComponent();
  const onComplete = useCallback(() => {
    completeCheckoutSession(queryClient);
  }, [queryClient]);

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <Suspense
        fallback={
          <p className="text-sm text-text-muted">Loading checkout...</p>
        }
      >
        <EmbeddedCheckout
          className="w-full"
          fetchClientSecret={fetchCheckoutClientSecret}
          onComplete={onComplete}
          publishableKey={publishableKey}
        />
      </Suspense>
      <button
        className={EMBEDDED_CHECKOUT_SECONDARY_BUTTON_CLASSNAME}
        onClick={onBack}
        onPointerEnter={focusOnPointerEnter}
        type="button"
      >
        Back
      </button>
    </div>
  );
};
