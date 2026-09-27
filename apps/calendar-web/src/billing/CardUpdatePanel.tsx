import { type FC, Suspense } from "react";
import { BillingApi } from "@web/api/billing.api";
import { getEmbeddedCheckoutComponent } from "@web/billing/embedded-checkout/embedded-checkout.seam";
import { focusOnPointerEnter } from "@web/common/utils/focus-on-pointer-enter";
import { OverlayPanelActionButton } from "@web/components/OverlayPanel/OverlayPanel";

interface CardUpdatePanelProps {
  publishableKey: string;
  onCancel: () => void;
  onComplete: () => void;
}

/**
 * Setup-mode embedded Checkout for replacing the card on file. Lives under
 * the Settings card row, not in the billing gate.
 */
export const CardUpdatePanel: FC<CardUpdatePanelProps> = ({
  publishableKey,
  onCancel,
  onComplete,
}) => {
  const EmbeddedCheckout = getEmbeddedCheckoutComponent();

  return (
    <div className="flex w-full flex-col gap-3">
      <Suspense
        fallback={
          <p className="text-sm text-text-muted">Loading checkout...</p>
        }
      >
        <EmbeddedCheckout
          className="w-full"
          fetchClientSecret={() =>
            BillingApi.createPaymentMethodSession().then((r) => r.clientSecret)
          }
          onComplete={onComplete}
          publishableKey={publishableKey}
        />
      </Suspense>
      <OverlayPanelActionButton
        onClick={onCancel}
        onPointerEnter={focusOnPointerEnter}
        variant="secondary"
      >
        Cancel
      </OverlayPanelActionButton>
    </div>
  );
};
