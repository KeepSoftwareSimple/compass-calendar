import { useQueryClient } from "@tanstack/react-query";
<<<<<<< HEAD
import { type FC, Suspense, useCallback, useRef } from "react";
=======
import {
  type FC,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
>>>>>>> 856f58d59 (feat(web): track checkout_opened and checkout_back)
import { BillingApi } from "@web/api/billing.api";
import {
  checkoutTelemetrySource,
  trackCheckoutBack,
  trackCheckoutOpened,
} from "@web/auth/posthog/signup-funnel";
import { fetchEmbeddedCheckoutSecret } from "@web/billing/checkout-client-secret";
import { useCheckoutPanelStore } from "@web/billing/checkout-panel.store";
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
<<<<<<< HEAD

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
=======
  const checkoutSource = useCheckoutPanelStore((state) => state.source);
  const telemetrySource = checkoutTelemetrySource(checkoutSource);

  useEffect(() => {
    trackCheckoutOpened({ source: telemetrySource });
  }, [telemetrySource]);

  const handleBack = useCallback(() => {
    trackCheckoutBack({ source: telemetrySource });
    onBack?.();
  }, [onBack, telemetrySource]);

  useLayoutEffect(() => {
    backButtonRef.current?.focus();
  }, []);
>>>>>>> 856f58d59 (feat(web): track checkout_opened and checkout_back)
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
          onClick={handleBack}
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
