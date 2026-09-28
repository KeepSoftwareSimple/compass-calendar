import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTestEmailPasswordPort } from "@web/__tests__/helpers/web-test-seams";
import { createTestRouter } from "@web/__tests__/utils/providers/createTestRouter";
import { queryClient as appQueryClient } from "@web/api/query-client";
import {
  registerEmailPasswordPort,
  resetEmailPasswordPort,
} from "@web/auth/compass/hooks/emailpassword.port";
import { registerUseCompleteAuthenticationForTests } from "@web/auth/compass/hooks/useCompleteAuthentication.registry";
import { BillingGateModal } from "@web/billing/BillingGateModal";
import { billingQueryKeys } from "@web/billing/billing.query";
import {
  initialCheckoutCelebrationState,
  useCheckoutCelebrationStore,
} from "@web/billing/checkout-celebration.store";
import {
  initialCheckoutPanelState,
  useCheckoutPanelStore,
} from "@web/billing/checkout-panel.store";
import { resetCheckoutMigrationForTests } from "@web/billing/complete-checkout-session";
import {
  type EmbeddedCheckoutProps,
  setEmbeddedCheckoutForTests,
} from "@web/billing/embedded-checkout/embedded-checkout.seam";
import { AuthModal } from "@web/components/AuthModal/AuthModal";
import { AuthModalProvider } from "@web/components/AuthModal/AuthModalProvider";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

function FakeCheckout({ onComplete }: EmbeddedCheckoutProps) {
  return (
    <button type="button" onClick={onComplete}>
      Complete checkout
    </button>
  );
}

const HOSTED_CONFIG = {
  providers: {
    google: { signIn: false, connect: false },
    microsoft: { signIn: false, connect: false },
    apple: { signIn: false, connect: false },
  },
  billing: {
    isConfigured: true,
    enforcement: true,
    trialLengthDays: 7,
    publishableKey: "pk_test_trial_step",
  },
};

const SELF_HOST_CONFIG = {
  ...HOSTED_CONFIG,
  billing: {
    isConfigured: false,
    enforcement: false,
    trialLengthDays: 7,
    publishableKey: null,
  },
};

const mockCompleteAuthentication = mock().mockResolvedValue(undefined);
const mockUseSession = mock(() => ({
  authenticated: false,
  userId: undefined as string | undefined,
  setAuthenticated: mock(),
}));

mock.module("@web/auth/compass/session/useSession", () => ({
  useSession: () => mockUseSession(),
}));

const mockSyncPendingLocalEvents = mock().mockResolvedValue(true);
mock.module("@web/auth/providers/connection-revoked.util", () => ({
  syncPendingLocalEvents: (...args: unknown[]) =>
    mockSyncPendingLocalEvents(...args),
}));

type TrialTestConfig = typeof HOSTED_CONFIG | typeof SELF_HOST_CONFIG;

const seedBillingQueries = (
  queryClient: QueryClient,
  config: TrialTestConfig,
) => {
  queryClient.setQueryData(billingQueryKeys.config, {
    version: "test",
    sync: { cloudMutationMode: "enabled", execution: "passive" },
    ...config,
  });
  queryClient.setQueryData(billingQueryKeys.status, {
    subscriptionStatus: "awaiting_checkout",
    trialEndsAt: null,
    isReadOnly: true,
    cancelAtPeriodEnd: false,
    needsPaymentMethod: false,
  });
  queryClient.setQueryData(billingQueryKeys.subscription, {
    subscriptionStatus: "awaiting_checkout",
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    trialEndsAt: null,
    price: { amount: 1200, currency: "usd", interval: "month" },
    paymentMethod: null,
    invoices: [],
  });
};

const renderTrialFlow = async (
  config: TrialTestConfig,
  initialRoute = "/day?auth=signup",
) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  seedBillingQueries(queryClient, config);
  seedBillingQueries(appQueryClient, config);

  const router = createTestRouter(
    <QueryClientProvider client={queryClient}>
      <AuthModalProvider>
        <AuthModal />
      </AuthModalProvider>
    </QueryClientProvider>,
    { initialEntries: [initialRoute] },
  );

  const view = render(<RouterProvider router={router} />);
  await waitFor(() => {
    expect(router.state.status).toBe("idle");
  });
  return { router, queryClient, ...view };
};

