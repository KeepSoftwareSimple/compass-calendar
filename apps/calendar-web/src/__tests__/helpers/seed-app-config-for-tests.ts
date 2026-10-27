import { type QueryClient, QueryClient } from "@tanstack/react-query";
import { BILLING_PLAN } from "@core/constants/billing.constants";
import { billingQueryKeys } from "@web/billing/billing.query";

export const DEFAULT_TEST_APP_CONFIG = {
  version: "test",
  sync: { cloudMutationMode: "enabled" as const, execution: "passive" as const },
  providers: {
    google: { signIn: false, connect: false },
    microsoft: { signIn: false, connect: false },
    apple: { signIn: false, connect: false },
  },
  billing: {
    isConfigured: true,
    enforcement: true,
    trialLengthDays: BILLING_PLAN.TRIAL_LENGTH_DAYS,
    publishableKey: "pk_test",
  },
};

export function seedAppConfigForTests(queryClient: QueryClient): void {
  queryClient.setQueryData(billingQueryKeys.config, DEFAULT_TEST_APP_CONFIG);
}

export function createWebTestQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  seedAppConfigForTests(queryClient);
  return queryClient;
}
