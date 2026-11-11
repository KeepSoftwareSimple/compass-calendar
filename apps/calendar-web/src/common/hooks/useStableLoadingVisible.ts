import { useEffect, useRef, useState } from "react";

export const STABLE_LOADING_SHOW_DELAY_MS = 150;
export const STABLE_LOADING_MIN_VISIBLE_MS = 150;

/**
 * Mirrors a loading flag to the UI after a short delay, and keeps it visible
 * for at least `minVisibleMs` once shown so fast responses do not flicker.
 */
export function useStableLoadingVisible(
  isLoading: boolean,
  showDelayMs = STABLE_LOADING_SHOW_DELAY_MS,
  minVisibleMs = STABLE_LOADING_MIN_VISIBLE_MS,
): boolean {
  const [visible, setVisible] = useState(false);
  const shownAtRef = useRef<number | null>(null);
  const showTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const clearShowTimer = () => {
      if (showTimerRef.current !== null) {
        window.clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
    };
    const clearHideTimer = () => {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };

    if (isLoading) {
      clearHideTimer();
      if (!visible && showTimerRef.current === null) {
        showTimerRef.current = window.setTimeout(() => {
          showTimerRef.current = null;
          shownAtRef.current = Date.now();
          setVisible(true);
        }, showDelayMs);
      }
    } else {
      clearShowTimer();
      if (visible) {
        const shownAt = shownAtRef.current ?? Date.now();
        const remaining = Math.max(0, minVisibleMs - (Date.now() - shownAt));
        clearHideTimer();
        hideTimerRef.current = window.setTimeout(() => {
          hideTimerRef.current = null;
          shownAtRef.current = null;
          setVisible(false);
        }, remaining);
      }
    }

    return () => {
      clearShowTimer();
      clearHideTimer();
    };
  }, [isLoading, minVisibleMs, showDelayMs, visible]);

  return visible;
}
