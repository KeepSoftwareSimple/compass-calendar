import { z } from "zod/v4";
import { type BillingSubscriptionStatus } from "./user.types";

export const BillingSubscriptionStatusSchema = z.enum([
  "none",
  "awaiting_checkout",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "expired",
]);

/** Wire shape: dates are ISO strings, matching every other JSON API response. */
export const BillingStatusResponseSchema = z.object({
  subscriptionStatus: BillingSubscriptionStatusSchema,
  trialEndsAt: z.string().nullable(),
  /** True when the account must not mutate events. */
  isReadOnly: z.boolean(),
  /**
   * True when the subscription is set to cancel at period end instead of
   * renewing. Defaulted so a response from an older server still parses.
   */
  cancelAtPeriodEnd: z.boolean().default(false),
});
export type BillingStatusResponse = z.infer<typeof BillingStatusResponseSchema>;

export const BillingCheckoutRequestSchema = z.object({
  returnTo: z.literal("desktop").optional(),
});
export type BillingCheckoutRequest = z.infer<
  typeof BillingCheckoutRequestSchema
>;

export const BillingCheckoutResponseSchema = z
  .object({
    clientSecret: z.string().min(1).optional(),
    /** Hosted Checkout URL when `returnTo` is `desktop`. */
    url: z.string().url().optional(),
  })
  .refine(
    (value) => (value.clientSecret ? 1 : 0) + (value.url ? 1 : 0) === 1,
    "Provide either clientSecret or url",
  );
export type BillingCheckoutResponse = z.infer<
  typeof BillingCheckoutResponseSchema
>;

export const BillingPriceSchema = z.object({
  amount: z.number(),
  currency: z.string(),
  interval: z.enum(["day", "week", "month", "year"]),
});

export const BillingPaymentMethodSchema = z.object({
  brand: z.string(),
  last4: z.string(),
  expMonth: z.number(),
  expYear: z.number(),
});

export const BillingInvoiceSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  amountPaid: z.number(),
  currency: z.string(),
  status: z.string(),
  hostedInvoiceUrl: z.string().nullable(),
});

/** Settings > Billing management payload. Dates are ISO strings. */
export const BillingSubscriptionResponseSchema = z.object({
  subscriptionStatus: BillingSubscriptionStatusSchema,
  currentPeriodEnd: z.string().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  trialEndsAt: z.string().nullable(),
  price: BillingPriceSchema.nullable(),
  paymentMethod: BillingPaymentMethodSchema.nullable(),
  invoices: z.array(BillingInvoiceSchema),
});
export type BillingSubscriptionResponse = z.infer<
  typeof BillingSubscriptionResponseSchema
>;

export type { BillingSubscriptionStatus };
