import { type BillingStatusResponse } from "@core/types/billing.types";
import { type Schema_UserBilling } from "@core/types/user.types";
import { WRITE_ACCESS_BY_STATUS } from "@backend/billing/billing.constants";
import { CONFIG } from "@backend/common/constants/config.constants";
import {
  isBillingBypassed,
  isBillingEnforced,
  isStripeConfigured,
} from "@backend/common/constants/config.util";
import mongoService from "@backend/common/services/mongo.service";

/**
 * Pure status derivation. Writability is a total map over the status union
 * so adding a state without deciding it is a compile error.
 *
 * Missing billing, a billing object with no `subscriptionStatus`, and
 * `none` surface as `awaiting_checkout` so the Start-trial gate shows.
 *
 * A local (card-less) trial is `trialing` with no `stripeSubscriptionId`
 * and a future `trialEndsAt`: writable, `needsPaymentMethod: true`. Once
 * `trialEndsAt` has passed it reports `expired`. No `trialEndsAt` at all
 * keeps the `awaiting_checkout` fallback for legacy / backfill rows.
 *
 * `trialing` with a `stripeSubscriptionId` never self-expires locally —
 * Stripe's webhook is authoritative, so a late `active` event cannot lock
 * out a customer whose card just succeeded.
 */
export const deriveBillingStatus = (
  billing: Schema_UserBilling | undefined,
  now: Date = new Date(),
): BillingStatusResponse => {
  const storedStatus = billing?.subscriptionStatus;
  if (!billing || !storedStatus || storedStatus === "none") {
    return {
      subscriptionStatus: "awaiting_checkout",
      trialEndsAt: billing?.trialEndsAt?.toISOString() ?? null,
      isReadOnly: true,
      cancelAtPeriodEnd: false,
      needsPaymentMethod: false,
    };
  }

  if (
    billing.subscriptionStatus === "trialing" &&
    !billing.stripeSubscriptionId
  ) {
    if (!billing.trialEndsAt) {
      return {
        subscriptionStatus: "awaiting_checkout",
        trialEndsAt: null,
        isReadOnly: true,
        cancelAtPeriodEnd: false,
        needsPaymentMethod: false,
      };
    }
    if (billing.trialEndsAt.getTime() > now.getTime()) {
      return {
        subscriptionStatus: "trialing",
        trialEndsAt: billing.trialEndsAt.toISOString(),
        isReadOnly: false,
        cancelAtPeriodEnd: false,
        needsPaymentMethod: true,
      };
    }
    return {
      subscriptionStatus: "expired",
      trialEndsAt: billing.trialEndsAt.toISOString(),
      isReadOnly: true,
      cancelAtPeriodEnd: false,
      needsPaymentMethod: false,
    };
  }

  return {
    subscriptionStatus: billing.subscriptionStatus,
    trialEndsAt: billing.trialEndsAt?.toISOString() ?? null,
    isReadOnly: !WRITE_ACCESS_BY_STATUS[billing.subscriptionStatus],
    cancelAtPeriodEnd: billing.cancelAtPeriodEnd === true,
    needsPaymentMethod: false,
  };
};

class BillingService {
  /**
   * Bypassed accounts report as `active` so the web gate stands down, matching
   * the write guard's early return -- including its ordering, so the list is
   * consulted only in a deployment that actually gates. Reported through this
   * authenticated route rather than the public `/api/config` payload, which
   * would leak the roster.
   */
  getStatus = async (userId: string): Promise<BillingStatusResponse> => {
    const user = await mongoService.user.findOne(
      { _id: mongoService.objectId(userId) },
      { projection: { billing: 1, email: 1 } },
    );
    if (!user) {
      throw new Error("User not found");
    }

    if (
      isBillingEnforced(CONFIG) &&
      isStripeConfigured(CONFIG) &&
      isBillingBypassed(CONFIG, user.email)
    ) {
      return {
        subscriptionStatus: "active",
        trialEndsAt: null,
        isReadOnly: false,
        cancelAtPeriodEnd: false,
        needsPaymentMethod: false,
      };
    }

    return deriveBillingStatus(user.billing);
  };
}

export default new BillingService();
