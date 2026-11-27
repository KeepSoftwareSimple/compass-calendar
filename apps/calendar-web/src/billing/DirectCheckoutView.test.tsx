import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type BillingSubscriptionStatus } from "@core/types/billing.types";
import { BillingApi } from "@web/api/billing.api";
import { setSessionResolved } from "@web/auth/compass/session/auth-session.store";
import { SessionContext } from "@web/auth/compass/session/session.context";
import { billingQueryKeys } from "@web/billing/billing.query";
import { setEmbeddedCheckoutForTests } from "@web/billing/embedded-checkout/embedded-checkout.seam";
import { routeTree } from "@web/routers/router.routes";
import { afterEach, describe, expect, it, spyOn } from "bun:test";

function renderCheckout(path: string, status?: BillingSubscriptionStatus) {
  setSessionResolved(true);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(billingQueryKeys.config, {
    version: "test",
    providers: {
      google: { signIn: false, connect: false },
      microsoft: { signIn: false, connect: false },
      apple: { signIn: false, connect: false },
    },
    billing: {
      isConfigured: true,
      enforcement: true,
      trialLengthDays: 7,
      publishableKey: "pk_test_checkout",
    },
  });
  if (status) {
    queryClient.setQueryData(billingQueryKeys.status, {
      subscriptionStatus: status,
      trialEndsAt: null,
      isReadOnly: status === "awaiting_checkout",
      cancelAtPeriodEnd: false,
    });
  }
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <SessionContext.Provider
        value={{
          authenticated: status !== undefined,
          setAuthenticated: () => {},
        }}
      >
        <RouterProvider router={router} />
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
  return router;
}

describe("Direct checkout", () => {
  afterEach(() => {
    setSessionResolved(false);
    setEmbeddedCheckoutForTests(null);
  });

  it("preserves the offer and plan when a new visitor switches to login", async () => {
    const router = renderCheckout(
      "/checkout?promo=AHAB30&plan=annual&auth=signup",
    );
    await screen.findByRole("heading", { name: "Nice to meet you" });
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));
    await screen.findByRole("heading", { name: "Hey, welcome back" });
    expect(router.state.location.search).toMatchObject({
      auth: "login",
      plan: "annual",
      promo: "AHAB30",
    });
  });

  it("keeps the promotion when an eligible account switches plans", async () => {
    using checkout = spyOn(
      BillingApi,
      "createCheckoutSession",
    ).mockResolvedValue({
      clientSecret: "cs_checkout",
    });
    setEmbeddedCheckoutForTests(() => <p>Stripe checkout form</p>);
    renderCheckout("/checkout?promo=ahab30", "awaiting_checkout");

    await userEvent.click(
      await screen.findByRole("link", { name: "Monthly plan" }),
    );
    await screen.findByText("Stripe checkout form");
    expect(checkout).toHaveBeenLastCalledWith({
      plan: "monthly",
      promotionCode: "AHAB30",
    });

    await userEvent.click(screen.getByRole("link", { name: "Annual plan" }));
    await waitFor(() => {
      expect(checkout).toHaveBeenLastCalledWith({
        plan: "annual",
        promotionCode: "AHAB30",
      });
    });
  });

  it("sends an existing trial to billing instead of creating checkout", async () => {
    using checkout = spyOn(BillingApi, "createCheckoutSession");
    renderCheckout("/checkout?promo=AHAB30&plan=annual", "trialing");

    const link = await screen.findByRole("link", { name: "Manage billing" });
    expect(link).toHaveAttribute("href", "/week?settings=billing");
    expect(checkout).not.toHaveBeenCalled();
  });
});
