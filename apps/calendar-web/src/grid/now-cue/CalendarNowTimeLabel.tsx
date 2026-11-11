import cn from "classnames";
import { ZIndex } from "@web/common/constants/web.constants";
import { NOW_WEEK_TIME_LABEL_PILL_WIDTH_PX } from "@web/grid/now-cue/now-line-time.util";

type CalendarNowTimeLabelProps = {
  label: string;
  topPercent: number;
  variant: "gutter" | "week-column";
};

export function CalendarNowTimeLabel({
  label,
  topPercent,
  variant,
}: CalendarNowTimeLabelProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute text-accent tabular-nums",
        variant === "gutter"
          ? "right-0 w-[50px] -translate-y-1/2 bg-background px-0.5 py-px text-center font-medium text-[10px] leading-none shadow-[0_0_0_1px_var(--color-background)]"
          : "c-now-time-label-pill left-0 -translate-x-full -translate-y-1/2 rounded-full border border-accent/35 bg-background px-0.5 py-px text-center font-medium text-[9px] leading-none shadow-[0_0_0_1px_var(--color-background)]",
      )}
      data-testid="now-time-label"
      style={{
        top: `${topPercent}%`,
        zIndex: ZIndex.LAYER_3,
        ...(variant === "week-column"
          ? { width: `${NOW_WEEK_TIME_LABEL_PILL_WIDTH_PX}px` }
          : { width: "var(--calendar-now-label-width, 50px)" }),
      }}
    >
      {label}
    </span>
  );
}
