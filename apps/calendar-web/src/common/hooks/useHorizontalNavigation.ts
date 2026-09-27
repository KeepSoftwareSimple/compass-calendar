import { type RefObject, useEffect, useRef } from "react";

const GESTURE_IDLE_MS = 180;
const NAVIGATION_THRESHOLD_PX = 60;
const NEW_SWIPE_DELTA_JUMP_PX = 10;
const MOMENTUM_DEAD_PX = 8;

type HorizontalNavigationOptions = {
  containerRef: RefObject<HTMLElement | null>;
  onNext: () => void;
  onPrevious: () => void;
};

const canScrollHorizontally = (
  target: EventTarget | null,
  container: HTMLElement,
  deltaX: number,
) => {
  let element = target instanceof HTMLElement ? target : null;

  while (element && element !== container) {
    const maxScrollLeft = element.scrollWidth - element.clientWidth;
    if (
      maxScrollLeft > 0 &&
      (deltaX > 0 ? element.scrollLeft < maxScrollLeft : element.scrollLeft > 0)
    ) {
      return true;
    }
    element = element.parentElement;
  }

  return false;
};

export const useHorizontalNavigation = ({
  containerRef,
  onNext,
  onPrevious,
}: HorizontalNavigationOptions) => {
  const callbacksRef = useRef({ onNext, onPrevious });

  useEffect(() => {
    callbacksRef.current = { onNext, onPrevious };
  }, [onNext, onPrevious]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let accumulatedDelta = 0;
    let hasNavigated = false;
    let lastDeltaX = 0;
    let resetTimer: ReturnType<typeof setTimeout> | undefined;

    const resetGesture = () => {
      accumulatedDelta = 0;
      hasNavigated = false;
      lastDeltaX = 0;
    };

    const handleWheel = (event: WheelEvent) => {
      if (
        event.ctrlKey ||
        event.metaKey ||
        Math.abs(event.deltaX) <= Math.abs(event.deltaY) ||
        canScrollHorizontally(event.target, container, event.deltaX)
      ) {
        return;
      }

      event.preventDefault();
      clearTimeout(resetTimer);
      resetTimer = setTimeout(resetGesture, GESTURE_IDLE_MS);

      // Trackpad momentum events keep firing (< idle gap apart) long after the
      // fingers lift, so the idle timer alone never releases the gesture lock.
      // Momentum never reverses direction, so a sign flip is always a new
      // swipe. A magnitude jump only counts as one once the tail has decayed
      // to a crawl — a jump right after navigating is just the same swipe
      // still accelerating. A re-swipe mid-tail in the same direction is
      // indistinguishable from momentum and stays swallowed.
      const isNewSwipe =
        hasNavigated &&
        (Math.sign(event.deltaX) !== Math.sign(lastDeltaX) ||
          (Math.abs(lastDeltaX) <= MOMENTUM_DEAD_PX &&
            Math.abs(event.deltaX) >
              Math.abs(lastDeltaX) + NEW_SWIPE_DELTA_JUMP_PX));
      if (isNewSwipe) {
        resetGesture();
      }
      lastDeltaX = event.deltaX;

      if (hasNavigated) return;

      accumulatedDelta += event.deltaX;
      if (Math.abs(accumulatedDelta) < NAVIGATION_THRESHOLD_PX) return;

      hasNavigated = true;
      const navigate =
        accumulatedDelta > 0
          ? callbacksRef.current.onNext
          : callbacksRef.current.onPrevious;
      navigate();
    };

    container.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      clearTimeout(resetTimer);
      container.removeEventListener("wheel", handleWheel);
    };
  }, [containerRef]);
};
