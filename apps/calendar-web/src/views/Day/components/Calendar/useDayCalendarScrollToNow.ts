import { type RefObject, useCallback, useEffect } from "react";
import { onViewCommand } from "@web/common/utils/dom/view-command-bus";
import { getScrollToNowTop } from "@web/common/utils/grid/grid.util";

export const useDayCalendarScrollToNow = (
  mainGridRef: RefObject<HTMLElement | null>,
) => {
  const scrollToNow = useCallback(() => {
    const timedGrid = mainGridRef.current;
    if (!timedGrid) return;

    timedGrid.scroll({
      behavior: "smooth",
      top: getScrollToNowTop(timedGrid.clientHeight),
    });
  }, [mainGridRef]);

  useEffect(() => {
    if (mainGridRef.current) scrollToNow();
  }, [mainGridRef, scrollToNow]);

  // scrollToNow is stable (depends only on the stable mainGridRef), and
  // onViewCommand returns its own unsubscribe, so subscribe directly.
  useEffect(
    () => onViewCommand("SCROLL_TO_NOW_LINE", scrollToNow),
    [scrollToNow],
  );
};
