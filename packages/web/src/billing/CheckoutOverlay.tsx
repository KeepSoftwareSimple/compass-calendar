import { useQueryClient } from "@tanstack/react-query";
import { type FC, Suspense, useCallback } from "react";
import { BillingApi } from "@web/api/billing.api";
import { useStripePublishableKey } from "@web/billing/billing.query";
import {
  checkoutPanelActions,
  selectCheckoutPanelOpen,
  useCheckoutPanelStore,
} from "@web/billing/checkout-panel.store";
import { completeCheckoutSession } from "@web/billing/complete-checkout-session";
import { getEmbeddedCheckoutComponent } from "@web/billing/embedded-checkout/embedded-checkout.seam";
import { focusOnPointerEnter } from "@web/common/utils/focus-on-pointer-enter";
import { OverlayPanel } from "@web/components/OverlayPanel/OverlayPanel";

const PANEL_CLASSNAME =
  "max-w-full gap-4 border border-border bg-surface text-center text-text shadow-xl";
const SECONDARY_BUTTON_CLASSNAME =
  "c-button c-button-secondary inline-flex items-center justify-center rounded-full px-6 py-2";

/**
 * Embedded Checkout for writable sessions (local trial banner, Subscribe now).
 * The billing gate keeps its own overlay; this one mounts only when that gate
 * is not on screen.
 */
export const CheckoutOverlay: FC = () => {
  const queryClient = useQueryClient();
  const isOpen = useCheckoutPanelStore(selectCheckoutPanelOpen);
  const publishableKey = useStripePublishableKey();
  const EmbeddedCheckout = getEmbeddedCheckoutComponent();

  const fetchClientSecret = useCallback(
    () => BillingApi.createCheckoutSession().then((r) => r.clientSecret),
    [],
  );

  const onComplete = useCallback(() => {
    completeCheckoutSession(queryClient);
  }, [queryClient]);

  if (!isOpen || !publishableKey) return null;

  return (
    <OverlayPanel
      align="center"
      ariaLabel="Checkout"
      backdropClassName="overflow-y-auto"
      onDismiss={checkoutPanelActions.close}
      panelClassName={PANEL_CLASSNAME}
      widthClassName="w-[560px]"
    >
      <div className="flex w-full flex-col items-center gap-4">
        <Suspense
          fallback={
            <p className="text-sm text-text-muted">Loading checkout...</p>
          }
        >
          <EmbeddedCheckout
            className="w-full"
            fetchClientSecret={fetchClientSecret}
            onComplete={onComplete}
            publishableKey={publishableKey}
          />
        </Suspense>
        <button
          className={SECONDARY_BUTTON_CLASSNAME}
          onClick={checkoutPanelActions.close}
          onPointerEnter={focusOnPointerEnter}
          type="button"
        >
          Back
        </button>
      </div>
    </OverlayPanel>
  );
};
