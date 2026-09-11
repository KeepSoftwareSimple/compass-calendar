import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { delay, HttpResponse, http } from "msw";
import { type PropsWithChildren } from "react";
import { server } from "@web/__tests__/__mocks__/server/mock.server";
import { jsonResponse } from "@web/__tests__/helpers/msw-v2";
import { SessionContext } from "@web/auth/compass/session/session.context";
import { billingQueryKeys } from "@web/billing/billing.query";
import { useAppAccess } from "@web/billing/useAppAccess";
import { ENV_WEB } from "@web/common/constants/env.constants";
import { beforeEach, describe, expect, it } from "bun:test";

const createWrapper = (authenticated = false, client?: QueryClient) => {
  const queryClient =
    client ??
    new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  return ({ children }: PropsWithChildren) => (
    <SessionContext.Provider
      value={{ authenticated, setAuthenticated: () => {} }}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SessionContext.Provider>
  );
};

const stubConfig = (isConfigured: boolean, enforcement = true) => {
  server.use(
    http.get(`${ENV_WEB.API_BASEURL}/config`, () =>
      jsonResponse({
        version: "dev",
        google: { isConfigured: false },
        billing: {
          isConfigured,
          enforcement,
          trialLengthDays: 7,
        },
      }),
    ),
  );
};

const stubBilling = (body: {
  subscriptionStatus: string;
  trialEndsAt: string | null;
  isReadOnly: boolean;
  cancelAtPeriodEnd?: boolean;
}) => {
  server.use(
    http.get(`${ENV_WEB.API_BASEURL}/billing/status`, () => jsonResponse(body)),
  );
};

