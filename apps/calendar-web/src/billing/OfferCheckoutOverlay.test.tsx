import "@testing-library/jest-dom";
import { QueryClient } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { type PropsWithChildren } from "react";
import { type BillingSubscriptionStatus } from "@core/types/billing.types";
import { server } from "@web/__tests__/__mocks__/server/mock.server";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import { BillingApi } from "@web/api/billing.api";
import { setSessionResolved } from "@web/auth/compass/session/auth-session.store";
import { SessionContext } from "@web/auth/compass/session/session.context";
import { billingQueryKeys } from "@web/billing/billing.query";
import { setEmbeddedCheckoutForTests } from "@web/billing/embedded-checkout/embedded-checkout.seam";
import { ENV_WEB } from "@web/common/constants/env.constants";
import { CompassRequiredProviders } from "@web/components/CompassProvider/CompassProvider";
import { routeTree } from "@web/routers/router.routes";
import { settingsActions } from "@web/settings/settings.store";
import * as sseProvider from "@web/sse/provider/SSEProvider";
import * as dedication from "@web/views/Week/components/Dedication/Dedication";
import { afterEach, describe, expect, it, spyOn } from "bun:test";

mockModuleForFile(
  "@web/views/Week/components/Dedication/Dedication",
  dedication,
  {
    Dedication: () => null,
  },
);

mockModuleForFile("@web/sse/provider/SSEProvider", sseProvider, {
  default: ({ children }: PropsWithChildren) => children,
});

function renderCheckout(path: string, status?: BillingSubscriptionStatus) {
  setSessionResolved(true);
  server.use(
    http.get(`${ENV_WEB.API_BASEURL}/calendars`, () => HttpResponse.json([])),
  );
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
    <CompassRequiredProviders queryClient={queryClient}>
      <SessionContext.Provider
        value={{
          authenticated: status !== undefined,
          setAuthenticated: () => {},
        }}
      >
        <RouterProvider router={router} />
      </SessionContext.Provider>
    </CompassRequiredProviders>,
  );
  return router;
}

describe("Checkout overlay", () => {
  afterEach(() => {
    setSessionResolved(false);
    setEmbeddedCheckoutForTests(null);
  });

  it("preserves the offer and plan when a new visitor switches to login", async () => {
    const router = renderCheckout(
      "/checkout?promo=AHAB30&plan=annual&auth=signup",
    );
    await screen.findByRole("heading", { name: "Nice to meet you" });
    expect(router.state.location.pathname).toBe("/week");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));
    await screen.findByRole("heading", { name: "Hey, welcome back" });
    expect(router.state.location.search).toMatchObject({
      auth: "login",
      checkout: 1,
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
    const router = renderCheckout(
      "/week?checkout=1&promo=ahab30",
      "awaiting_checkout",
    );
    await screen.findByRole("dialog", { name: "Get 30% off Compass" });

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
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Get 30% off Compass" }),
      ).toBeNull();
      expect(router.state.location.pathname).toBe("/week");
      expect(router.state.location.search).not.toHaveProperty("checkout", 1);
    });
  });

  it("opens checkout from the command palette on the current calendar date", async () => {
    const pathname = "/week/2026-11-22";
    const router = renderCheckout(pathname, "awaiting_checkout");
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: "Open command palette" }),
    );
    await user.type(
      await screen.findByLabelText("Command palette search"),
      "discount codes",
    );
    await user.click(
      await screen.findByRole("option", { name: /discount codes/i }),
    );

    await screen.findByRole("dialog", { name: "Discount codes" });
    expect(router.state.location.pathname).toBe(pathname);
    expect(screen.queryByLabelText("Command palette search")).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Monthly plan" })).toHaveFocus(),
    );
  });

  it("shows eligibility when an active subscriber opens Discount codes", async () => {
    using checkout = spyOn(BillingApi, "createCheckoutSession");
    renderCheckout("/week", "active");
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: "Open command palette" }),
    );
    await user.type(
      await screen.findByLabelText("Command palette search"),
      "discount codes",
    );
    await user.click(
      await screen.findByRole("option", { name: /discount codes/i }),
    );

    await screen.findByRole("dialog", { name: "Discount codes" });
    expect(screen.getByText(/You already have a subscription/)).toBeVisible();
    expect(
      screen.getByText(/before starting your first trial or subscription/),
    ).toBeVisible();
    expect(checkout).not.toHaveBeenCalled();
  });

  it("opens Discount codes from the Life palette for a signed-out visitor", async () => {
    const router = renderCheckout("/life");
    const user = userEvent.setup();

    await waitFor(() => expect(router.state.status).toBe("idle"));
    act(() => settingsActions.openCmdPalette());
    await user.type(
      await screen.findByLabelText("Command palette search"),
      "discount codes",
    );
    await user.click(
      await screen.findByRole("option", { name: /discount codes/i }),
    );

    const panel = await screen.findByRole("dialog", { name: "Discount codes" });
    expect(panel).toBeVisible();
    expect(router.state.location.pathname).toBe("/life");
    expect(screen.getByRole("link", { name: "Log in" })).toBeVisible();
  });

  it("sends an existing trial to billing instead of creating checkout", async () => {
    using checkout = spyOn(BillingApi, "createCheckoutSession");
    renderCheckout("/checkout?promo=AHAB30&plan=annual", "trialing");

    const link = await screen.findByRole("link", { name: "Manage billing" });
    expect(link).toHaveAttribute("href", "/week?settings=billing");
    expect(checkout).not.toHaveBeenCalled();
  });
});
