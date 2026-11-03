/**
 * Paths the calendar-web router (src/routers/router.routes.tsx) renders.
 * self-host/serve-web.ts still answers anything else with index.html, so the
 * client shows its NotFound view, but with HTTP 404 so search engines do not
 * index soft-404 pages. Keep in step with ROOT_ROUTES in
 * src/common/constants/routes.ts; serve-web.test.ts checks every route.
 */
const EXACT_PATHS = new Set([
  "/",
  "/week",
  "/day",
  "/life",
  "/shortcuts",
  "/cleanup",
  "/billing/desktop-return",
]);

const PARAM_PATHS = [
  /^\/week\/[^/]+$/,
  /^\/day\/[^/]+$/,
  /^\/auth\/[^/]+\/callback$/,
];

export function isCalendarSpaPath(pathname: string): boolean {
  const path = pathname.split("?")[0]?.replace(/\/+$/, "") || "/";
  return (
    EXACT_PATHS.has(path) || PARAM_PATHS.some((pattern) => pattern.test(path))
  );
}
