import { useCallback, useEffect, useRef, useState } from "react";
import { readBootVisibleDayCount } from "@web/common/utils/boot-geometry.util";
import { useGridMarginLeft } from "@web/grid/grid-margin";
import { computeVisibleDayCount } from "@web/views/Week/util/week-window.util";

/**
 * Derives how many day columns the week grid can fit from the measured width
 * of the grid track. Starts from the boot shell's column count when present
 * so the first React paint matches the HTML shell; the ref callback then
 * remeasures during commit.
 */
export const useVisibleDayCount = () => {
  const [visibleDayCount, setVisibleDayCount] = useState(
    readBootVisibleDayCount,
  );
  const observerRef = useRef<ResizeObserver | null>(null);
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const marginLeft = useGridMarginLeft();
  const marginLeftRef = useRef(marginLeft);
  marginLeftRef.current = marginLeft;

  const measureNode = useCallback((node: HTMLDivElement) => {
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: marginLeft changes the measurable width without firing a resize
  useEffect(() => {
    if (nodeRef.current) {
      measureNode(nodeRef.current);
    }
  }, [marginLeft, measureNode]);

  return { trackRef, visibleDayCount };
};
