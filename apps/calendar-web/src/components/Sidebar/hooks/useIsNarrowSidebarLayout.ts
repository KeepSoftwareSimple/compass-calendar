import { useMediaQuery } from "@web/common/hooks/useMediaQuery";
import { SIDEBAR_MIN_WIDTH_MEDIA_QUERY } from "@web/components/AuthenticatedLayout/responsive.constants";

/**
 * True when the viewport is below the sidebar auto-collapse breakpoint.
 * On these widths the open sidebar can squeeze the calendar header enough
 * that its toggle is clipped, so the sidebar itself must host a close
 * control.
 */
export function useIsNarrowSidebarLayout() {
  const isWideEnough = useMediaQuery(SIDEBAR_MIN_WIDTH_MEDIA_QUERY);
  return !isWideEnough;
}
