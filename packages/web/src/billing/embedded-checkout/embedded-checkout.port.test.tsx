import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { jsonResponse } from "@web/__tests__/helpers/msw-v2";
import { type PropsWithChildren } from "react";
import { server } from "@web/__tests__/__mocks__/server/mock.server";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { useStripePublishableKey } from "@web/billing/billing.query";
import { ENV_WEB } from "@web/common/constants/env.constants";
import {
  registerToastPort,
  resetToastPort,
} from "@web/common/utils/toast/toast.port";
import {
  fetchEmbeddedCheckoutClientSecret,
  getStripePromise,
  resetStripePromiseForTests,
  StripeEmbeddedCheckout,
} from "./embedded-checkout.port";
import {
  type EmbeddedCheckoutProps,
  getEmbeddedCheckoutComponent,
  resetEmbeddedCheckoutForTests,
  setEmbeddedCheckoutForTests,
} from "./embedded-checkout.seam";
import { afterEach, describe, expect, it } from "bun:test";

afterEach(() => {
  resetEmbeddedCheckoutForTests();
  resetStripePromiseForTests();
  resetToastPort();
});

function FakeCheckout({ onComplete }: EmbeddedCheckoutProps) {
  return (
    <button type="button" onClick={onComplete}>
      Complete checkout
    </button>
  );
}

describe("getStripePromise", () => {
  it("returns the same promise for the same key and a different one for a different key", () => {
    const first = getStripePromise("pk_test_a");
    const sameKey = getStripePromise("pk_test_a");
    const otherKey = getStripePromise("pk_test_b");

    expect(first).toBe(sameKey);
    expect(first).not.toBe(otherKey);
  });
});

describe("embedded checkout test seam", () => {
  it("returns a registered fake and restores the lazy default when set to null", () => {
    const DefaultCheckout = getEmbeddedCheckoutComponent();
    expect(DefaultCheckout).not.toBe(StripeEmbeddedCheckout);

    setEmbeddedCheckoutForTests(FakeCheckout);
    expect(getEmbeddedCheckoutComponent()).toBe(FakeCheckout);

    setEmbeddedCheckoutForTests(null);
    expect(getEmbeddedCheckoutComponent()).toBe(DefaultCheckout);
  });

  it("lets a fake complete checkout without loading Stripe.js", async () => {
    setEmbeddedCheckoutForTests(FakeCheckout);
    const Checkout = getEmbeddedCheckoutComponent();
    let completed = false;
    render(
      <Checkout
        publishableKey="pk_test_a"
        fetchClientSecret={() => Promise.resolve("cs_test")}
        onComplete={() => {
          completed = true;
        }}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Complete checkout" }),
    );
    expect(completed).toBe(true);
  });
});

describe("fetchEmbeddedCheckoutClientSecret", () => {
  it("shows the billing error toast when fetchClientSecret rejects", async () => {
    const { port, mocks } = createTestToastPort();
    registerToastPort(port);

    await expect(
      fetchEmbeddedCheckoutClientSecret(() =>
        Promise.reject(new Error("network")),
      ),
    ).rejects.toThrow("network");

    expect(mocks.error).toHaveBeenCalledWith(
      "Couldn't start checkout. Please try again.",
      expect.any(Object),
    );
  });
});

describe("useStripePublishableKey", () => {
  it("reads billing.publishableKey from app config", async () => {
    server.use(
      http.get(`${ENV_WEB.API_BASEURL}/config`, () =>
        jsonResponse({
            version: "dev",
            google: { isConfigured: false },
            billing: {
              isConfigured: true,
              enforcement: true,
              trialLengthDays: 7,
              publishableKey: "pk_test_live",
            },
          }),
      ),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useStripePublishableKey(), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current).toBe("pk_test_live");
    });
  });
});
