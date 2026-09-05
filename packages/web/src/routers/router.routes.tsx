import {
  createRootRoute,
  createRoute,
  lazyRouteComponent,
} from "@tanstack/react-router";
import {
  validateBookingCancelSearch,
  validateBookingRescheduleSearch,
  validatePublicBookingSearch,
} from "@web/booking/public-booking-search";
import {
  IS_BOOKING_ENABLED,
  IS_DEV,
} from "@web/common/constants/env.constants";
import { ROOT_ROUTES } from "@web/common/constants/routes";
import { validateAuthSearch } from "@web/components/AuthModal/hooks/useAuthModal";
import {
  loadAuthenticated,
  loadDateParam,
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

export const publicBookRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ROOT_ROUTES.BOOK,
  validateSearch: validatePublicBookingSearch,
  component: lazyRouteComponent(
    () => import("@web/booking/PublicBookingPage"),
    "PublicBookingPage",
  ),
});

export const publicBookCancelRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ROOT_ROUTES.BOOK_CANCEL,
  validateSearch: validateBookingCancelSearch,
  component: lazyRouteComponent(
    () => import("@web/booking/PublicBookingCancelPage"),
    "PublicBookingCancelPage",
  ),
});

export const publicBookRescheduleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ROOT_ROUTES.BOOK_RESCHEDULE,
  validateSearch: validateBookingRescheduleSearch,
  component: lazyRouteComponent(
    () => import("@web/booking/PublicBookingReschedulePage"),
    "PublicBookingReschedulePage",
  ),
});

export const publicBookConfirmedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ROOT_ROUTES.BOOK_CONFIRMED,
  validateSearch: validateBookingCancelSearch,
  component: lazyRouteComponent(
    () => import("@web/booking/PublicBookingConfirmedPage"),
    "PublicBookingConfirmedPage",
  ),
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
  loader: loadDateParam,
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
  component: lazyRouteComponent(
    () => import("@web/views/Week/WeekView"),
    "WeekView",
  ),
});

export const weekDateRoute = createRoute({
  getParentRoute: () => weekRoute,
  path: "$dateString",
  beforeLoad: validateWeekDateParam,
  loader: loadDateParam,
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

/** @deprecated One-release alias; `/auth/google/callback` is handled by `providerAuthCallbackRoute`. */
const googleAuthCallbackRoute = providerAuthCallbackRoute;
void googleAuthCallbackRoute;

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
  ...(IS_BOOKING_ENABLED
    ? [
        publicBookConfirmedRoute,
        publicBookCancelRoute,
        publicBookRescheduleRoute,
        publicBookRoute,
      ]
    : []),
  providerAuthCallbackRoute,
]);
