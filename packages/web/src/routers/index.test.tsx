import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { ROOT_ROUTES } from "@web/common/constants/routes";
import {
  authenticatedLayoutRoute,
  calendarShellRoute,
  lifeRoute,
  providerAuthCallbackRoute,
  publicBookConfirmedRoute,
  publicBookRescheduleRoute,
  publicBookRoute,
  rootRoute,
  routeTree,
} from "@web/routers/router.routes";
import { describe, expect, it } from "bun:test";

createRouter({ routeTree, history: createMemoryHistory() });

describe("routeTree", () => {
  it("registers /life under the calendar shell (not the public booking route)", () => {
    expect(lifeRoute.fullPath).toBe(ROOT_ROUTES.LIFE);
    expect(lifeRoute.options.loader).toBeUndefined();
    expect(lifeRoute.parentRoute).toBe(calendarShellRoute);
  });

  it("registers /book/$username as a public route outside the calendar shell", () => {
    expect(publicBookRoute.fullPath).toBe("/book/$username");
    expect(publicBookRoute.options.beforeLoad).toBeUndefined();
    expect(publicBookRoute.parentRoute).toBe(rootRoute);
  });

  it("registers /book/confirmed/$reservationId as a public route", () => {
    expect(publicBookConfirmedRoute.fullPath).toBe(
      "/book/confirmed/$reservationId",
    );
    expect(publicBookConfirmedRoute.parentRoute).toBe(rootRoute);
  });

  it("registers /book/reschedule/$reservationId as a public route", () => {
    expect(publicBookRescheduleRoute.fullPath).toBe(
      "/book/reschedule/$reservationId",
    );
    expect(publicBookRescheduleRoute.parentRoute).toBe(rootRoute);
  });

  it("gates the authenticated layout behind loadAuthenticated inside the calendar shell", () => {
    expect(authenticatedLayoutRoute.options.beforeLoad).toBeDefined();
    expect(authenticatedLayoutRoute.parentRoute).toBe(calendarShellRoute);
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
});
