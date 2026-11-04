import { useEffect, useState } from "react";
import { PREFERS_REDUCED_MOTION_QUERY } from "@web/common/hooks/prefersReducedMotion";
import { useMediaQuery } from "@web/common/hooks/useMediaQuery";
import {
  COMPASS_FPS,
  COMPASS_FRAME_COUNT,
  COMPASS_GRID,
  COMPASS_REST_FRAME,
  compassFrame,
} from "@web/components/PixelCompass/pixel-compass.util";

/**
 * Pixel-art loading indicator: a brass compass whose needle spins, wobbles,
 * and settles on north. Decorative; the surrounding status region carries
 * the accessible name. Holds still on north under reduced motion.
 */
export function PixelCompass({ className }: { className?: string }) {
  const reduceMotion = useMediaQuery(PREFERS_REDUCED_MOTION_QUERY);
  const [frame, setFrame] = useState(COMPASS_REST_FRAME);

  useEffect(() => {
    if (reduceMotion) return;
    const id = window.setInterval(
      () => setFrame((current) => (current + 1) % COMPASS_FRAME_COUNT),
      1000 / COMPASS_FPS,
    );
    return () => window.clearInterval(id);
  }, [reduceMotion]);

  const runs = compassFrame(reduceMotion ? COMPASS_REST_FRAME : frame);

  return (
    <svg
      aria-hidden="true"
      className={className}
      shapeRendering="crispEdges"
      viewBox={`0 0 ${COMPASS_GRID} ${COMPASS_GRID}`}
    >
      {runs.map(({ x, y, width, fill }) => (
        <rect
          fill={fill}
          height={1}
          key={`${x}-${y}`}
          width={width}
          x={x}
          y={y}
        />
      ))}
    </svg>
  );
}
