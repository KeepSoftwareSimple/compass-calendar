import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { type ReactElement } from "react";
import { validateAuthSearch } from "@web/components/AuthModal/hooks/useAuthModal";

/**
 * A router whose root route renders `ui` regardless of the matched path. The
 * `$` splat child exists only so any `initialEntries` path matches instead of
 * falling through to `notFoundComponent`. `validateSearch` mirrors the
 * production root route so `useSearch({ from: "__root__" })` works the same
 * way in tests as it does in the app.
 */
export function createTestRouter(
  ui: ReactElement,
  opts?: { initialEntries?: string[] },
) {
  const rootRoute = createRootRoute({
    component: () => ui,
    validateSearch: validateAuthSearch,
  });
  const catchAllRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "$",
  });

  return createRouter({
    routeTree: rootRoute.addChildren([catchAllRoute]),
    history: createMemoryHistory({
      initialEntries: opts?.initialEntries ?? ["/"],
    }),
    defaultPendingMs: 0,
  });
}
