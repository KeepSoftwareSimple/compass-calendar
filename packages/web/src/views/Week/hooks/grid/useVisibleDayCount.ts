import { useCallback, useEffect, useRef, useState } from "react";
import { useGridMarginLeft } from "@web/grid/grid-margin";
import { isWeekInteractionMotionActive } from "@web/views/Week/interaction/state/motion.state";
import {
  computeVisibleDayCount,
  WEEK_DAY_COUNT,
} from "@web/views/Week/util/week-window.util";

/**
 * Derives how many day columns the week grid can fit from the measured width
 * of the grid track. Defaults to the full week until a real measurement
 * arrives (the ref callback measures during commit, so the browser never
 * paints the unmeasured fallback). Updates freeze during drag interactions so
 * the window never re-derives mid-gesture.
 */
export const useVisibleDayCount = () => {
  const [visibleDayCount, setVisibleDayCount] = useState(WEEK_DAY_COUNT);
  const observerRef = useRef<ResizeObserver | null>(null);
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const marginLeft = useGridMarginLeft();
  const marginLeftRef = useRef(marginLeft);
  marginLeftRef.current = marginLeft;

  const measureNode = useCallback((node: HTMLDivElement) => {
    if (isWeekInteractionMotionActive()) {
      return;
    }

    const width = node.getBoundingClientRect().width;
    if (!width) {
      // Unmeasurable (e.g. jsdom): keep showing the full week
      return;
    }

    setVisibleDayCount(computeVisibleDayCount(width, marginLeftRef.current));
  }, []);

  const trackRef = useCallback(
    (node: HTMLDivElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      nodeRef.current = node;

      if (!node) {
        return;
      }

      measureNode(node);

      if (typeof ResizeObserver === "undefined") {
        return;
      }

      const observer = new ResizeObserver(() => measureNode(node));
      observer.observe(node);
      observerRef.current = observer;
    },
    [measureNode],
  );

  useEffect(() => {
    marginLeftRef.current = marginLeft;
    if (nodeRef.current) {
      measureNode(nodeRef.current);
    }
  }, [marginLeft, measureNode]);

  return { trackRef, visibleDayCount };
};
