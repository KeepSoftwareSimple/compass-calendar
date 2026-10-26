import { deriveBillingStatus } from "@backend/billing/services/billing.service";
import { CONFIG } from "@backend/common/constants/config.constants";
import {
  isBillingBypassed,
  isBillingEnforced,
  isStripeConfigured,
} from "@backend/common/constants/config.util";
import mongoService from "@backend/common/services/mongo.service";
import { eventMutationError } from "@backend/event/event.error";
import { isSyntheticBillingBypassAccount } from "@backend/user/synthetic-account.service";

/**
 * Throw BILLING_REQUIRED (403) when the user cannot mutate events.
 * No-ops when enforcement is paused (operator kill switch, e.g. pre-launch),
 * when Stripe is unconfigured (self-host), or when this account is on the
 * operator bypass allowlist. Lives in controllers, not the shared
 * `/api/event` route chain, so GET stays open.
 */
export async function assertBillingAllowsWrites(userId: string): Promise<void> {
  if (!isBillingEnforced(CONFIG)) return;
  if (!isStripeConfigured(CONFIG)) return;

  const user = await mongoService.user.findOne(
    { _id: mongoService.objectId(userId) },
    { projection: { billing: 1, email: 1, isSynthetic: 1 } },
  );
  if (isBillingBypassed(CONFIG, user?.email)) return;
  if (isSyntheticBillingBypassAccount(user?.email, user?.isSynthetic)) return;

  const status = deriveBillingStatus(user?.billing);
  if (!status.isReadOnly) return;

  throw eventMutationError(
    "BILLING_REQUIRED",
    "A paid subscription is required to make changes",
  );
}
