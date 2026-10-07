import { getScrollToNowTop } from "@web/common/utils/grid/grid.util";
import { nowCueActions, useNowCueStore } from "@web/grid/now-cue/now-cue.store";
import { scrollToNowOrPulse } from "@web/grid/now-cue/scroll-to-now-or-pulse";
import { afterEach, describe, expect, it, mock, setSystemTime } from "bun:test";

describe("scrollToNowOrPulse", () => {
  afterEach(() => {
    setSystemTime();
    nowCueActions.resetForTests();
  });

  it("pulses instead of scrolling when already at now", () => {
    setSystemTime(new Date("2026-02-05T12:00:00.000Z"));

    const clientHeight = 1440;
    const scroll = mock(() => {});
    const grid = {
      clientHeight,
      scrollTop: getScrollToNowTop(clientHeight),
      scroll,
    } as unknown as HTMLElement;

    scrollToNowOrPulse(grid);

    expect(scroll).not.toHaveBeenCalled();
    expect(useNowCueStore.getState().pulse).toBe(1);
  });
});
