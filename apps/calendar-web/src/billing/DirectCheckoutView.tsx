import { Link, useSearch } from "@tanstack/react-router";
import { useCallback, useState, useSyncExternalStore } from "react";
import {
  readSessionResolved,
  subscribeSessionResolved,
} from "@web/auth/compass/session/auth-session.store";
import { useSession } from "@web/auth/compass/session/useSession";
import { GoogleOAuthSignupScopesRecovery } from "@web/auth/providers/GoogleOAuthSignupScopesRecovery";
import { MissingPermissionsModal } from "@web/auth/providers/MissingPermissionsModal";
import {
  useAppConfigQuery,
  useBillingStatusQuery,
} from "@web/billing/billing.query";
import { DirectCheckoutForm } from "@web/billing/DirectCheckoutForm";
import {
  DEFAULT_CALENDAR_ROUTE,
  ROOT_ROUTES,
} from "@web/common/constants/routes";
import { isMobileOS } from "@web/common/utils/device/device.util";
import { AuthModal } from "@web/components/AuthModal/AuthModal";
import { AuthModalProvider } from "@web/components/AuthModal/AuthModalProvider";
import { useFlushPendingShellToast } from "@web/components/BottomNoticeStack/useFlushPendingShellToast";

export function DirectCheckoutView() {
  const { promo, plan } = useSearch({ from: ROOT_ROUTES.CHECKOUT });
  const [completed, setCompleted] = useState(false);
  const isMobile = isMobileOS();
  const onCheckoutComplete = useCallback(() => setCompleted(true), []);
  const { authenticated } = useSession();
  const sessionResolved = useSyncExternalStore(
    subscribeSessionResolved,
    readSessionResolved,
  );
  const config = useAppConfigQuery();
  const publishableKey = config.data?.billing.publishableKey;
  const billing = useBillingStatusQuery(
    authenticated && Boolean(publishableKey),
  );
  const status = billing.data?.subscriptionStatus;
  const hasSubscription =
    status === "trialing" || status === "active" || status === "past_due";

  useFlushPendingShellToast();

  if (completed) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-200 flex-col items-start gap-5 px-4 py-10 text-text sm:px-8">
        <h1 className="font-semibold text-3xl">Checkout complete</h1>
        <Link to={DEFAULT_CALENDAR_ROUTE} className="c-button c-button-primary">
          Open Compass
        </Link>
      </main>
    );
  }

  return (
    <AuthModalProvider>
      <main className="mx-auto flex min-h-dvh w-full max-w-200 flex-col items-start gap-5 px-4 py-10 text-text sm:px-8">
        <h1 className="font-semibold text-3xl">
          {promo === "AHAB30" ? "Get 30% off Compass" : "Compass Checkout"}
        </h1>
        {promo === "AHAB30" && (
          <p className="text-text-muted">
            New subscribers get 30% off the first month or the full first year.
            The discount is applied at checkout. Your plan renews at the regular
            price.
          </p>
        )}
        {!sessionResolved ||
        config.isPending ||
        (authenticated && publishableKey && billing.isPending) ? (
          <p role="status">Loading checkout...</p>
        ) : config.isError || (authenticated && billing.isError) ? (
          <div>
            <p role="alert">Couldn't load checkout. Please try again.</p>
            <button
              className="c-button c-button-secondary mt-3"
              onClick={() =>
                void (config.isError ? config.refetch() : billing.refetch())
              }
              type="button"
            >
              Try again
            </button>
          </div>
        ) : !publishableKey ? (
          <p>Checkout is unavailable right now.</p>
        ) : !authenticated ? (
          <div className="flex flex-wrap gap-3">
            <Link
              to={ROOT_ROUTES.CHECKOUT}
              search={{ promo, plan, auth: "signup" }}
              className="c-button c-button-primary"
            >
              Create an account
            </Link>
            <Link
              to={ROOT_ROUTES.CHECKOUT}
              search={{ promo, plan, auth: "login" }}
              className="c-button c-button-secondary"
            >
              Log in
            </Link>
          </div>
        ) : hasSubscription ? (
          <>
            <p>
              {status === "trialing"
                ? "Your trial is already set up."
                : "You already have a subscription."}
              {promo
                ? " This offer can only be used when you start your first subscription."
                : ""}
            </p>
            {isMobile ? (
              <p>Open Compass on your computer to manage billing.</p>
            ) : (
              <Link
                to={DEFAULT_CALENDAR_ROUTE}
                search={{ settings: "billing" }}
                className="c-button c-button-primary"
              >
                Manage billing
              </Link>
            )}
          </>
        ) : (
          <>
            <nav aria-label="Billing period" className="flex flex-wrap gap-3">
              <Link
                to={ROOT_ROUTES.CHECKOUT}
                search={{ promo, plan: "monthly" }}
                aria-current={plan === "monthly" ? "true" : undefined}
                className={
                  plan === "monthly"
                    ? "c-button c-button-primary"
                    : "c-button c-button-secondary"
                }
              >
                Monthly plan
              </Link>
              <Link
                to={ROOT_ROUTES.CHECKOUT}
                search={{ promo, plan: "annual" }}
                aria-current={plan === "annual" ? "true" : undefined}
                className={
                  plan === "annual"
                    ? "c-button c-button-primary"
                    : "c-button c-button-secondary"
                }
              >
                Annual plan
              </Link>
            </nav>
            {plan && (
              <DirectCheckoutForm
                plan={plan}
                promotionCode={promo}
                publishableKey={publishableKey}
                onCheckoutComplete={onCheckoutComplete}
              />
            )}
          </>
        )}
        <Link
          to={DEFAULT_CALENDAR_ROUTE}
          className="c-focus-ring text-sm underline"
        >
          Back to Compass
        </Link>
      </main>
      {sessionResolved && publishableKey && (
        <>
          <AuthModal />
          <GoogleOAuthSignupScopesRecovery />
          <MissingPermissionsModal />
        </>
      )}
    </AuthModalProvider>
  );
}
