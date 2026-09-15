import { type FC } from "react";
import { useStripePublishableKey } from "@web/billing/billing.query";
import {
  checkoutPanelActions,
  selectCheckoutPanelOpen,
  useCheckoutPanelStore,
} from "@web/billing/checkout-panel.store";
import {
  EMBEDDED_CHECKOUT_PANEL_CLASSNAME,
  EmbeddedCheckoutPanel,
} from "@web/billing/EmbeddedCheckoutPanel";
import { OverlayPanel } from "@web/components/OverlayPanel/OverlayPanel";

/**
 * Embedded Checkout for writable sessions (local trial banner, Subscribe now).
 * The billing gate keeps its own overlay; this one mounts only when that gate
 * is not on screen.
 */
export const CheckoutOverlay: FC = () => {
  const isOpen = useCheckoutPanelStore(selectCheckoutPanelOpen);
  const publishableKey = useStripePublishableKey();

  if (!isOpen || !publishableKey) return null;

  return (
    <OverlayPanel
      align="center"
      ariaLabel="Checkout"
      backdropClassName="overflow-y-auto"
      onDismiss={checkoutPanelActions.close}
      panelClassName={EMBEDDED_CHECKOUT_PANEL_CLASSNAME}
      widthClassName="w-[560px]"
    >
      <EmbeddedCheckoutPanel
        onBack={checkoutPanelActions.close}
        publishableKey={publishableKey}
      />
    </OverlayPanel>
  );
};
