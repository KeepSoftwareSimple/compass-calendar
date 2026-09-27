import { useCallback, useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@web/common/hooks/prefersReducedMotion";

/**
 * Shared dismiss state machine: flip `closing` for a CSS exit transition,
 * then call `onComplete` after `durationMs` (or immediately when the user
 * prefers reduced motion). Clears the timer on unmount.
 */
export function useDismissTransition(durationMs: number) {
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  // Stable across renders: a caller that schedules a dismiss from inside a
  // useEffect (keyed on `beginDismiss` to run once per e.g. "just started
  // celebrating") must not see a fresh function identity on every unrelated
  // re-render, or that effect's cleanup restarts the timer indefinitely.
  const beginDismiss = useCallback(
    (onComplete: () => void): boolean => {
      if (closingRef.current) return false;
      closingRef.current = true;
      setClosing(true);
      const delay = prefersReducedMotion() ? 0 : durationMs;
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        // Clear closing before onComplete so stay-mounted surfaces
        // (UpNextBanner) can dismiss a later event, and so both updates
        // batch in one render.
        closingRef.current = false;
        setClosing(false);
        onComplete();
      }, delay);
      return true;
    },
    [durationMs],
  );

  // Abort a fade without running onComplete — used when a later handoff
  // (welcome → auth) must keep the previous surface mounted underneath.
  const cancelDismiss = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    closingRef.current = false;
    setClosing(false);
  }, []);

  return { closing, beginDismiss, cancelDismiss };
}
