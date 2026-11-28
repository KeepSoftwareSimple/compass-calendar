import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useCallback } from "react";
import { type BillingCheckoutRequest } from "@core/types/billing.types";
import { BillingApi } from "@web/api/billing.api";
import { getApiErrorMessage } from "@web/api/util/api.util";
import { EmbeddedCheckoutPanel } from "@web/billing/EmbeddedCheckoutPanel";

type DirectCheckoutFormProps = {
  plan: NonNullable<BillingCheckoutRequest["plan"]>;
  promotionCode?: string;
  publishableKey: string;
  onCheckoutComplete: () => void;
};

export function DirectCheckoutForm({
  plan,
  promotionCode,
  publishableKey,
  onCheckoutComplete,
}: DirectCheckoutFormProps) {
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["billing", "checkout", plan, promotionCode],
    queryFn: () => BillingApi.createCheckoutSession({ plan, promotionCode }),
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const fetchClientSecret = useCallback(() => {
    if (!data) return Promise.reject(new Error("Checkout is not ready"));
    return Promise.resolve(data.clientSecret);
  }, [data]);

  if (isPending) return <p role="status">Loading checkout...</p>;
  if (isError) {
    const message = getApiErrorMessage(error);
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert">
          {message && message !== "Internal server error"
            ? message
            : "Couldn't start checkout. Please try again."}
        </p>
        <button
          type="button"
          className="c-button c-button-secondary"
          onClick={() => void refetch()}
        >
          Try again
        </button>
        {promotionCode && (
          <Link
            to="."
            search={(previous) => ({ ...previous, promo: undefined })}
            replace
            className="c-focus-ring text-sm underline"
          >
            Continue without the offer
          </Link>
        )}
      </div>
    );
  }

  return (
    <EmbeddedCheckoutPanel
      key={data.clientSecret}
      fetchClientSecret={fetchClientSecret}
      onCheckoutComplete={onCheckoutComplete}
      publishableKey={publishableKey}
    />
  );
}
