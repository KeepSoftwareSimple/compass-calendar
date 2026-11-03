import Stripe from "stripe";
import { redactJourneyEmailForLog } from "@core/analytics/synthetic-account.util";
import {
  assertAllowedSyntheticJourneyCleanupEmails,
  isAllowedSyntheticJourneyCleanupEmail,
  type JourneyCleanupEnvironment,
} from "@core/journey/synthetic-journey-cleanup-email.util";

/** Keep in sync with `@backend/billing/services/stripe.client` (avoid config import). */
const STRIPE_API_VERSION = "2026-09-30.endive" as const;

export type JourneySyntheticStripeCleanupLine = {
  email: string;
  action: string;
  detail?: string;
};

export async function runJourneySyntheticStripeCleanup({
  emails,
  environment,
  dryRun,
  secretKey,
}: {
  emails: readonly string[];
  environment: JourneyCleanupEnvironment;
  dryRun: boolean;
  secretKey: string;
}): Promise<JourneySyntheticStripeCleanupLine[]> {
  assertAllowedSyntheticJourneyCleanupEmails(emails, environment);
  const stripe = new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });
  const lines: JourneySyntheticStripeCleanupLine[] = [];

  for (const raw of emails) {
    const email = raw.trim().toLowerCase();
    if (!email) continue;

    const customers = await stripe.customers.list({ email, limit: 20 });
    const exact = customers.data.filter(
      (customer) => customer.email?.trim().toLowerCase() === email,
    );

    if (exact.length === 0) {
      lines.push({ email, action: "stripe_customer_not_found" });
      continue;
    }

    for (const customer of exact) {
      const customerEmail = customer.email?.trim().toLowerCase() ?? "";
      if (
        !customerEmail ||
        customerEmail !== email ||
        !isAllowedSyntheticJourneyCleanupEmail(customerEmail, environment)
      ) {
        throw new Error(
          `Refusing Stripe action: customer ${customer.id} email mismatch`,
        );
      }

      lines.push({
        email,
        action: dryRun
          ? "would_delete_stripe_customer"
          : "stripe_customer_found",
        detail: customer.id,
      });

      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        limit: 100,
      });

      for (const subscription of subscriptions.data) {
        lines.push({
          email,
          action: dryRun
            ? "would_cancel_stripe_subscription"
            : "stripe_subscription_canceled",
          detail: subscription.id,
        });
        if (!dryRun) {
          await stripe.subscriptions.cancel(subscription.id);
        }
      }

      if (!dryRun) {
        await stripe.customers.del(customer.id);
        lines.push({
          email,
          action: "stripe_customer_deleted",
          detail: customer.id,
        });
      }
    }
  }

  for (const line of lines) {
    console.log(
      `journey-cleanup email=${redactJourneyEmailForLog(line.email)} action=${line.action}${line.detail ? ` detail=${line.detail}` : ""}`,
    );
  }

  return lines;
}
