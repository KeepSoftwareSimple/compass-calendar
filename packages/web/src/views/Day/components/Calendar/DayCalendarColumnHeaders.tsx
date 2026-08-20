import { type Calendar } from "@core/types/calendar.contracts";
import { useGridMarginLeft } from "@web/grid/grid-margin";
import { GridTimezoneLabel } from "@web/timezone/GridTimezoneLabel";

export const DayCalendarColumnHeaders = ({
  calendars,
}: {
  calendars: Calendar[];
}) => {
  const marginLeft = useGridMarginLeft();
  return (
    <div className="flex min-h-12 shrink-0 bg-background">
      <div
        className="flex shrink-0 items-center justify-center"
        style={{ width: marginLeft }}
      >
        <GridTimezoneLabel />
      </div>
      {calendars.length > 0 ? (
        <section
          aria-label="Calendars"
          className="grid min-h-12 min-w-0 flex-1"
          style={{
            gridTemplateColumns: `repeat(${calendars.length}, minmax(0, 1fr))`,
          }}
        >
          {calendars.map((calendar) => (
            <div
              className="flex min-w-0 items-center justify-center gap-2 border-border border-l px-3 last:border-r"
              key={calendar.id}
            >
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: calendar.backgroundColor }}
              />
              <span className="truncate text-sm text-text">
                {calendar.name}
              </span>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
};
