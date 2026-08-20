import { type FC } from "react";
import { type CSSVariables } from "@web/common/styles/css.types";
import { useGridMarginLeft } from "@web/grid/grid-margin";
import { useWeekInteractionEdgeNavigationState } from "@web/views/Week/interaction/state/edge-navigation.state";

export const EdgeNavigationIndicators: FC = () => {
  const dragEdgeState = useWeekInteractionEdgeNavigationState();
  const marginLeft = useGridMarginLeft();
  const { currentEdge, isDragging, progress } = dragEdgeState;

  if (!isDragging || !currentEdge) return null;

  return (
    <div
      className="pointer-events-none absolute inset-y-0 z-1 w-[var(--edge-width)] transition-[width] duration-50 ease-linear data-[position=right]:right-0 data-[position=left]:left-[var(--grid-margin-left)] data-[position=left]:bg-[linear-gradient(to_right,rgb(59_130_246_/_var(--edge-opacity)),transparent)] data-[position=right]:bg-[linear-gradient(to_left,rgb(59_130_246_/_var(--edge-opacity)),transparent)]"
      data-position={currentEdge}
      style={
        {
          "--edge-opacity": 0.04 + (progress / 100) * 0.06,
          "--edge-width": `${24 + 32 * (progress / 100)}px`,
          "--grid-margin-left": `${marginLeft}px`,
        } as CSSVariables
      }
    />
  );
};
