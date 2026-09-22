import {
  validateBookingCancelSearch,
  validateBookingRescheduleSearch,
  validatePublicBookingSearch,
} from "@booking-web/booking/public-booking-search";
import {
  LEGACY_BOOK,
  LEGACY_BOOK_CANCEL,
  LEGACY_BOOK_CONFIRMED,
  LEGACY_BOOK_RESCHEDULE,
  ROOT_ROUTES,
} from "@booking-web/common/constants/routes";
import { NotFoundView } from "@booking-web/views/NotFoundView";
import {
  createRootRoute,
  createRoute,
  lazyRouteComponent,
  redirect,
} from "@tanstack/react-router";

export const rootRoute = createRootRoute({
  component: lazyRouteComponent(
    () => import("@booking-web/components/BookingRoot"),
    "BookingRoot",
  ),
  notFoundComponent: NotFoundView,
});

export const publicBookRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ROOT_ROUTES.BOOK,
  validateSearch: validatePublicBookingSearch,
  component: lazyRouteComponent(
    () => import("@booking-web/booking/PublicBookingPage"),
    "PublicBookingPage",
  ),
});

export const publicBookCancelRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ROOT_ROUTES.BOOK_CANCEL,
  validateSearch: validateBookingCancelSearch,
  component: lazyRouteComponent(
    () => import("@booking-web/booking/PublicBookingCancelPage"),
    "PublicBookingCancelPage",
  ),
});

export const publicBookRescheduleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ROOT_ROUTES.BOOK_RESCHEDULE,
  validateSearch: validateBookingRescheduleSearch,
  component: lazyRouteComponent(
    () => import("@booking-web/booking/PublicBookingReschedulePage"),
    "PublicBookingReschedulePage",
  ),
});

export const publicBookConfirmedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ROOT_ROUTES.BOOK_CONFIRMED,
  validateSearch: validateBookingCancelSearch,
  component: lazyRouteComponent(
    () => import("@booking-web/booking/PublicBookingConfirmedPage"),
    "PublicBookingConfirmedPage",
  ),
});

export const legacyBookRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: LEGACY_BOOK,
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: ROOT_ROUTES.BOOK,
      params,
      search,
    });
  },
});

export const legacyBookCancelRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: LEGACY_BOOK_CANCEL,
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: ROOT_ROUTES.BOOK_CANCEL,
      params,
      search,
    });
  },
});

export const legacyBookRescheduleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: LEGACY_BOOK_RESCHEDULE,
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: ROOT_ROUTES.BOOK_RESCHEDULE,
      params,
      search,
    });
  },
});

export const legacyBookConfirmedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: LEGACY_BOOK_CONFIRMED,
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: ROOT_ROUTES.BOOK_CONFIRMED,
      params,
      search,
    });
  },
});

export const routeTree = rootRoute.addChildren([
  publicBookConfirmedRoute,
  publicBookCancelRoute,
  publicBookRescheduleRoute,
  publicBookRoute,
  legacyBookConfirmedRoute,
  legacyBookCancelRoute,
  legacyBookRescheduleRoute,
  legacyBookRoute,
]);