describe("useAppAccess", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("leaves an anonymous visitor open, with no clock to expire", async () => {
    stubConfig(true);
    const { result } = renderHook(() => useAppAccess(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current).toEqual({ kind: "open" });
    });
  });

  it("returns server trialing status with the trial end date", async () => {
    stubConfig(true);
    stubBilling({
      subscriptionStatus: "trialing",
      trialEndsAt: "2026-09-03T00:00:00.000Z",
      isReadOnly: false,
    });

    const { result } = renderHook(() => useAppAccess(), {
      wrapper: createWrapper(true),
    });
    await waitFor(() => {
      expect(result.current).toEqual({
        kind: "server",
        status: "trialing",
        isReadOnly: false,
        trialEndsAt: "2026-09-03T00:00:00.000Z",
        // The schema defaults an absent cancelAtPeriodEnd to false, so an
        // older server response still parses.
        cancelAtPeriodEnd: false,
      });
    });
  });

  it("passes through a scheduled cancel on a trialing account", async () => {
    stubConfig(true);
    stubBilling({
      subscriptionStatus: "trialing",
      trialEndsAt: "2026-09-03T00:00:00.000Z",
      isReadOnly: false,
      cancelAtPeriodEnd: true,
    });

    const { result } = renderHook(() => useAppAccess(), {
      wrapper: createWrapper(true),
    });
    await waitFor(() => {
      expect(result.current).toMatchObject({
        kind: "server",
        status: "trialing",
        cancelAtPeriodEnd: true,
      });
    });
  });

  it("fails open while authenticated billing status is loading", () => {
    stubConfig(true);
    server.use(
      http.get(`${ENV_WEB.API_BASEURL}/billing/status`, async () => {
        await delay(500);
        return jsonResponse({
          subscriptionStatus: "active",
          trialEndsAt: null,
          isReadOnly: false,
        });
      }),
    );

    const { result } = renderHook(() => useAppAccess(), {
      wrapper: createWrapper(true),
    });
    expect(result.current).toEqual({ kind: "open" });
  });

  it("fails open when billing status fetch fails", async () => {
    stubConfig(true);
    server.use(
      http.get(
        `${ENV_WEB.API_BASEURL}/billing/status`,
        () => new HttpResponse(null, { status: 500 }),
      ),
    );

    const { result } = renderHook(() => useAppAccess(), {
      wrapper: createWrapper(true),
    });
    await waitFor(() => {
      expect(result.current).toEqual({ kind: "open" });
    });
  });

  it("fails open when Stripe is unconfigured", async () => {
    stubConfig(false);

    const { result } = renderHook(() => useAppAccess(), {
      wrapper: createWrapper(true),
    });
    await waitFor(() => {
      expect(result.current).toEqual({ kind: "open" });
    });
  });

  it("returns server active status", async () => {
    stubConfig(true);
    stubBilling({
      subscriptionStatus: "active",
      trialEndsAt: null,
      isReadOnly: false,
    });

    const { result } = renderHook(() => useAppAccess(), {
      wrapper: createWrapper(true),
    });
    await waitFor(() => {
      expect(result.current).toEqual({
        kind: "server",
        status: "active",
        isReadOnly: false,
        trialEndsAt: null,
        cancelAtPeriodEnd: false,
      });
    });
  });

  it("returns server awaiting_checkout as read-only", async () => {
    stubConfig(true);
    stubBilling({
      subscriptionStatus: "awaiting_checkout",
      trialEndsAt: null,
      isReadOnly: true,
    });

    const { result } = renderHook(() => useAppAccess(), {
      wrapper: createWrapper(true),
    });
    await waitFor(() => {
      expect(result.current).toMatchObject({
        kind: "server",
        status: "awaiting_checkout",
        isReadOnly: true,
      });
    });
  });

  it("does not fetch billing status once the session is gone", () => {
    stubConfig(true);
    let billingHits = 0;
    server.use(
      http.get(`${ENV_WEB.API_BASEURL}/billing/status`, () => {
        billingHits += 1;
        return new HttpResponse(null, { status: 401 });
      }),
    );

    const { result } = renderHook(() => useAppAccess(), {
      wrapper: createWrapper(false),
    });
    expect(result.current).toEqual({ kind: "open" });
    expect(billingHits).toBe(0);
  });

  it("returns open for an anonymous visitor when enforcement is paused", async () => {
    stubConfig(true, false);

    const { result } = renderHook(() => useAppAccess(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => {
      expect(result.current).toEqual({ kind: "open" });
    });
  });

  it("returns open when enforcement is paused for an authenticated, read-only account", async () => {
    stubConfig(true, false);
    stubBilling({
      subscriptionStatus: "awaiting_checkout",
      trialEndsAt: null,
      isReadOnly: true,
    });

    const { result } = renderHook(() => useAppAccess(), {
      wrapper: createWrapper(true),
    });
    await waitFor(() => {
      expect(result.current).toEqual({ kind: "open" });
    });
  });

  it("fails open while config is pending", () => {
    server.use(
      http.get(`${ENV_WEB.API_BASEURL}/config`, async () => {
        await delay(500);
        return jsonResponse({
          version: "dev",
          google: { isConfigured: false },
          billing: {
            isConfigured: true,
            enforcement: true,
            trialLengthDays: 7,
          },
        });
      }),
    );

    const { result } = renderHook(() => useAppAccess(), {
      wrapper: createWrapper(),
    });
    expect(result.current).toEqual({ kind: "open" });
  });

  it("does not keep a cached read-only billing gate after the session is gone", () => {
    stubConfig(true);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(billingQueryKeys.status, {
      subscriptionStatus: "awaiting_checkout",
      trialEndsAt: null,
      isReadOnly: true,
    });
    let billingHits = 0;
    server.use(
      http.get(`${ENV_WEB.API_BASEURL}/billing/status`, () => {
        billingHits += 1;
        return new HttpResponse(null, { status: 401 });
      }),
    );

    const { result } = renderHook(() => useAppAccess(), {
      wrapper: createWrapper(false, client),
    });
    expect(result.current).toEqual({ kind: "open" });
    expect(billingHits).toBe(0);
  });
});
