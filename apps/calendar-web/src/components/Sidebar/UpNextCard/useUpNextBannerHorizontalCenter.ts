import { useLayoutEffect, useState } from "react";

const MAIN_GRID_ID = "mainGrid";

/** Keeps a fixed banner centered over the timed grid as the sidebar resizes. */
export function useUpNextBannerHorizontalCenter(
  enabled: boolean,
): number | null {
  const [centerX, setCenterX] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!enabled) {
      setCenterX(null);
      return;
    }

    const update = () => {
      const grid = document.getElementById(MAIN_GRID_ID);
      if (!grid) {
        setCenterX(window.innerWidth / 2);
        return;
      }
      const rect = grid.getBoundingClientRect();
      setCenterX(rect.left + rect.width / 2);
    };

    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    const grid = document.getElementById(MAIN_GRID_ID);
    const observer =
      grid && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(update)
        : null;
    if (grid && observer) {
      observer.observe(grid);
    }

    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, [enabled]);

  return centerX;
}
