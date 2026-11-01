import { type RefObject, useLayoutEffect, useState } from "react";
import { ID_MAIN } from "@web/common/constants/web.constants";
import {
  resolveUpNextBannerClearancePx,
  stackReachesSidebarFooter,
} from "@web/components/BottomNoticeStack/bottom-notice-stack-lift.util";
import {
  selectUpNextBannerBox,
  useUpNextBannerBoxStore,
} from "@web/components/BottomNoticeStack/up-next-banner-box.store";

export interface BottomNoticeStackLift {
  clearsSidebarFooter: boolean;
  upNextBannerClearancePx: number | null;
}

const NO_LIFT: BottomNoticeStackLift = {
  clearsSidebarFooter: false,
  upNextBannerClearancePx: null,
};

/**
 * Lifts the bottom-left stack only when something actually sits under it:
 * the sidebar footer (when the stack reaches past the main column) or the
 * centered Up Next banner (when it shares the stack's columns). Otherwise the
 * stack keeps the same inset from the bottom as from the left.
 */
export function useBottomNoticeStackLift(
  stackRef: RefObject<HTMLElement | null>,
  isSidebarOpen: boolean,
  enabled: boolean,
): BottomNoticeStackLift {
  const banner = useUpNextBannerBoxStore(selectUpNextBannerBox);
  const [lift, setLift] = useState<BottomNoticeStackLift>(NO_LIFT);

  useLayoutEffect(() => {
    const stack = stackRef.current;
    if (!enabled || !stack) {
      setLift(NO_LIFT);
      return;
    }

    let observedMain: HTMLElement | null = null;
    let observer: ResizeObserver | null = null;

    const update = () => {
      const stackRect = stack.getBoundingClientRect();
      const span = { left: stackRect.left, right: stackRect.right };
      const main = document.getElementById(ID_MAIN);
      if (observer && main !== observedMain) {
        if (observedMain) observer.unobserve(observedMain);
        if (main) observer.observe(main);
        observedMain = main;
      }

      const clearsSidebarFooter =
        isSidebarOpen &&
        stackReachesSidebarFooter(
          span,
          main ? main.getBoundingClientRect().right : null,
        );
      const upNextBannerClearancePx = resolveUpNextBannerClearancePx(
        span,
        banner,
        window.innerHeight,
      );

      setLift((prev) =>
        prev.clearsSidebarFooter === clearsSidebarFooter &&
        prev.upNextBannerClearancePx === upNextBannerClearancePx
          ? prev
          : { clearsSidebarFooter, upNextBannerClearancePx },
      );
    };

    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(update);
      observer.observe(stack);
    }
    update();
    window.addEventListener("resize", update);

    return () => {
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, [stackRef, isSidebarOpen, enabled, banner]);

  return lift;
}
