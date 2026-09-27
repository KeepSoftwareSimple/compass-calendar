import {
  type QueryClient,
  queryOptions,
  useQuery,
} from "@tanstack/react-query";
import {
  type BillingStatusResponse,
  type BillingSubscriptionResponse,
} from "@core/types/billing.types";
import { AppConfigApi } from "@web/api/app-config.api";
import { BillingApi } from "@web/api/billing.api";

export const billingQueryKeys = {
  status: ["billing", "status"] as const,
  subscription: ["billing", "subscription"] as const,
  config: ["app-config"] as const,
};

export function billingStatusQueryOptions() {
  return queryOptions({
    queryKey: billingQueryKeys.status,
    queryFn: (): Promise<BillingStatusResponse> => BillingApi.getStatus(),
    staleTime: 30_000,
  });
}

export function appConfigQueryOptions() {
  return queryOptions({
    queryKey: billingQueryKeys.config,
    queryFn: () => AppConfigApi.get(),
    staleTime: 60_000,
  });
}

export function useBillingStatusQuery(enabled: boolean) {
  return useQuery({
    ...billingStatusQueryOptions(),
    enabled,
    // Embedded Checkout completes in-page; still refetch on focus so a
    // webhook that lands while the tab is backgrounded shows up immediately.
    refetchOnWindowFocus: "always",
  });
}

export function billingSubscriptionQueryOptions() {
  return queryOptions({
    queryKey: billingQueryKeys.subscription,
    queryFn: (): Promise<BillingSubscriptionResponse> =>
      BillingApi.getSubscription(),
    staleTime: 30_000,
  });
}

export function useBillingSubscriptionQuery(enabled: boolean) {
  return useQuery({
    ...billingSubscriptionQueryOptions(),
    enabled,
    refetchOnWindowFocus: "always",
  });
}

export function useAppConfigQuery() {
  return useQuery(appConfigQueryOptions());
}

export function useStripePublishableKey(): string | null {
  return useAppConfigQuery().data?.billing.publishableKey ?? null;
}

/**
 * The operator pause switch. False (paused) whenever config is pending or
 * errored, not just when the server says so, so a slow network never flashes
 * a gate before the real value loads.
 */
export function isBillingEnforced(
  config: { billing: { enforcement: boolean } } | undefined,
): boolean {
  return config?.billing.enforcement === true;
}

const STATUS_POLL_MS = 1500;
const STATUS_POLL_WINDOW_MS = 15_000;

export function startBillingStatusPoll(
  queryClient: QueryClient,
  onWindowEnd: () => void,
  queryKey: readonly unknown[] = billingQueryKeys.status,
): () => void {
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey });
  };
  invalidate();
  const interval = window.setInterval(invalidate, STATUS_POLL_MS);
  const timeout = window.setTimeout(() => {
    window.clearInterval(interval);
    onWindowEnd();
  }, STATUS_POLL_WINDOW_MS);
  return () => {
    window.clearInterval(interval);
    window.clearTimeout(timeout);
  };
}
