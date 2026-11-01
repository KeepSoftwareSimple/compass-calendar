/** Horizontal extent of a fixed element, in viewport px. */
export interface HorizontalSpan {
  left: number;
  right: number;
}

/** Layout box of the centered Up Next banner, in viewport px. */
export interface UpNextBannerBox extends HorizontalSpan {
  top: number;
}

/** Matches the stack's `gap-3` so a lifted stack reads as one column. */
export const BOTTOM_NOTICE_OBSTACLE_GAP_PX = 12;

const OVERLAP_TOLERANCE_PX = 0.5;

export const spansOverlap = (a: HorizontalSpan, b: HorizontalSpan) =>
  a.left < b.right - OVERLAP_TOLERANCE_PX &&
  b.left < a.right - OVERLAP_TOLERANCE_PX;

/**
 * The sidebar sits to the right of the main column, so the bottom-left stack
 * only reaches its footer when the stack extends past the main column's right
 * edge (narrow viewports). Wide layouts keep the default bottom inset.
 */
export const stackReachesSidebarFooter = (
  stack: HorizontalSpan,
  mainRight: number | null,
) => mainRight !== null && stack.right > mainRight + OVERLAP_TOLERANCE_PX;

/**
 * Bottom offset that keeps the stack above the centered Up Next banner, or
 * null when the banner is hidden or does not share the stack's columns.
 */
export const resolveUpNextBannerClearancePx = (
  stack: HorizontalSpan,
  banner: UpNextBannerBox | null,
  viewportHeight: number,
): number | null => {
  if (!banner || !spansOverlap(stack, banner)) return null;
  return (
    Math.round(Math.max(0, viewportHeight - banner.top)) +
    BOTTOM_NOTICE_OBSTACLE_GAP_PX
  );
};
