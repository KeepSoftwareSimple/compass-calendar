import { useQueryClient } from "@tanstack/react-query";
import { type FC, useEffect, useRef, useState } from "react";
import { BILLING_PLAN } from "@core/constants/billing.constants";
import dayjs from "@core/util/date/dayjs";
import { BillingApi } from "@web/api/billing.api";
import { track } from "@web/auth/posthog/track";
import {
  billingQueryKeys,
  startBillingStatusPoll,
  useAppConfigQuery,
  useBillingSubscriptionQuery,
  useStripePublishableKey,
} from "@web/billing/billing.query";
import {
  formatBillingDate,
  formatBillingMoney,
  formatBillingPriceLine,
  formatCardOnFile,
  formatInvoiceStatus,
} from "@web/billing/billing-display";
import { showBillingRequestError } from "@web/billing/billing-request-error";
import { CancelSubscriptionDialog } from "@web/billing/CancelSubscriptionDialog";
import { CardUpdatePanel } from "@web/billing/CardUpdatePanel";
import {
  cardUpdateActions,
  selectCardUpdateOpen,
  useCardUpdateStore,
} from "@web/billing/card-update.store";
import {
  checkoutPanelActions,
  selectCheckoutPanelOpen,
  useCheckoutPanelStore,
} from "@web/billing/checkout-panel.store";
import { EMBEDDED_CHECKOUT_PANEL_CLASSNAME } from "@web/billing/EmbeddedCheckoutPanel";
import {
  getPlanBadge,
  PLAN_BADGE_TONE_CLASSNAME,
} from "@web/billing/planBadge";
import {
  TRIAL_START_PRIMARY_LABEL,
  TrialStartAsk,
} from "@web/billing/TrialStartAsk";
import { trackSubscriptionCancelReasonSubmitted } from "@web/billing/track-subscription-cancel-reason";
import {
  formatTrialStartPriceLine,
  resolveBillingDisplayPrice,
} from "@web/billing/trial-start-display.util";
import { useAppAccess } from "@web/billing/useAppAccess";
import {
  BILLING_CARD_UPDATED_TOAST_ID,
  BILLING_PLAN_ENDS_TOAST_ID,
  BILLING_PLAN_RENEWS_TOAST_ID,
} from "@web/common/constants/toast.constants";
import { showStatusToast } from "@web/common/utils/toast/status-toast.util";
import {
  OverlayPanel,
  OverlayPanelActionButton,
  OverlayPanelActions,
} from "@web/components/OverlayPanel/OverlayPanel";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
import {
  selectSettingsPage,
  useSettingsStore,
} from "@web/settings/settings.store";
import { settingsShortcutAttrs } from "@web/settings/useSettingsShortcuts";

const MANAGEABLE_STATUSES = new Set(["trialing", "active", "past_due"]);

interface PlanSectionProps {
  showShortcuts?: boolean;
}

/**
 * Settings > Billing: plan, card on file, cancel or resume at period end,
 * and receipts. Renders nothing when there is no plan to report (self-hosted,
 * enforcement paused, anonymous).
 */
