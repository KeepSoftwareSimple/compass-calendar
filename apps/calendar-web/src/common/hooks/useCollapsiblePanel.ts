import {
  type TransitionEvent,
  useCallback,
  useLayoutEffect,
  useState,
} from "react";

export interface CollapsiblePanelState {
  /** Whether the panel should be in the DOM at all. */
  isMounted: boolean;
  /** Whether the panel's "open" (expanded) styles should be applied. */
  isExpanded: boolean;
  /** Wire directly onto the element whose `width` transition drives the animation. */
  onTransitionEnd: (event: TransitionEvent<HTMLElement>) => void;
}

/**
 * Keeps a panel mounted for the duration of its collapse transition instead
 * of unmounting it instantly, mirroring the open/close pattern in
 * Dedication.tsx: opening flips to the expanded state on the next frame (so
 * the browser has a "before" style to transition from); closing waits for
 * the transition to actually finish before unmounting. On first mount,
 * `isMounted`/`isExpanded` already match `isOpen`, so a panel that starts
 * open never plays an entrance animation on page load.
 *
 * Uses `useLayoutEffect`, not `useEffect`: callers like the sidebar derive
 * `isOpen` from a breakpoint check that itself corrects in a parent's
 * `useLayoutEffect` right after mount (see useResponsiveLayout). Reacting in
 * a passive effect would lag one paint behind that correction, so a narrow
 * first load would flash the panel open before animating it closed.
 * Reacting in a layout effect settles in the same pre-paint phase instead.
 */
export function useCollapsiblePanel(isOpen: boolean): CollapsiblePanelState {
  const [isMounted, setIsMounted] = useState(isOpen);
  const [isExpanded, setIsExpanded] = useState(isOpen);

  useLayoutEffect(() => {
    if (!isOpen) {
      setIsExpanded(false);
      return;
    }

    setIsMounted(true);
    const frame = requestAnimationFrame(() => setIsExpanded(true));
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  const onTransitionEnd = useCallback(
    (event: TransitionEvent<HTMLElement>) => {
      if (event.target !== event.currentTarget) return;
      if (event.propertyName !== "width") return;
      if (isOpen) return;

      setIsMounted(false);
    },
    [isOpen],
  );

  return { isExpanded, isMounted, onTransitionEnd };
}
