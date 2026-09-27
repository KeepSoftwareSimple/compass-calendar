/**
 * Guest booking URLs are served by apps/booking-web (or Caddy in staging).
 * calendar-web static servers use this guard so they never SPA-fallback /meet.
 */
export function isGuestMeetStaticPath(pathname: string): boolean {
  const path = pathname.split("?")[0]?.replace(/\/+$/, "") || "/";
  return (
    path === "/meet" ||
    path === "/book" ||
    path.startsWith("/meet/") ||
    path.startsWith("/book/")
  );
}
