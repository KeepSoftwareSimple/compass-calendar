import { useContext } from "react";
import { type BillingSubscriptionStatus } from "@core/types/user.types";
import { SessionContext } from "@web/auth/compass/session/session.context";
import {
  isBillingEnforced,
  useAppConfigQuery,
  useBillingStatusQuery,
} from "@web/billing/billing.query";

export type AppAccess =
  | {
      kind: "server";
      status: BillingSubscriptionStatus;
      isReadOnly: boolean;
      trialEndsAt: string | null;
      /**
       * True when the subscription is set to cancel at period end instead of
       * renewing. Optional so the many test fixtures that predate it stay
       * valid; absent reads as false.
       */
      cancelAtPeriodEnd?: boolean;
    }
  | { kind: "open" };

/**
 * Shared gate for `/api/billing/status`. One predicate so access and the
 * layout-hold hook cannot drift on error, auth, or unconfigured Stripe.
 */
function useBillingAccessQuery() {
  const { authenticated } = useContext(SessionContext);
  const configQuery = useAppConfigQuery();
  const billingEnabled =
    isBillingEnforced(configQuery.data) &&
    authenticated &&
    !configQuery.isError &&
    configQuery.data?.billing.isConfigured === true;
  return {
    authenticated,
    configQuery,
    billingEnabled,
    billingQuery: useBillingStatusQuery(billingEnabled),
  };
}

/**
 * Resolves what a visitor is allowed to do.
 *
 * Anonymous visitors are unconditionally open: playing with the sample events
 * is the front door, and nothing about it is metered. A trial is only ever
 * asked for once someone commits (signs up, signs in, connects an account),
 * at which point `/api/billing/status` governs.
 *
 * Fail open: a loading, error, unconfigured-Stripe, or paused-enforcement
 * state never locks a paying user out of their calendar.
 */
export function useAppAccess(): AppAccess {
  const { authenticated, configQuery, billingQuery } = useBillingAccessQuery();
  const enforced = isBillingEnforced(configQuery.data);

  if (!enforced) {
    return { kind: "open" };
  }

  if (!authenticated) {
    return { kind: "open" };
  }

  // isPending is already covered above (isBillingEnforced reads false with no
  // data), but isError is not: TanStack keeps the last good `data` when a
  // refetch fails, so an errored config can still report enforcement: true.
  // Fail open rather than gate on a stale answer we could not confirm.
  if (configQuery.isError || configQuery.data?.billing.isConfigured !== true) {
    return { kind: "open" };
  }

  if (billingQuery.isError || billingQuery.isPending || !billingQuery.data) {
    return { kind: "open" };
  }

  return {
    kind: "server",
    status: billingQuery.data.subscriptionStatus,
    isReadOnly: billingQuery.data.isReadOnly,
    trialEndsAt: billingQuery.data.trialEndsAt,
    cancelAtPeriodEnd: billingQuery.data.cancelAtPeriodEnd,
  };
}

/**
 * True while a signed-in user's plan is still loading on an install that
 * enforces billing, i.e. the one window where useAppAccess reads `open` but
 * will likely flip to `server`. Lets plan-dependent chrome (the Settings
 * Billing tab) hold its space instead of popping in and shoving its
 * neighbours down.
 */
export function useIsAppAccessPending(): boolean {
  const { billingEnabled, billingQuery } = useBillingAccessQuery();
  return billingEnabled && billingQuery.isPending;
}
