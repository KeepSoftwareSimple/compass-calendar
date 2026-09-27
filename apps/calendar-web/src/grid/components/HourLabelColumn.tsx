import { TIMED_HOUR_SLOT_HEIGHT_CLASS } from "@web/grid/grid.constants";

export function HourLabelColumn({
  colors,
  labels,
  width,
}: {
  colors?: string[];
  labels: string[];
  width: number;
}) {
  return (
    // Block flow, not flex-col: 23 labels (1 AM–11 PM) must overflow this
    // viewport-tall column at one grid-hour each. Flex-shrink would compress
    // them into the visible 13 hours and misalign labels with events.
    <div className="h-full" style={{ width }}>
      {labels.map((label, hour) => (
        <div
          className={`${TIMED_HOUR_SLOT_HEIGHT_CLASS} text-text-muted`}
          // biome-ignore lint/suspicious/noArrayIndexKey: hour slot identity; DST can repeat a wall-clock label.
          key={`hour-${hour + 1}`}
          style={colors ? { color: colors[hour] } : undefined}
        >
          <span className="block text-center text-[10px]">{label}</span>
        </div>
      ))}
    </div>
  );
}
