import {
  BILLING_PLAN,
  type BillingDisplayPrice,
} from "@core/constants/billing.constants";
import { type BillingSubscriptionResponse } from "@core/types/billing.types";
import dayjs from "@core/util/date/dayjs";
import { formatBillingMoney } from "@web/billing/billing-display";
import { formatTrialChargeDate } from "@web/billing/signup-trial-format.util";

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

/** "$7.99/mo", the price half both trial copy lines open with. */
function formatShortPrice(price: BillingDisplayPrice): string {
  return `${formatBillingMoney(price.amount, price.currency)}/${INTERVAL_SHORT[price.interval]}`;
}

/** Trial ask subline: catalog price plus charge date from trial length. */
export function formatTrialAskSubline(
  price: BillingDisplayPrice,
  trialLengthDays: number,
  now: dayjs.Dayjs = dayjs(),
): string {
  const chargeDate = formatTrialChargeDate(trialLengthDays, now);
  return `${formatShortPrice(price)} after. No charge until ${chargeDate}. Cancel anytime.`;
}

/** Trial ask copy: "$7.99/mo after 7 days. Cancel anytime in Settings." */
export function formatTrialStartPriceLine(
  price: BillingDisplayPrice,
  trialLengthDays: number = BILLING_PLAN.TRIAL_LENGTH_DAYS,
  context: TrialStartPriceLineContext = "default",
): string {
  const cancel =
    context === "settings" ? "Cancel anytime." : "Cancel anytime in Settings.";
  return `${formatShortPrice(price)} after ${trialLengthDays} days. ${cancel}`;
}
