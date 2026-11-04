import cn from "classnames";
import { ZIndex } from "@web/common/constants/web.constants";

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
          ? "right-0 w-[50px] -translate-y-1/2 text-center font-medium text-[10px] leading-none"
          : "c-now-time-label-pill left-0 max-w-[56px] -translate-x-full -translate-y-1/2 rounded-full border border-accent/35 bg-background px-1.5 py-0.5 font-medium text-[10px] leading-none shadow-[0_0_0_1px_var(--color-background)]",
      )}
      data-testid="now-time-label"
      data-now-label-variant={variant}
      style={{
        top: `${topPercent}%`,
        zIndex: ZIndex.LAYER_3,
        ...(variant === "week-column"
          ? { width: "max-content", minWidth: "3.25rem" }
          : { width: "var(--calendar-now-label-width, 50px)" }),
      }}
    >
      {label}
    </span>
  );
}
