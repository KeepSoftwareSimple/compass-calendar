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
    <div className="flex h-full flex-col" style={{ width }}>
      {labels.map((label, hour) => (
        <div
          className="h-[calc(100%/var(--calendar-visible-hours))] text-text-muted"
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
