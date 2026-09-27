import { type RefObject, useLayoutEffect, useRef } from "react";
import { type Dayjs } from "@core/util/date/dayjs";
import { prefersReducedMotion } from "@web/common/hooks/prefersReducedMotion";
import { type WeekNavigationSource } from "@web/views/Week/hooks/useWeek";

const TRANSITION_DURATION_MS = 180;

export const useDayShiftTransition = (
  trackRef: RefObject<HTMLElement | null>,
  startOfView: Dayjs,
  navigationSource: WeekNavigationSource,
) => {
  const previousStartRef = useRef(startOfView);

  useLayoutEffect(() => {
    const previousStart = previousStartRef.current;
    previousStartRef.current = startOfView;

    const track = trackRef.current;
    if (
      !track ||
      navigationSource !== "day-shift" ||
      previousStart.isSame(startOfView, "day") ||
      prefersReducedMotion()
    ) {
      return;
    }

    const direction = startOfView.isAfter(previousStart, "day") ? 1 : -1;
    track.getAnimations().forEach((animation) => animation.cancel());
    track.animate(
      [
        { opacity: 0.82, transform: `translateX(${direction * 12}px)` },
        { opacity: 1, transform: "translateX(0)" },
      ],
      {
        duration: TRANSITION_DURATION_MS,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    );
  }, [navigationSource, startOfView, trackRef]);
};
