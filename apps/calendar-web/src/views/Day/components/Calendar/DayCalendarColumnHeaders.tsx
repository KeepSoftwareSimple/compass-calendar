import { type Calendar } from "@core/types/calendar.contracts";
import { useGridMarginLeft } from "@web/grid/grid-margin";
import {
  dayColumnJumpId,
  pageJumpAttrs,
} from "@web/shortcuts/page-jump/page-jump.targets";
import { GridTimezoneLabel } from "@web/timezone/GridTimezoneLabel";
import { CALENDAR_COLUMN_ID_ATTRIBUTE } from "./dayCalendarColumnFocus.util";

export const DayCalendarColumnHeaders = ({
  calendars,
  focusedColumnKey,
  onColumnFocusChange,
  writableCalendarIds,
}: {
  calendars: Calendar[];
  focusedColumnKey?: string | null;
  onColumnFocusChange?: (calendarId: string | null) => void;
  writableCalendarIds?: ReadonlySet<string>;
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
          {calendars.map((calendar) => {
            const isWritable = writableCalendarIds?.has(calendar.id) ?? false;
            const isFocused = focusedColumnKey === calendar.id;

            return (
              // biome-ignore lint/a11y/useSemanticElements: fieldset's min-inline-size breaks the flex header; role="group" is the accessible equivalent
              <div
                aria-label={calendar.name}
                role="group"
                className="flex w-full min-w-0 items-center justify-center gap-2 border-border border-l px-3 text-text last:border-r has-[:focus-visible]:bg-accent/15"
                data-focused-column={isFocused ? "true" : undefined}
                key={calendar.id}
              >
                {isWritable ? (
                  <button
                    aria-label={`Focus ${calendar.name} column`}
                    className="c-focus-ring flex w-full min-w-0 items-center justify-center gap-2 rounded-sm"
                    onBlur={(event) => {
                      const next = event.relatedTarget;
                      if (
                        next instanceof HTMLElement &&
                        next.closest(`[${CALENDAR_COLUMN_ID_ATTRIBUTE}]`)
                      ) {
                        return;
                      }
                      onColumnFocusChange?.(null);
                    }}
                    onFocus={() => onColumnFocusChange?.(calendar.id)}
                    type="button"
                    {...pageJumpAttrs(dayColumnJumpId(calendar.id))}
                    {...{ [CALENDAR_COLUMN_ID_ATTRIBUTE]: calendar.id }}
                  >
                    <ColumnLabel
                      backgroundColor={calendar.backgroundColor}
                      name={calendar.name}
                    />
                  </button>
                ) : (
                  <ColumnLabel
                    backgroundColor={calendar.backgroundColor}
                    name={calendar.name}
                  />
                )}
              </div>
            );
          })}
        </section>
      ) : null}
    </div>
  );
};

const ColumnLabel = ({
  backgroundColor,
  name,
}: {
  backgroundColor: string;
  name: string;
}) => (
  <>
    <span
      aria-hidden="true"
      className="size-2 shrink-0 rounded-full"
      style={{ backgroundColor }}
    />
    <span className="truncate text-sm text-text">{name}</span>
  </>
);
