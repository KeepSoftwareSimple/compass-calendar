import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { ROOT_ROUTES } from "@web/common/constants/routes";
import {
  appleAuthCallbackRoute,
  authenticatedLayoutRoute,
  calendarShellRoute,
  lifeRoute,
  providerAuthCallbackRoute,
  publicBookCancelRoute,
  publicBookConfirmedRoute,
  publicBookRescheduleRoute,
  publicBookRoute,
  rootRoute,
  routeTree,
  weekDateRoute,
  weekRoute,
} from "@web/routers/router.routes";
import { describe, expect, it } from "bun:test";

createRouter({ routeTree, history: createMemoryHistory() });

describe("routeTree", () => {
  it("registers /life under the calendar shell (not the public booking route)", () => {
    expect(lifeRoute.fullPath).toBe(ROOT_ROUTES.LIFE);
    expect(lifeRoute.options.loader).toBeUndefined();
    expect(lifeRoute.parentRoute).toBe(calendarShellRoute);
  });

  it("registers /meet/$username as a public route outside the calendar shell", () => {
    expect(publicBookRoute.fullPath).toBe("/meet/$username");
    expect(publicBookRoute.options.beforeLoad).toBeUndefined();
    expect(publicBookRoute.parentRoute).toBe(rootRoute);
  });

  it("registers /meet/confirmed/$reservationId as a public route", () => {
    expect(publicBookConfirmedRoute.fullPath).toBe(
      "/meet/confirmed/$reservationId",
    );
    expect(publicBookConfirmedRoute.parentRoute).toBe(rootRoute);
  });

  it("registers /meet/reschedule/$reservationId as a public route", () => {
    expect(publicBookRescheduleRoute.fullPath).toBe(
      "/meet/reschedule/$reservationId",
    );
    expect(publicBookRescheduleRoute.parentRoute).toBe(rootRoute);
  });

  it("registers /meet/cancel/$reservationId as a public route", () => {
    expect(publicBookCancelRoute.fullPath).toBe("/meet/cancel/$reservationId");
    expect(publicBookCancelRoute.parentRoute).toBe(rootRoute);
  });

  it("redirects legacy /book paths to /meet and keeps search params", async () => {
    const hostRouter = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ["/book/x?token=abc"],
      }),
    });
    await hostRouter.load();
    expect(hostRouter.state.location.pathname).toBe("/meet/x");
    expect(hostRouter.state.location.search).toEqual(
      expect.objectContaining({ token: "abc" }),
    );

    const cancelRouter = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ["/book/cancel/000000000000000000000099?token=abc"],
      }),
    });
    await cancelRouter.load();
    expect(cancelRouter.state.location.pathname).toBe(
      "/meet/cancel/000000000000000000000099",
    );
    expect(cancelRouter.state.location.search).toEqual(
      expect.objectContaining({ token: "abc" }),
    );
  });

  it("gates the authenticated layout behind loadAuthenticated inside the calendar shell", () => {
    expect(authenticatedLayoutRoute.options.beforeLoad).toBeDefined();
    expect(authenticatedLayoutRoute.parentRoute).toBe(calendarShellRoute);
  });

  it("prefetches week events from the week route loaders", () => {
    expect(weekRoute.options.loader).toBeDefined();
    expect(weekDateRoute.options.loader).toBeDefined();
  });

  it("registers /auth/google/callback on the provider auth callback route", async () => {
    expect(providerAuthCallbackRoute.fullPath).toBe(
      ROOT_ROUTES.PROVIDER_AUTH_CALLBACK,
    );

    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ["/auth/google/callback?state=test"],
      }),
    });

    await router.load();
    expect(router.state.location.pathname).toBe("/auth/google/callback");
    const callbackMatch = router.state.matches.find((match) =>
      match.routeId.includes("callback"),
    );
    expect(callbackMatch?.params).toEqual(
      expect.objectContaining({ provider: "google" }),
    );
  });

  it("registers /auth/microsoft/callback on the provider auth callback route", async () => {
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ["/auth/microsoft/callback?state=test"],
      }),
    });

    await router.load();
    expect(router.state.location.pathname).toBe("/auth/microsoft/callback");
    const callbackMatch = router.state.matches.find((match) =>
      match.routeId.includes("callback"),
    );
    expect(callbackMatch?.params).toEqual(
      expect.objectContaining({ provider: "microsoft" }),
    );
  });

  it("keeps /auth/apple/callback on the dedicated Apple form_post route", async () => {
    expect(appleAuthCallbackRoute.fullPath).toBe(
      ROOT_ROUTES.APPLE_AUTH_CALLBACK,
    );

    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ["/auth/apple/callback?state=test"],
      }),
    });

    await router.load();
    expect(router.state.location.pathname).toBe("/auth/apple/callback");
    const callbackMatch = router.state.matches.find((match) =>
      match.routeId.includes("callback"),
    );
    expect(callbackMatch?.routeId).toBe(appleAuthCallbackRoute.id);
    expect(callbackMatch?.params).not.toEqual(
      expect.objectContaining({ provider: "apple" }),
    );
  });
});
