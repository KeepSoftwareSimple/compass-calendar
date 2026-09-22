import { type FC, useEffect, useRef } from "react";
import { track } from "@web/auth/posthog/track";
import { useStripePublishableKey } from "@web/billing/billing.query";
import { setBillingGateOwnsScreen } from "@web/billing/billing-gate-attention";
import { billingPreviewActions } from "@web/billing/billing-preview.store";
import {
  checkoutPanelActions,
  selectCheckoutPanelOpen,
  useCheckoutPanelStore,
} from "@web/billing/checkout-panel.store";
import {
  EMBEDDED_CHECKOUT_PANEL_CLASSNAME,
  EMBEDDED_CHECKOUT_SECONDARY_BUTTON_CLASSNAME,
  EmbeddedCheckoutPanel,
} from "@web/billing/EmbeddedCheckoutPanel";
import { OVERLAY_LETTER_SHORTCUT } from "@web/billing/overlay-letter-shortcut";
import { focusOnPointerEnter } from "@web/common/utils/focus-on-pointer-enter";
import { deferGoogleDelayedToastIfVisible } from "@web/common/utils/toast/google-delayed.toast";
import { deferGoogleReconnectToastIfVisible } from "@web/common/utils/toast/google-reconnect.toast";
import { OverlayPanel } from "@web/components/OverlayPanel/OverlayPanel";
import { ShortcutHint } from "@web/components/Shortcuts/ShortcutHint";
import { PixelPirateScouting } from "@web/components/WelcomeModal/PixelPirateScouting";
import { useAppLockReason } from "@web/shortcuts/app-lock";
import { START_TRIAL_SHORTCUT_KEY } from "@web/shortcuts/notice-focus/useNoticeActionShortcut";
import { swallowNextKeyup } from "@web/shortcuts/swallow-next-keyup";
import { useAppShortcut } from "@web/shortcuts/useAppShortcut";

type BillingGateModalProps = {
  status: string;
};

/**
 * App-lock overlay for signed-in users who cannot write (awaiting checkout,
 * expired, canceled). Escape and the backdrop do nothing while the ask is
 * showing; once Checkout is open, Back (and Escape) return to the buttons.
 * A user who has not started a trial yet can step past it into a read-only
 * look around the real calendar; the first refused write brings it back.
 */
export const BillingGateModal: FC<BillingGateModalProps> = ({ status }) => {
  useAppLockReason("billingGate", true);
  const primaryButtonRef = useRef<HTMLButtonElement>(null);
  const shownRef = useRef(false);
  const isCheckoutOpen = useCheckoutPanelStore(selectCheckoutPanelOpen);
  const publishableKey = useStripePublishableKey();

  const isAwaitingCheckout = status === "awaiting_checkout";
  const title = isAwaitingCheckout
    ? "Start your 7-day trial"
    : "Subscribe to keep using Compass";
  const body = isAwaitingCheckout
    ? "Start a free 7-day trial to create and edit events, including keyboard shortcuts."
    : "Your trial has ended. Subscribe to keep creating and editing events, including keyboard shortcuts.";
  const primaryLabel = isAwaitingCheckout ? "Start trial" : "Subscribe";

  useEffect(() => {
    if (!shownRef.current) {
      shownRef.current = true;
      track("billing_gate_shown", { status });
    }
  }, [status]);

  useEffect(() => {
    setBillingGateOwnsScreen(true);
    deferGoogleReconnectToastIfVisible();
    deferGoogleDelayedToastIfVisible();
    return () => setBillingGateOwnsScreen(false);
  }, []);

  const lookAround = () => {
    track("billing_gate_cta_clicked", { cta: "preview" });
    billingPreviewActions.enter();
  };

  const openCheckout = () => {
    track("billing_gate_cta_clicked", { cta: "checkout" });
    checkoutPanelActions.open();
  };

  useAppShortcut(
    START_TRIAL_SHORTCUT_KEY,
    () => {
      if (isCheckoutOpen) return;
      openCheckout();
    },
    OVERLAY_LETTER_SHORTCUT,
  );

  useAppShortcut(
    "L",
    () => {
      if (isCheckoutOpen) return;
      swallowNextKeyup("l");
      lookAround();
    },
    { ...OVERLAY_LETTER_SHORTCUT, enabled: isAwaitingCheckout },
  );

  return (
    <OverlayPanel
      align="center"
      ariaLabel={title}
      backdropClassName={isCheckoutOpen ? "overflow-y-auto" : undefined}
      initialFocusRef={primaryButtonRef}
      onDismiss={isCheckoutOpen ? checkoutPanelActions.close : undefined}
      panelClassName={EMBEDDED_CHECKOUT_PANEL_CLASSNAME}
      restoreFocus={() => {
        primaryButtonRef.current?.focus({ preventScroll: true });
      }}
      widthClassName={isCheckoutOpen ? "w-[560px]" : "w-120"}
    >
      {isCheckoutOpen && publishableKey ? (
        <EmbeddedCheckoutPanel
          onBack={checkoutPanelActions.close}
          publishableKey={publishableKey}
        />
      ) : (
        <div className="flex w-full flex-col items-center gap-4">
          <PixelPirateScouting className="h-14 w-14" />
          <h1 className="font-medium text-xl">{title}</h1>
          <p className="text-sm text-text-muted">{body}</p>
          <div className="mt-2 flex w-full flex-col gap-2">
            <button
              ref={primaryButtonRef}
              className="c-button c-button-primary c-button-elevated inline-flex items-center justify-center rounded-full px-6 py-2"
              onClick={openCheckout}
              onPointerEnter={focusOnPointerEnter}
              type="button"
            >
              {primaryLabel}
              <ShortcutHint className="ml-2">
                {START_TRIAL_SHORTCUT_KEY}
              </ShortcutHint>
            </button>
            {isAwaitingCheckout ? (
              <button
                className={EMBEDDED_CHECKOUT_SECONDARY_BUTTON_CLASSNAME}
                onClick={lookAround}
                onPointerEnter={focusOnPointerEnter}
                type="button"
              >
                Look around first
                <ShortcutHint className="ml-2">L</ShortcutHint>
              </button>
            ) : null}
          </div>
        </div>
      )}
    </OverlayPanel>
  );
};
