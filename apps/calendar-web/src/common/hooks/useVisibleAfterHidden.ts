import { useEffect, useRef } from "react";

/**
 * Calls `onVisible` when the tab regains visibility after being hidden for at
 * least `thresholdMs`. A quick alt-tab doesn't count as "away" long enough to
 * warrant a recheck. Pass `enabled: false` to skip installing the listener
 * entirely (e.g. while there's nothing to check).
 */
export const useVisibleAfterHidden = (
  onVisible: () => void,
  thresholdMs: number,
  enabled = true,
): void => {
  const hiddenAtRef = useRef<number | null>(null);
  const onVisibleRef = useRef(onVisible);
  onVisibleRef.current = onVisible;

  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        return;
      }
      if (document.visibilityState !== "visible") return;

      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;
      if (hiddenAt === null) return;

      if (Date.now() - hiddenAt >= thresholdMs) {
        onVisibleRef.current();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [thresholdMs, enabled]);
};
