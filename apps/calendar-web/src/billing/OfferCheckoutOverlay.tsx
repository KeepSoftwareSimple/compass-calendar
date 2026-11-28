import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";
import { useSession } from "@web/auth/compass/session/useSession";
import {
  useAppConfigQuery,
  useBillingStatusQuery,
} from "@web/billing/billing.query";
import { DirectCheckoutForm } from "@web/billing/DirectCheckoutForm";
import { isMobileOS } from "@web/common/utils/device/device.util";
import { OverlayPanel } from "@web/components/OverlayPanel/OverlayPanel";

export default function OfferCheckoutOverlay() {
  const { promo, plan } = useSearch({ from: "__root__" });
  const navigate = useNavigate();
  const close = useCallback(() => {
    void navigate({
      to: ".",
      replace: true,
      search: (previous) => ({
        ...previous,
        checkout: undefined,
        plan: undefined,
        promo: undefined,
      }),
    });
  }, [navigate]);
  const { authenticated } = useSession();
  const config = useAppConfigQuery();
  const publishableKey = config.data?.billing.publishableKey;
  const billing = useBillingStatusQuery(
    authenticated && Boolean(publishableKey),
  );
  const status = billing.data?.subscriptionStatus;
  const hasSubscription =
    status === "trialing" || status === "active" || status === "past_due";

  return (
    <OverlayPanel
      title={promo === "AHAB30" ? "Get 30% off Compass" : "Discount codes"}
      onDismiss={close}
      widthClassName="w-[min(560px,calc(100vw-2rem))]"
      align="start"
    >
      <div className="flex w-full flex-col items-start gap-4">
        {promo === "AHAB30" && (
          <p className="text-text-muted">
            New subscribers get 30% off the first month or the full first year.
            The discount is applied at checkout. Your plan renews at the regular
            price.
          </p>
        )}
        {config.isPending ||
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
              to="."
              search={(previous) => ({ ...previous, auth: "signup" })}
              replace
              className="c-button c-button-primary"
            >
              Create an account
            </Link>
            <Link
              to="."
              search={(previous) => ({ ...previous, auth: "login" })}
              replace
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
                : "You already have a subscription."}{" "}
              New-subscriber discounts are applied before starting your first
              trial or subscription.
            </p>
            {isMobileOS() ? (
              <p>Open Compass on your computer to manage billing.</p>
            ) : (
              <Link
                to="."
                replace
                search={(previous) => ({
                  ...previous,
                  checkout: undefined,
                  plan: undefined,
                  promo: undefined,
                  settings: "billing",
                })}
                className="c-button c-button-primary"
              >
                Manage billing
              </Link>
            )}
          </>
        ) : (
          <>
            {!promo && !plan && (
              <p className="text-text-muted">
                Choose a plan to enter your code at checkout.
              </p>
            )}
            <nav aria-label="Billing period" className="flex flex-wrap gap-3">
              <Link
                to="."
                search={(previous) => ({ ...previous, plan: "monthly" })}
                replace
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
                to="."
                search={(previous) => ({ ...previous, plan: "annual" })}
                replace
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
                onCheckoutComplete={close}
              />
            )}
          </>
        )}
        <button
          type="button"
          onClick={close}
          className="c-button c-button-secondary"
        >
          Close checkout
        </button>
      </div>
    </OverlayPanel>
  );
}
