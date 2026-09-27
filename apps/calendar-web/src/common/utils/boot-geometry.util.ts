/** Keep in sync with WEEK_DAY_COUNT in week-window.util.ts. */
const BOOT_MAX_DAY_COUNT = 7;

/**
 * The pre-JS boot shell in index.html already decided sidebar open/closed
 * and how many day columns fit. Read those attributes so the first React
 * commit matches the shell instead of animating from the persisted
 * preference (or a 7-day fallback) into the viewport-correct geometry.
 *
 * Absent attributes (unit tests, non-HTML mounts) fall back to the caller.
 */
export function readBootSidebarOpen(fallback: boolean): boolean {
  if (typeof document === "undefined") return fallback;
  const boot = document.documentElement.dataset.bootSidebar;
  if (boot === "open") return true;
  if (boot === "closed") return false;
  return fallback;
}

export function readBootVisibleDayCount(
  fallback: number = BOOT_MAX_DAY_COUNT,
): number {
  if (typeof document === "undefined") return fallback;
  const count = Number(document.documentElement.dataset.bootCols);
  if (Number.isInteger(count) && count >= 1 && count <= BOOT_MAX_DAY_COUNT) {
    return count;
  }
  return fallback;
}
