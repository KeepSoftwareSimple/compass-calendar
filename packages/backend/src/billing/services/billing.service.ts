import {
  isStaleLocalTrialingRow,
  resolveSubscriptionStatus,
} from "@core/billing/resolve-subscription-status";
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
import { isSyntheticBillingBypassAccount } from "@backend/user/synthetic-account.service";

/**
 * Pure status derivation. Writability is a total map over the status union
 * so adding a state without deciding it is a compile error.
 *
 * Missing billing, a billing object with no `subscriptionStatus`, and
 * `none` surface as `awaiting_checkout` so the Start-trial gate shows.
 *
 * Stripe-backed `trialing` rows never self-expire locally: webhooks are
 * authoritative, so a late `active` event cannot lock out a customer whose
 * card just succeeded. Card-less local trials (legacy signup) resolve through
 * {@link resolveSubscriptionStatus}.
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
    };
  }

  const subscriptionStatus = resolveSubscriptionStatus(billing, now);

  return {
    subscriptionStatus,
    trialEndsAt: billing.trialEndsAt?.toISOString() ?? null,
    isReadOnly: !WRITE_ACCESS_BY_STATUS[subscriptionStatus],
    cancelAtPeriodEnd: billing.cancelAtPeriodEnd === true,
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
      { projection: { billing: 1, email: 1, isSynthetic: 1 } },
    );
    if (!user) {
      throw new Error("User not found");
    }

    if (
      isBillingEnforced(CONFIG) &&
      isStripeConfigured(CONFIG) &&
      (isBillingBypassed(CONFIG, user.email) ||
        isSyntheticBillingBypassAccount(user.email, user.isSynthetic))
    ) {
      return {
        subscriptionStatus: "active",
        trialEndsAt: null,
        isReadOnly: false,
        cancelAtPeriodEnd: false,
      };
    }

    const derived = deriveBillingStatus(user.billing);
    await persistResolvedLocalTrial(
      userId,
      user.billing,
      derived.subscriptionStatus,
    );
    return derived;
  };
}

/** Idempotent write so Mongo reporting matches derived access for legacy rows. */
async function persistResolvedLocalTrial(
  userId: string,
  billing: Schema_UserBilling | undefined,
  resolvedStatus: BillingStatusResponse["subscriptionStatus"],
): Promise<void> {
  if (!billing || !isStaleLocalTrialingRow(billing)) return;

  await mongoService.user.updateOne(
    {
      _id: mongoService.objectId(userId),
      "billing.subscriptionStatus": "trialing",
      $or: [
        { "billing.stripeSubscriptionId": { $exists: false } },
        { "billing.stripeSubscriptionId": null },
      ],
    },
    { $set: { "billing.subscriptionStatus": resolvedStatus } },
  );
}

export default new BillingService();
