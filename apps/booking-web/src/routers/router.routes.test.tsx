import {
  meetLandingRoute,
  publicBookCancelRoute,
  publicBookConfirmedRoute,
  publicBookRescheduleRoute,
  publicBookRoute,
  rootRoute,
  routeTree,
} from "@booking-web/routers/router.routes";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { describe, expect, it } from "bun:test";

createRouter({ routeTree, history: createMemoryHistory() });

describe("booking-web routeTree", () => {
  it("registers /meet/$username as a public route", () => {
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

  it("registers bare /meet as the landing route, with and without a slash", async () => {
    expect(meetLandingRoute.fullPath).toBe("/meet");
    expect(meetLandingRoute.parentRoute).toBe(rootRoute);

    for (const path of ["/meet", "/meet/"]) {
      const router = createRouter({
        routeTree,
        history: createMemoryHistory({ initialEntries: [path] }),
      });
      await router.load();
      expect(router.state.statusCode).toBe(200);
      expect(router.state.matches.at(-1)?.routeId).toBe(meetLandingRoute.id);
    }

    const slugRouter = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/meet/someone"] }),
    });
    await slugRouter.load();
    expect(slugRouter.state.matches.at(-1)?.routeId).toBe(publicBookRoute.id);
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
});
