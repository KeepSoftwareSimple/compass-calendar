export const SIDEBAR_DEFAULT_WIDTH = 345;
export const SIDEBAR_MIN_WIDTH = 240;
export const SIDEBAR_MAX_WIDTH = 480;
// Width of the sidebar's resize-handle column.
export const SIDEBAR_DIVIDER_WIDTH = 32;
/** Room the week/day grid keeps when the sidebar is open on a narrow viewport. */
export const SIDEBAR_NARROW_MAIN_MIN_WIDTH = 96;

export const clampSidebarWidth = (width: number) =>
  Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));

/** Sidebar width that fits the viewport while leaving the main grid usable. */
export const resolveSidebarWidthForViewport = (
  storedWidth: number,
  viewportWidth: number,
) => {
  const clampedStored = clampSidebarWidth(storedWidth);
  const maxSidebar =
    viewportWidth - SIDEBAR_DIVIDER_WIDTH - SIDEBAR_NARROW_MAIN_MIN_WIDTH;
  return Math.min(clampedStored, maxSidebar);
};
