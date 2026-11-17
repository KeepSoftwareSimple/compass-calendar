import {
  createRootRoute,
  createRoute,
  lazyRouteComponent,
} from "@tanstack/react-router";
import { APPLE_AUTH_CALLBACK_PATH } from "@web/auth/apple/authorization/apple-authorization.constants";
import { IS_DEV } from "@web/common/constants/env.constants";
import { ROOT_ROUTES } from "@web/common/constants/routes";
import { validateAuthSearch } from "@web/components/AuthModal/hooks/useAuthModal";
import { ShortcutsCatalogView } from "@web/components/ShortcutsPage/ShortcutsCatalogView";
import {
  loadAuthenticated,
  loadDayDate,
  loadWeekDate,
  loadWeekEvents,
  redirectToDefaultCalendar,
  redirectToToday,
  validateDayDateParam,
  validateWeekDateParam,
} from "@web/routers/loaders";
import { validateLifeSearch } from "@web/views/Life/life-search";
import { NotFoundView } from "@web/views/NotFound/NotFound";

export const rootRoute = createRootRoute({
  component: lazyRouteComponent(
    () => import("@web/components/RootShell/AppRoot"),
    "AppRoot",
  ),
  notFoundComponent: NotFoundView,
  validateSearch: validateAuthSearch,
});

export const calendarShellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "calendar-shell",
  component: lazyRouteComponent(
    () => import("@web/components/RootShell/RootShell"),
    "RootShell",
  ),
});

export const publicShortcutsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ROOT_ROUTES.SHORTCUTS,
  component: ShortcutsCatalogView,
});

export const lifeRoute = createRoute({
  getParentRoute: () => calendarShellRoute,
  path: ROOT_ROUTES.LIFE,
  validateSearch: validateLifeSearch,
  component: lazyRouteComponent(
    () => import("@web/views/Life/LifeView"),
    "LifeView",
  ),
});

export const authenticatedLayoutRoute = createRoute({
  getParentRoute: () => calendarShellRoute,
  id: "authenticated",
  beforeLoad: loadAuthenticated,
  component: lazyRouteComponent(() => import("@web/views/Root"), "RootView"),
});

export const dayRoute = createRoute({
  getParentRoute: () => authenticatedLayoutRoute,
  path: ROOT_ROUTES.DAY,
  component: lazyRouteComponent(
    () => import("@web/views/Day/view/DayView"),
    "DayView",
  ),
});

export const dayDateRoute = createRoute({
  getParentRoute: () => dayRoute,
  path: "$dateString",
  beforeLoad: validateDayDateParam,
  loader: loadDayDate,
  component: lazyRouteComponent(
    () => import("@web/views/Day/view/DayViewContent"),
    "DayViewContent",
  ),
});

export const dayIndexRoute = createRoute({
  getParentRoute: () => dayRoute,
  path: "/",
  beforeLoad: () => redirectToToday(ROOT_ROUTES.DAY_DATE),
});

export const weekRoute = createRoute({
  getParentRoute: () => authenticatedLayoutRoute,
  path: ROOT_ROUTES.WEEK,
  loader: loadWeekEvents,
  component: lazyRouteComponent(
    () => import("@web/views/Week/WeekView"),
    "WeekView",
  ),
});

export const weekDateRoute = createRoute({
  getParentRoute: () => weekRoute,
  path: "$dateString",
  beforeLoad: validateWeekDateParam,
  loader: loadWeekDate,
});

export const weekIndexRoute = createRoute({
  getParentRoute: () => weekRoute,
  path: "/",
});

export const rootIndexRoute = createRoute({
  getParentRoute: () => authenticatedLayoutRoute,
  path: "/",
  beforeLoad: redirectToDefaultCalendar,
});

export const cleanupRoute = createRoute({
  getParentRoute: () => calendarShellRoute,
  path: ROOT_ROUTES.CLEANUP,
  component: lazyRouteComponent(
    () => import("@web/views/Cleanup/Cleanup"),
    "CleanupView",
  ),
});

export const providerAuthCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ROOT_ROUTES.PROVIDER_AUTH_CALLBACK,
  component: lazyRouteComponent(
    () => import("@web/views/ProviderAuthCallback/ProviderAuthCallback"),
    "ProviderAuthCallbackView",
  ),
});

export const appleAuthCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: APPLE_AUTH_CALLBACK_PATH,
  component: lazyRouteComponent(
    () => import("@web/views/AppleAuthCallback/AppleAuthCallback"),
    "AppleAuthCallbackView",
  ),
});

const authenticatedRoute = authenticatedLayoutRoute.addChildren([
  dayRoute.addChildren([dayDateRoute, dayIndexRoute]),
  weekRoute.addChildren([weekDateRoute, weekIndexRoute]),
  rootIndexRoute,
]);

const calendarShellChildren = calendarShellRoute.addChildren([
  lifeRoute,
  authenticatedRoute,
  ...(IS_DEV ? [cleanupRoute] : []),
]);

export const routeTree = rootRoute.addChildren([
  calendarShellChildren,
  publicShortcutsRoute,
  appleAuthCallbackRoute,
  providerAuthCallbackRoute,
]);