export const PlanSection: FC<PlanSectionProps> = ({
  showShortcuts = false,
}) => {
  const access = useAppAccess();
  const page = useSettingsStore(selectSettingsPage);
  const queryClient = useQueryClient();
  const badge = getPlanBadge(access);
  const publishableKey = useStripePublishableKey();
  const isCardUpdateOpen = useCardUpdateStore(selectCardUpdateOpen);
  const updateCardButtonRef = useRef<HTMLButtonElement>(null);
  const stopCardPollRef = useRef<(() => void) | null>(null);
  const wasCardUpdateOpen = useRef(false);
  const isAwaitingCheckout =
    access.kind === "server" && access.status === "awaiting_checkout";
  const subscriptionQuery = useBillingSubscriptionQuery(
    page === "billing" && access.kind === "server",
  );
  const configQuery = useAppConfigQuery();
  const isTrialCheckoutOpen = useCheckoutPanelStore(selectCheckoutPanelOpen);
  const trialLengthDays =
    configQuery.data?.billing.trialLengthDays ?? BILLING_PLAN.TRIAL_LENGTH_DAYS;
  const trialPriceLine = formatTrialStartPriceLine(
    resolveBillingDisplayPrice(subscriptionQuery.data?.price),
    trialLengthDays,
    "settings",
  );
  const showPlanLoading = subscriptionQuery.isPending && !isAwaitingCheckout;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [trialAskOpen, setTrialAskOpen] = useState(false);
  const startTrialButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!subscriptionQuery.isError) return;
    showBillingRequestError(
      subscriptionQuery.error,
      "Couldn't load billing details.",
    );
  }, [subscriptionQuery.error, subscriptionQuery.isError]);

  useEffect(() => {
    if (wasCardUpdateOpen.current && !isCardUpdateOpen) {
      updateCardButtonRef.current?.focus({ preventScroll: true });
    }
    wasCardUpdateOpen.current = isCardUpdateOpen;
  }, [isCardUpdateOpen]);

  useEffect(
    () => () => {
      stopCardPollRef.current?.();
    },
    [],
  );

  useEffect(() => {
    if (!trialAskOpen) {
      checkoutPanelActions.close();
    }
  }, [trialAskOpen]);

  if (!badge) return null;

  const trialEndsAt =
    access.kind === "server" && access.status === "trialing"
      ? access.trialEndsAt
      : null;
  const cancelScheduled =
    access.kind === "server" && access.cancelAtPeriodEnd === true;
  const summary = subscriptionQuery.data;
  const periodEnd = summary?.currentPeriodEnd ?? trialEndsAt;
  const periodEndLabel = periodEnd ? formatBillingDate(periodEnd) : null;
  const canManageCancellation =
    summary != null && MANAGEABLE_STATUSES.has(summary.subscriptionStatus);
  const receipts = summary?.invoices.slice(0, 12) ?? [];

  const closeTrialAsk = () => {
    checkoutPanelActions.close();
    setTrialAskOpen(false);
    startTrialButtonRef.current?.focus({ preventScroll: true });
  };

  const closeConfirm = () => {
    if (isSubmitting) return;
    setConfirmOpen(false);
  };

  const handleCancelConfirm = (
    reasonSubmission?: Parameters<
      typeof trackSubscriptionCancelReasonSubmitted
    >[0],
  ) => {
    if (isSubmitting || !periodEndLabel) return;
    setIsSubmitting(true);
    void (async () => {
      try {
        if (reasonSubmission) {
          trackSubscriptionCancelReasonSubmitted(reasonSubmission);
        }
        await BillingApi.cancelSubscription();
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: billingQueryKeys.status }),
          queryClient.invalidateQueries({
            queryKey: billingQueryKeys.subscription,
          }),
        ]);
        track("billing_cancel_scheduled");
        showStatusToast(
          BILLING_PLAN_ENDS_TOAST_ID,
          `Your plan ends on ${periodEndLabel}`,
        );
        setConfirmOpen(false);
      } catch (error) {
        showBillingRequestError(error, "Couldn't cancel your plan.");
      } finally {
        setIsSubmitting(false);
      }
    })();
  };

  const handleResume = () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    void (async () => {
      try {
        await BillingApi.resumeSubscription();
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: billingQueryKeys.status }),
          queryClient.invalidateQueries({
            queryKey: billingQueryKeys.subscription,
          }),
        ]);
        track("billing_resumed");
        showStatusToast(BILLING_PLAN_RENEWS_TOAST_ID, "Your plan will renew");
      } catch (error) {
        showBillingRequestError(error, "Couldn't resume your plan.");
      } finally {
        setIsSubmitting(false);
      }
    })();
  };

  const handleCardUpdateComplete = () => {
    cardUpdateActions.close();
    track("billing_card_update_completed");
    showStatusToast(BILLING_CARD_UPDATED_TOAST_ID, "Card updated");
    stopCardPollRef.current?.();
    stopCardPollRef.current = startBillingStatusPoll(queryClient, {
      queryKey: billingQueryKeys.subscription,
      onWindowEnd: () => {
        stopCardPollRef.current = null;
      },
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-1 block text-sm text-text">Plan</p>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span
              className={`shrink-0 rounded border border-border px-1.5 text-xs ${PLAN_BADGE_TONE_CLASSNAME[badge.tone]}`}
            >
              {badge.label}
            </span>
            {isAwaitingCheckout ? (
              <p className="mt-1 text-sm text-text-muted">{trialPriceLine}</p>
            ) : summary?.price ? (
              <p className="mt-1 text-sm text-text">
                {formatBillingPriceLine(summary.price)}
              </p>
            ) : null}
            {summary?.currentPeriodEnd ? (
              <p className="mt-1 text-text-muted text-xs">
                {summary.cancelAtPeriodEnd ? "Ends" : "Renews"}{" "}
                {formatBillingDate(summary.currentPeriodEnd)}
              </p>
            ) : null}
            {trialEndsAt ? (
              <p className="mt-1 text-text-muted text-xs">
                Your trial ends {dayjs(trialEndsAt).format("MMM D, YYYY")}
                {cancelScheduled ? " and will not renew" : ""}. Press{" "}
                <ShortcutKeys keys="B" /> to subscribe now.
              </p>
            ) : null}
            {showPlanLoading ? (
              <p className="mt-1 text-text-muted text-xs">Loading your plan</p>
            ) : null}
          </div>
        </div>
      </div>

      {isAwaitingCheckout ? (
        <OverlayPanelActions align="start">
          <OverlayPanelActionButton
            ref={startTrialButtonRef}
            onClick={() => setTrialAskOpen(true)}
            shortcut="S"
            showShortcut
            variant="primary"
            {...settingsShortcutAttrs("start-trial")}
          >
            {TRIAL_START_PRIMARY_LABEL}
          </OverlayPanelActionButton>
        </OverlayPanelActions>
      ) : null}

      {summary && !isAwaitingCheckout ? (
        <>
          <p className="text-sm text-text">
            {summary.paymentMethod
              ? formatCardOnFile(summary.paymentMethod)
              : "No card on file"}
          </p>

          {isCardUpdateOpen ? (
            publishableKey ? (
              <CardUpdatePanel
                publishableKey={publishableKey}
                onCancel={cardUpdateActions.close}
                onComplete={handleCardUpdateComplete}
              />
            ) : (
              <p className="text-sm text-text-muted">Loading checkout...</p>
            )
          ) : null}

          {!isCardUpdateOpen || canManageCancellation ? (
            <OverlayPanelActions align="start">
              {!isCardUpdateOpen ? (
                <OverlayPanelActionButton
                  ref={updateCardButtonRef}
                  disabled={isSubmitting}
                  onClick={cardUpdateActions.open}
                  shortcut="U"
                  showShortcut={showShortcuts}
                  variant="secondary"
                  {...settingsShortcutAttrs("update-card")}
                >
                  Update card
                </OverlayPanelActionButton>
              ) : null}
              {canManageCancellation ? (
                summary.cancelAtPeriodEnd ? (
                  <OverlayPanelActionButton
                    disabled={isSubmitting}
                    onClick={handleResume}
                    shortcut="R"
                    showShortcut={showShortcuts}
                    variant="secondary"
                    {...settingsShortcutAttrs("resume-subscription")}
                  >
                    Resume subscription
                  </OverlayPanelActionButton>
                ) : (
                  <OverlayPanelActionButton
                    disabled={isSubmitting || confirmOpen}
                    onClick={() => setConfirmOpen(true)}
                    shortcut="C"
                    showShortcut={showShortcuts}
                    variant="destructive"
                    {...settingsShortcutAttrs("cancel-subscription")}
                  >
                    Cancel subscription
                  </OverlayPanelActionButton>
                )
              ) : null}
            </OverlayPanelActions>
          ) : null}

          {receipts.length > 0 ? (
            <table className="w-full border-collapse text-sm text-text">
              <caption className="mb-1 caption-top text-left font-normal text-sm text-text">
                Receipts
              </caption>
              <thead className="sr-only">
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Status</th>
                  <th scope="col">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="w-full whitespace-nowrap py-0.5 pr-3">
                      {formatBillingDate(invoice.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-0.5 text-right tabular-nums">
                      {formatBillingMoney(invoice.amountPaid, invoice.currency)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-0.5">
                      {formatInvoiceStatus(invoice.status)}
                    </td>
                    <td className="whitespace-nowrap py-0.5 pl-3">
                      {invoice.hostedInvoiceUrl ? (
                        <a
                          className="text-text underline-offset-4 hover:underline"
                          href={invoice.hostedInvoiceUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Receipt
                        </a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </>
      ) : null}

      {trialAskOpen ? (
        <OverlayPanel
          align="center"
          ariaLabel="Start your free trial"
          backdropClassName={
            isTrialCheckoutOpen ? "overflow-y-auto" : undefined
          }
          onDismiss={
            isTrialCheckoutOpen ? checkoutPanelActions.close : closeTrialAsk
          }
          panelClassName={EMBEDDED_CHECKOUT_PANEL_CLASSNAME}
          widthClassName={isTrialCheckoutOpen ? "w-[560px]" : "w-120"}
        >
          <TrialStartAsk
            checkoutSource={{ kind: "settings_trial_ask" }}
            onCheckoutComplete={closeTrialAsk}
            priceLineContext="settings"
            showTitle
            title="Start your free trial"
          />
        </OverlayPanel>
      ) : null}

      {periodEndLabel ? (
        <CancelSubscriptionDialog
          isOpen={confirmOpen}
          isSubmitting={isSubmitting}
          isTrialing={access.kind === "server" && access.status === "trialing"}
          periodEndLabel={periodEndLabel}
          onCancel={closeConfirm}
          onConfirm={handleCancelConfirm}
        />
      ) : null}
    </div>
  );
};
