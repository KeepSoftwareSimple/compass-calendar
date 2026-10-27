import { type FC, type RefObject, useEffect, useRef } from "react";
import { BILLING_PLAN } from "@core/constants/billing.constants";
import { trackTrialStepViewed } from "@web/auth/posthog/signup-funnel";
import {
  useAppConfigQuery,
  useBillingSubscriptionQuery,
  useStripePublishableKey,
} from "@web/billing/billing.query";
import {
  type CheckoutPanelSource,
  checkoutPanelActions,
  selectCheckoutPanelOpen,
  useCheckoutPanelStore,
} from "@web/billing/checkout-panel.store";
import { EmbeddedCheckoutPanel } from "@web/billing/EmbeddedCheckoutPanel";
import { OVERLAY_LETTER_SHORTCUT } from "@web/billing/overlay-letter-shortcut";
import { readSignupTrialMethod } from "@web/billing/signup-trial.util";
import {
  formatTrialStartPriceLine,
  resolveBillingDisplayPrice,
  type TrialStartPriceLineContext,
} from "@web/billing/trial-start-display.util";
import {
  consumeTrialStepTrigger,
  TRIAL_STEP_WRITE_LEAD,
} from "@web/billing/trial-step-request";
import { focusOnPointerEnter } from "@web/common/utils/focus-on-pointer-enter";
import { ShortcutHint } from "@web/components/Shortcuts/ShortcutHint";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
import { PixelPirateScouting } from "@web/components/WelcomeModal/PixelPirateScouting";
import { START_TRIAL_SHORTCUT_KEY } from "@web/shortcuts/notice-focus/useNoticeActionShortcut";
import { useAppShortcut } from "@web/shortcuts/useAppShortcut";

export const TRIAL_START_PRIMARY_LABEL = "Start free trial";

type TrialStartAskProps = {
  /** Gate modal shows its own title; signup uses AuthModal title. */
  showTitle?: boolean;
  title?: string;
  checkoutSource: CheckoutPanelSource | null;
  onCheckoutComplete?: () => void;
  primaryButtonRef?: RefObject<HTMLButtonElement | null>;
  showMascot?: boolean;
  trackSignupView?: boolean;
  onBeforeOpenCheckout?: () => void;
  priceLineContext?: TrialStartPriceLineContext;
  /** OverlayPanel seats focus here so plain Enter does not activate Start. */
  initialFocusRef?: RefObject<HTMLElement | null>;
};

/**
 * One-button trial ask shared by signup, the billing gate, and Settings.
 * Opens embedded Checkout only after the primary CTA; Back returns here.
 */
export const TrialStartAsk: FC<TrialStartAskProps> = ({
  showTitle = false,
  title,
  checkoutSource,
  onCheckoutComplete,
  primaryButtonRef,
  showMascot = false,
  trackSignupView = false,
  onBeforeOpenCheckout,
  priceLineContext = "default",
  initialFocusRef,
}) => {
  const isCheckoutOpen = useCheckoutPanelStore(selectCheckoutPanelOpen);
  const publishableKey = useStripePublishableKey();
  const configQuery = useAppConfigQuery();
  const subscriptionQuery = useBillingSubscriptionQuery(true);
  const trialLengthDays =
    configQuery.data?.billing.trialLengthDays ?? BILLING_PLAN.TRIAL_LENGTH_DAYS;
  const priceLine = formatTrialStartPriceLine(
    resolveBillingDisplayPrice(subscriptionQuery.data?.price),
    trialLengthDays,
    priceLineContext,
  );
  const viewedRef = useRef(false);
  const writeLeadRef = useRef(consumeTrialStepTrigger() === "write");

  useEffect(() => {
    if (!trackSignupView || viewedRef.current) return;
    viewedRef.current = true;
    trackTrialStepViewed({
      source: "signup_trial_step",
      method: readSignupTrialMethod(),
    });
  }, [trackSignupView]);

  const openCheckout = () => {
    onBeforeOpenCheckout?.();
    checkoutPanelActions.open(checkoutSource);
  };

  useAppShortcut(
    START_TRIAL_SHORTCUT_KEY,
    () => {
      if (isCheckoutOpen) return;
      openCheckout();
    },
    OVERLAY_LETTER_SHORTCUT,
  );

  if (isCheckoutOpen && publishableKey) {
    return (
      <EmbeddedCheckoutPanel
        onBack={checkoutPanelActions.close}
        onCheckoutComplete={onCheckoutComplete}
        publishableKey={publishableKey}
      />
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div
        ref={initialFocusRef as RefObject<HTMLDivElement>}
        aria-hidden
        className="sr-only outline-none"
        tabIndex={-1}
      />
      {showMascot ? <PixelPirateScouting className="h-14 w-14" /> : null}
      {showTitle && title ? (
        <h1 className="font-medium text-xl">{title}</h1>
      ) : null}
      {writeLeadRef.current ? (
        <p className="w-full text-center text-sm text-text">
          {TRIAL_STEP_WRITE_LEAD}
        </p>
      ) : null}
      <p className="w-full text-center text-sm text-text-muted">{priceLine}</p>
      <div className="mt-2 flex w-full flex-col gap-2">
        <button
          ref={primaryButtonRef}
          className="c-button c-button-primary c-button-elevated inline-flex items-center justify-center rounded-full px-6 py-2"
          onClick={openCheckout}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.metaKey &&
              !event.ctrlKey &&
              !event.altKey &&
              !event.shiftKey
            ) {
              event.preventDefault();
            }
          }}
          onPointerEnter={focusOnPointerEnter}
          type="button"
        >
          {TRIAL_START_PRIMARY_LABEL}
          <ShortcutHint className="ml-2 pointer-coarse:hidden">
            {START_TRIAL_SHORTCUT_KEY}
          </ShortcutHint>
          <ShortcutKeys className="ml-2" keys={["Mod", "Enter"]} />
        </button>
      </div>
    </div>
  );
};
