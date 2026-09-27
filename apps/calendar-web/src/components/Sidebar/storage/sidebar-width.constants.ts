export const SIDEBAR_DEFAULT_WIDTH = 345;
export const SIDEBAR_MIN_WIDTH = 240;
export const SIDEBAR_MAX_WIDTH = 480;
// Width of the sidebar's resize-handle column.
export const SIDEBAR_DIVIDER_WIDTH = 32;

export const clampSidebarWidth = (width: number) =>
  Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
