import { useQueryClient } from "@tanstack/react-query";
import { type FC, useEffect, useRef, useState } from "react";
import dayjs from "@core/util/date/dayjs";
import { BillingApi } from "@web/api/billing.api";
import { track } from "@web/auth/posthog/track";
import {
  billingQueryKeys,
  startBillingStatusPoll,
  useBillingSubscriptionQuery,
  useStripePublishableKey,
} from "@web/billing/billing.query";
import {
  formatBillingDate,
  formatBillingMoney,
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
  getPlanBadge,
  PLAN_BADGE_TONE_CLASSNAME,
} from "@web/billing/planBadge";
import { useAppAccess } from "@web/billing/useAppAccess";
import {
  BILLING_CARD_UPDATED_TOAST_ID,
  BILLING_PLAN_ENDS_TOAST_ID,
  BILLING_PLAN_RENEWS_TOAST_ID,
} from "@web/common/constants/toast.constants";
import { showStatusToast } from "@web/common/utils/toast/status-toast.util";
import {
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
  const subscriptionQuery = useBillingSubscriptionQuery(
    page === "billing" && access.kind === "server",
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const closeConfirm = () => {
    if (isSubmitting) return;
    setConfirmOpen(false);
  };

  const handleCancelConfirm = () => {
    if (isSubmitting || !periodEndLabel) return;
    setIsSubmitting(true);
    void (async () => {
      try {
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
    stopCardPollRef.current = startBillingStatusPoll(
      queryClient,
      () => {
        stopCardPollRef.current = null;
      },
      billingQueryKeys.subscription,
    );
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
            {summary?.price ? (
              <p className="mt-1 text-sm text-text">
                {formatBillingMoney(
                  summary.price.amount,
                  summary.price.currency,
                )}{" "}
                per {summary.price.interval}
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
            {subscriptionQuery.isPending ? (
              <p className="mt-1 text-text-muted text-xs">Loading your plan</p>
            ) : null}
          </div>
        </div>
      </div>

      {summary ? (
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
