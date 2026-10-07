import { type RefObject, useCallback, useEffect } from "react";
import { onViewCommand } from "@web/common/utils/dom/view-command-bus";
import { scrollTimedGridToNow } from "@web/common/utils/grid/grid.util";
import { scrollToNowOrPulse } from "@web/grid/now-cue/scroll-to-now-or-pulse";

export const useDayCalendarScrollToNow = (
  mainGridRef: RefObject<HTMLElement | null>,
) => {
  const scrollToNow = useCallback(
    (options?: { pulseIfAlreadyAtNow?: boolean }) => {
      const timedGrid = mainGridRef.current;
      if (!timedGrid) return;

      if (options?.pulseIfAlreadyAtNow) {
        scrollToNowOrPulse(timedGrid, "smooth");
        return;
      }

      scrollTimedGridToNow(timedGrid, "smooth");
    },
    [mainGridRef],
  );

  useEffect(() => {
    if (mainGridRef.current) scrollToNow();
  }, [mainGridRef, scrollToNow]);

  // scrollToNow is stable (depends only on the stable mainGridRef), and
  // onViewCommand returns its own unsubscribe, so subscribe directly.
  useEffect(
    () =>
      onViewCommand("SCROLL_TO_NOW_LINE", () =>
        scrollToNow({ pulseIfAlreadyAtNow: true }),
      ),
    [scrollToNow],
  );
};
