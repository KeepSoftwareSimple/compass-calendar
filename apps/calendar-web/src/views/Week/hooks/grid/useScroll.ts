import { type MutableRefObject, useCallback, useLayoutEffect } from "react";
import {
  getScrollToNowTop,
  scrollTimedGridToNow,
} from "@web/common/utils/grid/grid.util";
import { nowCueActions } from "@web/grid/now-cue/now-cue.store";

export const useScroll = (
  timedGridRef: MutableRefObject<HTMLElement | null>,
) => {
  const scrollTo = useCallback(
    (behavior: ScrollBehavior) => {
      if (!timedGridRef.current) return;

      timedGridRef.current.scroll({
        top: getScrollToNowTop(timedGridRef.current.clientHeight),
        behavior,
      });
    },
    [timedGridRef],
  );

  const scrollToNow = useCallback(() => {
    const grid = timedGridRef.current;
    if (!grid) return;

    if (!scrollTimedGridToNow(grid, "smooth")) {
      nowCueActions.pulse();
    }
  }, [timedGridRef]);

  // Mount: jump, don't glide. The HTML boot shell in index.html is already
  // sitting at this position, so an animated scroll here would visibly
  // rewind to midnight and slide back down the moment React replaces it.
  // "t" (today) owns scroll-to-now while viewing the current week; do not
  // bind "c" here — that creates a draft.
  useLayoutEffect(() => {
    scrollTo("instant");
  }, [scrollTo]);

  return { scrollToNow };
};

export type Util_Scroll = ReturnType<typeof useScroll>;