describe("AuthModal signup trial step", () => {
  let emailPassword = createTestEmailPasswordPort();

  beforeEach(() => {
    resetCheckoutMigrationForTests();
    appQueryClient.clear();
    mockSyncPendingLocalEvents.mockClear();
    mockCompleteAuthentication.mockClear().mockResolvedValue(undefined);
    mockUseSession.mockReset().mockReturnValue({
      authenticated: false,
      userId: undefined,
      setAuthenticated: mock(),
    });
    registerUseCompleteAuthenticationForTests(() => mockCompleteAuthentication);
    registerEmailPasswordPort(emailPassword);
    setEmbeddedCheckoutForTests(FakeCheckout);
  });

  afterEach(() => {
    resetEmailPasswordPort();
    useCheckoutPanelStore.setState(initialCheckoutPanelState, true);
    useCheckoutCelebrationStore.setState(initialCheckoutCelebrationState, true);
  });

  it("lands on the trial step after email signup when billing is configured", async () => {
    const user = userEvent.setup();

    emailPassword = createTestEmailPasswordPort();
    emailPassword.signUp.mockResolvedValue({
      status: "OK",
      user: { emails: ["new@example.com"] },
    });
    registerEmailPasswordPort(emailPassword);

    await renderTrialFlow(HOSTED_CONFIG);

    await user.type(screen.getByLabelText("Name"), "Pat");
    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    mockUseSession.mockReturnValue({
      authenticated: true,
      userId: "user-1",
      setAuthenticated: mock(),
    });
    await user.click(screen.getByRole("button", { name: "Sign up" }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Start your 7-day free trial" }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        /Your card will not be charged until .+\. Cancel anytime/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("$12.00 per month")).toBeInTheDocument();
  });

  it("skips the trial step when billing is not configured", async () => {
    const user = userEvent.setup();
    emailPassword = createTestEmailPasswordPort();
    emailPassword.signUp.mockResolvedValue({
      status: "OK",
      user: { emails: ["new@example.com"] },
    });
    registerEmailPasswordPort(emailPassword);

    const { router } = await renderTrialFlow(SELF_HOST_CONFIG);

    await user.type(screen.getByLabelText("Name"), "Pat");
    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign up" }));

    await waitFor(() => {
      expect(router.state.location.searchStr).toBe("");
    });
    expect(
      screen.queryByRole("heading", { name: "Start your 7-day free trial" }),
    ).not.toBeInTheDocument();
  });

  it("shows the billing gate after closing the trial step", async () => {
    const user = userEvent.setup();
    const { router, queryClient } = await renderTrialFlow(
      HOSTED_CONFIG,
      "/day?auth=trial",
    );
    mockUseSession.mockReturnValue({
      authenticated: true,
      userId: "user-1",
      setAuthenticated: mock(),
    });

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Start your 7-day free trial" }),
      ).toBeInTheDocument();
    });

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(router.state.location.searchStr).toBe("");
    });

    render(
      <QueryClientProvider client={queryClient}>
        <BillingGateModal status="awaiting_checkout" />
      </QueryClientProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "Finish starting your trial" }),
    ).toBeInTheDocument();
  });

  it("migrates anonymous events once after checkout completes", async () => {
    const user = userEvent.setup();
    const { queryClient } = await renderTrialFlow(
      HOSTED_CONFIG,
      "/day?auth=trial",
    );
    mockUseSession.mockReturnValue({
      authenticated: true,
      userId: "user-1",
      setAuthenticated: mock(),
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Complete checkout" }),
      ).toBeInTheDocument();
    });

    queryClient.setQueryData(billingQueryKeys.status, {
      subscriptionStatus: "trialing",
      trialEndsAt: "2026-03-08T12:00:00.000Z",
      isReadOnly: false,
      cancelAtPeriodEnd: false,
      needsPaymentMethod: false,
    });

    await user.click(screen.getByRole("button", { name: "Complete checkout" }));

    await waitFor(() => {
      expect(mockSyncPendingLocalEvents).toHaveBeenCalledTimes(1);
    });
  });
});
