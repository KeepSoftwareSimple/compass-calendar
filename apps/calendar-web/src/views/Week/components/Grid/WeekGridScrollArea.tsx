import { type FC, type PropsWithChildren } from "react";
import { ID_WEEK_GRID_SCROLLER } from "@web/common/constants/web.constants";
import { ScrollableRegion } from "@web/components/ScrollableRegion/ScrollableRegion";

export const WeekGridScrollArea: FC<PropsWithChildren> = ({ children }) => {
  return (
    <div className="relative min-h-0 w-full flex-1">
      <ScrollableRegion
        className="peer h-full w-full overflow-x-auto overflow-y-hidden [overscroll-behavior-x:contain] [scrollbar-width:none] focus-visible:outline-none [&::-webkit-scrollbar]:hidden [&::-webkit-scrollbar]:h-0 [&::-webkit-scrollbar]:w-0"
        aria-label="Week calendar horizontal scroll area"
        id={ID_WEEK_GRID_SCROLLER}
      >
        {children}
      </ScrollableRegion>
      {/* Rendered as a sibling overlay, not an outline on the section itself, so the ring isn't clipped by the section's own overflow-y-hidden (which cuts off the top edge behind the all-day row). */}
      <div className="pointer-events-none absolute inset-0 hidden outline outline-1 outline-[var(--accent)] peer-focus-visible:block" />
    </div>
  );
};
