import {
  BILLING_PLAN,
  type BillingDisplayPrice,
} from "@core/constants/billing.constants";
import { type BillingSubscriptionResponse } from "@core/types/billing.types";
import { formatBillingMoney } from "@web/billing/billing-display";

export function resolveBillingDisplayPrice(
  subscriptionPrice: BillingSubscriptionResponse["price"] | null | undefined,
): BillingDisplayPrice {
  if (subscriptionPrice) {
    return subscriptionPrice;
  }
  return BILLING_PLAN.DISPLAY_PRICE;
}

const INTERVAL_SHORT: Record<BillingDisplayPrice["interval"], string> = {
  day: "day",
  week: "wk",
  month: "mo",
  year: "yr",
};

export type TrialStartPriceLineContext = "default" | "settings";

/** Trial ask copy: "$7.99/mo after 7 days. Cancel anytime in Settings." */
export function formatTrialStartPriceLine(
  price: BillingDisplayPrice,
  trialLengthDays: number = BILLING_PLAN.TRIAL_LENGTH_DAYS,
  context: TrialStartPriceLineContext = "default",
): string {
  const money = formatBillingMoney(price.amount, price.currency);
  const interval = INTERVAL_SHORT[price.interval];
  const cancel =
    context === "settings" ? "Cancel anytime." : "Cancel anytime in Settings.";
  return `${money}/${interval} after ${trialLengthDays} days. ${cancel}`;
}
