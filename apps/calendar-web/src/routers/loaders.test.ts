import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  isRedirect,
} from "@tanstack/react-router";
import { ROOT_ROUTES } from "@web/common/constants/routes";
import * as prefetchWeekEvents from "@web/events/queries/prefetch-week-events";
import {
  loadDateParam,
  loadTodayData,
  loadWeekDate,
  loadWeekEvents,
  redirectToDefaultCalendar,
  redirectToToday,
  validateWeekDateParam,
} from "@web/routers/loaders";
import { afterEach, describe, expect, it, spyOn } from "bun:test";

function getRedirect(fn: () => unknown) {
  try {
    fn();
  } catch (err) {
    if (!isRedirect(err)) throw err;
    return err;
  }
  throw new Error("expected a redirect to be thrown");
}

// A route tree scoped to just the redirect-relevant shape (no lazy view
// components) - loading the real production routeTree here would preload
// every view's dynamic import as a side effect and pollute other test files
// running later in the same process.
function createTestRouter(initialEntries: string[]) {
  const rootRoute = createRootRoute();
  const dayRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: ROOT_ROUTES.DAY,
  });
  const dayIndexRoute = createRoute({
    getParentRoute: () => dayRoute,
    path: "/",
    beforeLoad: () => redirectToToday(ROOT_ROUTES.DAY_DATE),
  });
  const dayDateRoute = createRoute({
    getParentRoute: () => dayRoute,
    path: "$dateString",
  });
  const weekRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: ROOT_ROUTES.WEEK,
  });
  const weekIndexRoute = createRoute({
    getParentRoute: () => weekRoute,
    path: "/",
    // Bare /week renders the view (no redirect); useWeek derives the anchor.
    component: () => null,
  });
  const weekDateRoute = createRoute({
    getParentRoute: () => weekRoute,
    path: "$dateString",
  });
  const rootIndexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    beforeLoad: redirectToDefaultCalendar,
  });

  return createRouter({
    routeTree: rootRoute.addChildren([
      dayRoute.addChildren([dayIndexRoute, dayDateRoute]),
      weekRoute.addChildren([weekIndexRoute, weekDateRoute]),
      rootIndexRoute,
    ]),
    history: createMemoryHistory({ initialEntries }),
    defaultPendingMs: 0,
  });
}

describe("router redirects", () => {
  it("redirects / to the bare week route", async () => {
    const router = createTestRouter(["/"]);

    await router.load();

    expect(router.state.location.pathname).toBe(ROOT_ROUTES.WEEK);
  });

  it("preserves search params when redirecting / to the week route", async () => {
    const router = createTestRouter(["/?auth=login"]);

    await router.load();

    expect(router.state.location.pathname).toBe(ROOT_ROUTES.WEEK);
    expect(router.state.location.search).toEqual({ auth: "login" });
  });

  it("redirects /day to today's dated day route", async () => {
    const { dateString } = loadTodayData();
    const router = createTestRouter(["/day"]);

    await router.load();

    expect(router.state.location.pathname).toBe(`/day/${dateString}`);
  });

  it("preserves ?auth=login across the today redirect", async () => {
    const { dateString } = loadTodayData();
    const router = createTestRouter(["/day?auth=login"]);

    await router.load();

    expect(router.state.location.pathname).toBe(`/day/${dateString}`);
    expect(router.state.location.search).toEqual({ auth: "login" });
  });

  it("preserves an unrelated search param across the today redirect", async () => {
    const { dateString } = loadTodayData();
    const router = createTestRouter(["/day?ref=newsletter"]);

    await router.load();

    expect(router.state.location.pathname).toBe(`/day/${dateString}`);
    expect(router.state.location.search).toEqual({ ref: "newsletter" });
  });
});

describe("loadDateParam", () => {
  it("shapes the loader data for an already-valid dateString param", () => {
    const result = loadDateParam({
      params: { dateString: "2026-05-20" },
    });

    expect(result).toMatchObject({ dateString: "2026-05-20" });
  });

  // Midnight in the effective timezone. A UTC-mode parse of a date-only
  // string would shift the day's query window and drop evening events.
  it("returns midnight on the requested calendar date", () => {
    const result = loadDateParam({
      params: { dateString: "2026-05-20" },
    });

    expect(result.dateInView.hour()).toBe(0);
    expect(result.dateInView.format("YYYY-MM-DD")).toBe("2026-05-20");
  });
});

describe("validateWeekDateParam", () => {
  it("redirects to the bare week route for an invalid dateString param", () => {
    const redirect = getRedirect(() =>
      validateWeekDateParam({ params: { dateString: "not-a-date" } }),
    );

    expect(redirect.options.to).toBe(ROOT_ROUTES.WEEK);
  });
});

describe("week event prefetch loaders", () => {
  let restorePrefetch: (() => void) | undefined;

  afterEach(() => {
    restorePrefetch?.();
    restorePrefetch = undefined;
  });

  it("prefetches from weekDateRoute then returns the dated loader data", () => {
    const prefetch = spyOn(
      prefetchWeekEvents,
      "prefetchWeekEventsQuery",
    ).mockImplementation(() => undefined);
    restorePrefetch = () => prefetch.mockRestore();

    const result = loadWeekDate({
      params: { dateString: "2026-05-20" },
      location: { pathname: "/week/2026-05-20" },
      context: { authenticated: true },
    });

    expect(result).toMatchObject({ dateString: "2026-05-20" });
    expect(prefetch).toHaveBeenCalledWith({
      dateString: "2026-05-20",
      authenticated: true,
    });
  });

  it("prefetches the dated week from the parent week route pathname", () => {
    const prefetch = spyOn(
      prefetchWeekEvents,
      "prefetchWeekEventsQuery",
    ).mockImplementation(() => undefined);
    restorePrefetch = () => prefetch.mockRestore();

    loadWeekEvents({
      params: {},
      location: { pathname: "/week/2026-05-18" },
      context: { authenticated: true },
    });

    expect(prefetch).toHaveBeenCalledWith({
      dateString: "2026-05-18",
      authenticated: true,
    });
  });
});
