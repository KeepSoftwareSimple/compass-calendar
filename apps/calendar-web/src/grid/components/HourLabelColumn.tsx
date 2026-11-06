import cn from "classnames";
import { TIMED_HOUR_SLOT_HEIGHT_CLASS } from "@web/grid/grid.constants";

export function HourLabelColumn({
  colors,
  hiddenHourIndex = null,
  labels,
  width,
}: {
  colors?: string[];
  hiddenHourIndex?: number | null;
  labels: string[];
  width: number;
}) {
  return (
    // Block flow, not flex-col: hour labels must overflow this viewport-tall
    // column at one grid-hour each. Flex-shrink would compress them into the
    // visible 13 hours. Row bands, gutter labels, events, and the now line share
    // the 1 AM grid origin via timedGridTopPx (no extra translate here).
    <div className="h-full" style={{ width }}>
      {labels.map((label, hour) => (
        <div
          className={`${TIMED_HOUR_SLOT_HEIGHT_CLASS} text-text-muted`}
          // biome-ignore lint/suspicious/noArrayIndexKey: hour slot identity; DST can repeat a wall-clock label.
          key={`hour-${hour + 1}`}
          style={colors ? { color: colors[hour] } : undefined}
        >
          <span
            className={cn(
              "block text-center text-[10px] transition-opacity duration-150",
              hiddenHourIndex === hour && "opacity-0",
            )}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
