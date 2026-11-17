import {
  type AnyRouter,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { AbsoluteOverflowLoader } from "@web/components/AbsoluteOverflowLoader/AbsoluteOverflowLoader";
import { routeTree } from "@web/routers/router.routes";

export const router = createRouter({
  routeTree,
  defaultPendingComponent: AbsoluteOverflowLoader,
  // Fast loaders (the common case) never show the overlay at all; slower
  // ones show it for at least defaultPendingMinMs so it doesn't flash.
  // NOTE: cold `/` → `/week` beforeLoad redirects + this pending UI once hit a
  // TanStack Router race that threw `undefined` (PostHog issue
  // 019fc398-… / TanStack/router#7457). Fixed upstream: 1.170.45 rewrote
  // `MatchInner` so it no longer throws a match's `_nonReactive` load promise,
  // and `CatchBoundary` now boxes the caught error. The local bun patch that
  // mitigated it is gone; if this race ever returns, reopen that issue.
  defaultPendingMs: 300,
  defaultPendingMinMs: 200,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export const CompassRouterProvider = (props?: { router?: AnyRouter }) => {
  return <RouterProvider router={props?.router ?? router} />;
};
