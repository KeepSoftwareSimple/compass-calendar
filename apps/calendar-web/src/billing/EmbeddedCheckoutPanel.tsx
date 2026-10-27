import { useQueryClient } from "@tanstack/react-query";
import { type FC, Suspense, useCallback, useRef } from "react";
import { BillingApi } from "@web/api/billing.api";
import { fetchEmbeddedCheckoutSecret } from "@web/billing/checkout-client-secret";
import { completeCheckoutSession } from "@web/billing/complete-checkout-session";
import { getEmbeddedCheckoutComponent } from "@web/billing/embedded-checkout/embedded-checkout.seam";
import { focusOnPointerEnter } from "@web/common/utils/focus-on-pointer-enter";
import { ShortcutHint } from "@web/components/Shortcuts/ShortcutHint";
import { useAppShortcut } from "@web/shortcuts/useAppShortcut";

export const EMBEDDED_CHECKOUT_PANEL_CLASSNAME =
  "max-w-full gap-4 border border-border bg-surface text-center text-text shadow-xl";
const SECONDARY_BUTTON_CLASSNAME =
  "c-button c-button-secondary inline-flex items-center justify-center rounded-full px-6 py-2";

const fetchCheckoutClientSecret = fetchEmbeddedCheckoutSecret(
  BillingApi.createCheckoutSession,
);

type EmbeddedCheckoutPanelProps = {
  publishableKey: string;
  onBack?: () => void;
  onCheckoutComplete?: () => void;
};

/**
 * Checkout plus Back. The billing gate and CheckoutOverlay both host this
 * same panel; only the surrounding OverlayPanel differs.
 */
export const EmbeddedCheckoutPanel: FC<EmbeddedCheckoutPanelProps> = ({
  publishableKey,
  onBack,
  onCheckoutComplete,
}) => {
  const backButtonRef = useRef<HTMLButtonElement>(null);

  useAppShortcut(
    "Escape",
    () => {
      onBack?.();
    },
    {
      enabled: Boolean(onBack),
      ignoreAppLock: true,
      preventDefault: true,
      stopPropagation: true,
    },
  );
  const queryClient = useQueryClient();
  const EmbeddedCheckout = getEmbeddedCheckoutComponent();
  const onComplete = useCallback(() => {
    completeCheckoutSession(queryClient);
    onCheckoutComplete?.();
  }, [onCheckoutComplete, queryClient]);

  return (
    <div className="flex w-full flex-col items-stretch gap-4">
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
      {onBack ? (
        <button
          ref={backButtonRef}
          className={`${SECONDARY_BUTTON_CLASSNAME} self-center`}
          onClick={onBack}
          onPointerEnter={focusOnPointerEnter}
          type="button"
        >
          Back
          <ShortcutHint className="ml-2 pointer-coarse:hidden">
            Esc
          </ShortcutHint>
        </button>
      ) : null}
    </div>
  );
};
