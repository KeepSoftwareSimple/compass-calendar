import { type MutableRefObject, useCallback, useLayoutEffect } from "react";
import { scrollTimedGridToNow } from "@web/common/utils/grid/grid.util";
import { scrollToNowOrPulse } from "@web/grid/now-cue/scroll-to-now-or-pulse";

export const useScroll = (
  timedGridRef: MutableRefObject<HTMLElement | null>,
) => {
  const scrollToNow = useCallback(() => {
    scrollToNowOrPulse(timedGridRef.current);
  }, [timedGridRef]);

  // Mount: jump, don't glide. The HTML boot shell in index.html is already
  // sitting at this position, so an animated scroll here would visibly
  // rewind to midnight and slide back down the moment React replaces it.
  // "t" (today) owns scroll-to-now while viewing the current week; do not
  // bind "c" here — that creates a draft.
  useLayoutEffect(() => {
    const timedGrid = timedGridRef.current;
    if (timedGrid) scrollTimedGridToNow(timedGrid, "instant");
  }, [timedGridRef]);

  return { scrollToNow };
};

export type Util_Scroll = ReturnType<typeof useScroll>;
