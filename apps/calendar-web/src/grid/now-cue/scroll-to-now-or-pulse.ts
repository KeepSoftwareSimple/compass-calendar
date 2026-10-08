import { scrollTimedGridToNow } from "@web/common/utils/grid/grid.util";
import { nowCueActions } from "@web/grid/now-cue/now-cue.store";

export const scrollToNowOrPulse = (
  timedGrid: HTMLElement | null | undefined,
  behavior: ScrollBehavior = "smooth",
) => {
  if (!timedGrid) return;

  if (!scrollTimedGridToNow(timedGrid, behavior)) {
    nowCueActions.pulse();
  }
};
