import { checkoutPanelActions } from "@web/billing/checkout-panel.store";
import {
  formatTrialBadgeDescription,
  formatTrialBadgeLabel,
  getTrialDaysLeft,
} from "@web/billing/trialDaysLeft";
import { useUpgradeConfirmation } from "@web/billing/UpgradeConfirmation/hooks/useUpgradeConfirmation";
import { useAppAccess } from "@web/billing/useAppAccess";
import { TooltipWrapper } from "@web/components/Tooltip/TooltipWrapper";

/**
 * Days-left pill in the month picker's header row, and the shortest path to
 * ending the trial early.
 *
 * Deliberately carries no `tabindex`: `getPageJumpFocusElement` seats Mod+2 on
 * the first `[tabindex="0"]` inside the picker, which is react-datepicker's
 * selected day. A tab stop here would steal that jump. As a plain button it is
 * still Tab-reachable, exactly like the prev/next arrows beside it.
 */
export function TrialBadge() {
  const access = useAppAccess();
  const { openUpgradeConfirmation } = useUpgradeConfirmation();

  if (
    access.kind !== "server" ||
    access.status !== "trialing" ||
    !access.trialEndsAt
  ) {
    return null;
  }

  const daysLeft = getTrialDaysLeft(access.trialEndsAt);
  const description = access.cancelAtPeriodEnd
    ? `${formatTrialBadgeDescription(daysLeft)}. It will not renew`
    : formatTrialBadgeDescription(daysLeft);

  return (
    <TooltipWrapper description={description} shortcut="B">
      <button
        aria-label={`${description}. Subscribe now.`}
        className="c-keycap c-focus-ring cursor-pointer text-xs"
        onClick={() => {
          if (access.needsPaymentMethod) {
            checkoutPanelActions.open();
            return;
          }
          openUpgradeConfirmation();
        }}
        type="button"
      >
        {formatTrialBadgeLabel(daysLeft)}
      </button>
    </TooltipWrapper>
  );
}
