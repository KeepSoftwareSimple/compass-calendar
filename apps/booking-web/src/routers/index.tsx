import { routeTree } from "@booking-web/routers/router.routes";
import {
  type AnyRouter,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

export const router = createRouter({
  routeTree,
  defaultPendingMs: 300,
  defaultPendingMinMs: 200,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export const BookingRouterProvider = (props?: { router?: AnyRouter }) => {
  return <RouterProvider router={props?.router ?? router} />;
};
