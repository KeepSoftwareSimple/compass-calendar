import { useEffect, useState } from "react";

/**
 * Forces a re-render on window resize or any (possibly nested) scroll while
 * `active`, so portaled hint chips re-measure their anchors' positions.
 * Shared by ShiftHintOverlay and FormDigitHintOverlay.
 */
export function useHintLayoutRefresh(active: boolean): void {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!active) return;

    const refresh = () => setTick((tick) => tick + 1);
    window.addEventListener("resize", refresh);
    // Capture scroll from nested scrollers (grid, form body).
    window.addEventListener("scroll", refresh, true);
    return () => {
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh, true);
    };
  }, [active]);
}
