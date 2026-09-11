import { type MutableRefObject, useCallback, useLayoutEffect } from "react";
import { getScrollToNowTop } from "@web/common/utils/grid/grid.util";

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

  const scrollToNow = useCallback(() => scrollTo("smooth"), [scrollTo]);

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
