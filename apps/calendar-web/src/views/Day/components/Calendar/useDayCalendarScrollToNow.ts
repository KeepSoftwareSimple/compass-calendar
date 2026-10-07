import { type RefObject, useEffect } from "react";
import { onViewCommand } from "@web/common/utils/dom/view-command-bus";
import { scrollTimedGridToNow } from "@web/common/utils/grid/grid.util";
import { scrollToNowOrPulse } from "@web/grid/now-cue/scroll-to-now-or-pulse";

export const useDayCalendarScrollToNow = (
  mainGridRef: RefObject<HTMLElement | null>,
) => {
  useEffect(() => {
    const timedGrid = mainGridRef.current;
    if (timedGrid) scrollTimedGridToNow(timedGrid, "smooth");
  }, [mainGridRef]);

  // mainGridRef is stable and onViewCommand returns its own unsubscribe, so
  // subscribe directly. Only the shortcut pulses: an already-at-now grid has
  // nothing to scroll, so the cue is what teaches that "t" landed.
  useEffect(
    () =>
      onViewCommand("SCROLL_TO_NOW_LINE", () =>
        scrollToNowOrPulse(mainGridRef.current),
      ),
    [mainGridRef],
  );
};
