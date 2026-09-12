import { useQueryClient } from "@tanstack/react-query";
import { type FC, Suspense, useCallback, useEffect, useRef } from "react";
import { BillingApi } from "@web/api/billing.api";
import { track } from "@web/auth/posthog/track";
import {
  startBillingStatusPoll,
  useStripePublishableKey,
} from "@web/billing/billing.query";
import { setBillingGateOwnsScreen } from "@web/billing/billing-gate-attention";
import { billingPreviewActions } from "@web/billing/billing-preview.store";
import { checkoutCelebrationActions } from "@web/billing/checkout-celebration.store";
import {
  checkoutPanelActions,
  selectCheckoutPanelOpen,
  useCheckoutPanelStore,
} from "@web/billing/checkout-panel.store";
import { getEmbeddedCheckoutComponent } from "@web/billing/embedded-checkout/embedded-checkout.seam";
import { OVERLAY_LETTER_SHORTCUT } from "@web/billing/overlay-letter-shortcut";
import { focusOnPointerEnter } from "@web/common/utils/focus-on-pointer-enter";
import { deferGoogleDelayedToastIfVisible } from "@web/common/utils/toast/google-delayed.toast";
import { deferGoogleReconnectToastIfVisible } from "@web/common/utils/toast/google-reconnect.toast";
import { OverlayPanel } from "@web/components/OverlayPanel/OverlayPanel";
import { ShortcutHint } from "@web/components/Shortcuts/ShortcutHint";
import { PixelPirateScouting } from "@web/components/WelcomeModal/PixelPirateScouting";
import { useAppLockReason } from "@web/shortcuts/app-lock";
import {
  POINTER_ACTION_ATTRIBUTE,
  POINTER_ACTIONS,
  pointerShortcutAttributes,
} from "@web/shortcuts/keyboard-only/pointer-action";
import { START_TRIAL_SHORTCUT_KEY } from "@web/shortcuts/notice-focus/useNoticeActionShortcut";
import { swallowNextKeyup } from "@web/shortcuts/swallow-next-keyup";
import { useAppShortcut } from "@web/shortcuts/useAppShortcut";

const PANEL_CLASSNAME =
  "max-w-full gap-4 border border-border bg-surface text-center text-text shadow-xl";
const SECONDARY_BUTTON_CLASSNAME =
  "c-button c-button-secondary inline-flex items-center justify-center rounded-full px-6 py-2";

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
  const queryClient = useQueryClient();
  const isCheckoutOpen = useCheckoutPanelStore(selectCheckoutPanelOpen);
  const publishableKey = useStripePublishableKey();
  const EmbeddedCheckout = getEmbeddedCheckoutComponent();

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

  const fetchClientSecret = useCallback(
    () => BillingApi.createCheckoutSession().then((r) => r.clientSecret),
    [],
  );

  const onCheckoutComplete = useCallback(() => {
    // Read before close() clears it.
    const source = useCheckoutPanelStore.getState().source;
    const attribution = {
      source: source?.kind ?? "gate",
      ...(source?.featureArea ? { feature_area: source.featureArea } : {}),
      ...(source?.actionId ? { action_id: source.actionId } : {}),
    };
    track("trial_converted", attribution);
    if (source?.kind === "shortcut_prompt") {
      track("billing_gate_shortcut_converted", attribution);
    }
    checkoutCelebrationActions.celebrate();
    checkoutPanelActions.close();
    startBillingStatusPoll(queryClient, () => {});
  }, [queryClient]);

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
      panelClassName={PANEL_CLASSNAME}
      restoreFocus={() => {
        primaryButtonRef.current?.focus({ preventScroll: true });
      }}
      widthClassName={isCheckoutOpen ? "w-[560px]" : "w-120"}
    >
      {isCheckoutOpen && publishableKey ? (
        <div className="flex w-full flex-col items-center gap-4">
          <Suspense
            fallback={
              <p className="text-sm text-text-muted">Loading checkout...</p>
            }
          >
            <EmbeddedCheckout
              className="w-full"
              fetchClientSecret={fetchClientSecret}
              onComplete={onCheckoutComplete}
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
              {...pointerShortcutAttributes(START_TRIAL_SHORTCUT_KEY)}
              {...(isAwaitingCheckout
                ? { [POINTER_ACTION_ATTRIBUTE]: POINTER_ACTIONS.startTrial }
                : {})}
            >
              {primaryLabel}
              <ShortcutHint className="ml-2">
                {START_TRIAL_SHORTCUT_KEY}
              </ShortcutHint>
            </button>
            {isAwaitingCheckout ? (
              <button
                className={SECONDARY_BUTTON_CLASSNAME}
                onClick={lookAround}
                onPointerEnter={focusOnPointerEnter}
                type="button"
                {...pointerShortcutAttributes("L")}
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
