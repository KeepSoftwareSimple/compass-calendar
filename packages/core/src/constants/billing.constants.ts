/**
 * Trial length and backfill cutoff. Backend Checkout reads
 * `TRIAL_LENGTH_DAYS`. The Stripe price id and amount live in Stripe
 * (and the `stripe.priceId` secret), not here, so operators can change
 * the price without a deploy.
 *
 * BACKFILL_CUTOFF bounds which rows `backfill-billing` stamps: only
 * accounts with `signedUpAt <= cutoff` (or missing `signedUpAt`) are
 * stamped `awaiting_checkout`. It is NOT a grandfathering switch --
 * `deriveBillingStatus` gates a missing `billing` object through the same
 * read-only branch, so skipping a row here changes nothing about its
 * access. Grandfathering would need a real code change.
 */
export type BillingDisplayPrice = {
  amount: number;
  currency: string;
  interval: "day" | "week" | "month" | "year";
};

export const BILLING_PLAN = {
  TRIAL_LENGTH_DAYS: 7,
  BACKFILL_CUTOFF: "2099-12-31T23:59:59.000Z",
  /** Shown before catalog price loads; must match the Stripe price id. */
  DISPLAY_PRICE: {
    amount: 799,
    currency: "usd",
    interval: "month",
  } satisfies BillingDisplayPrice,
} as const;
