import { ROOT_ROUTES } from "./src/common/constants/routes";

/**
 * Paths the calendar-web router (src/routers/router.routes.tsx) renders.
 * self-host/serve-web.ts still answers anything else with index.html, so the
 * client shows its NotFound view, but with HTTP 404 so search engines do not
 * index soft-404 pages. Values come from ROOT_ROUTES; serve-web.test.ts
 * checks every route.
 */
const EXACT_PATHS = new Set<string>([
  ROOT_ROUTES.ROOT,
  ROOT_ROUTES.WEEK,
  ROOT_ROUTES.DAY,
  ROOT_ROUTES.LIFE,
  ROOT_ROUTES.SHORTCUTS,
  ROOT_ROUTES.CLEANUP,
  ROOT_ROUTES.BILLING_DESKTOP_RETURN,
]);

const PARAM_PATHS = [
  /^\/week\/[^/]+$/,
  /^\/day\/[^/]+$/,
  /^\/auth\/[^/]+\/callback$/,
];

/**
 * Public pages whose `<link rel="canonical">` points at themselves rather
 * than the homepage URL index.html ships with. serve-web.ts rewrites the tag
 * in the initial HTML so crawlers see it without running JS; the client's
 * useCanonicalPath keeps it right after in-app navigation.
 */
const SELF_CANONICAL_PATHS = new Set<string>([
  ROOT_ROUTES.LIFE,
  ROOT_ROUTES.SHORTCUTS,
]);

function normalizePath(pathname: string): string {
  return pathname.split("?")[0]?.replace(/\/+$/, "") || "/";
}

/** The canonical path for a self-canonical page, or null to keep the default. */
export function selfCanonicalPath(pathname: string): string | null {
  const path = normalizePath(pathname);
  return SELF_CANONICAL_PATHS.has(path) ? path : null;
}

export function isCalendarSpaPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  return (
    EXACT_PATHS.has(path) || PARAM_PATHS.some((pattern) => pattern.test(path))
  );
}
