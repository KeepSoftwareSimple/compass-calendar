import { useMemo } from "react";
import { type Calendar } from "@core/types/calendar.contracts";
import { TooltipWrapper } from "@web/components/Tooltip/TooltipWrapper";
import { useGridMarginLeft } from "@web/grid/grid-margin";
import {
  dayColumnJumpId,
  pageJumpAttrs,
} from "@web/shortcuts/page-jump/page-jump.targets";
import { GridTimezoneLabel } from "@web/timezone/GridTimezoneLabel";
import { DayCalendarColumnLabel } from "./DayCalendarColumnLabel";
import { dayCalendarColumnDisplayNames } from "./dayCalendarColumnDisplayName.util";
import { CALENDAR_COLUMN_ID_ATTRIBUTE } from "./dayCalendarColumnFocus.util";
import { dayCalendarColumnCountStyle } from "./dayCalendarColumnGrid.util";

export const DayCalendarColumnHeaders = ({
  calendars,
  focusedColumnKey,
  onColumnFocusChange,
  pageJumpDigitByCalendarId,
}: {
  calendars: Calendar[];
  focusedColumnKey?: string | null;
  onColumnFocusChange?: (calendarId: string | null) => void;
  pageJumpDigitByCalendarId?: ReadonlyMap<string, string>;
}) => {
  const marginLeft = useGridMarginLeft();
  const columnGridStyle = dayCalendarColumnCountStyle(calendars.length);
  const displayNames = useMemo(
    () =>
      dayCalendarColumnDisplayNames(calendars.map((calendar) => calendar.name)),
    [calendars],
  );
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
          className="grid min-h-12 min-w-0 flex-1 overflow-hidden"
          style={columnGridStyle}
        >
          {calendars.map((calendar, columnIndex) => {
            const isFocused = focusedColumnKey === calendar.id;
            const jumpDigit = pageJumpDigitByCalendarId?.get(calendar.id);
            const displayName = displayNames[columnIndex] ?? calendar.name;

            return (
              // biome-ignore lint/a11y/useSemanticElements: fieldset's min-inline-size breaks the flex header; role="group" is the accessible equivalent
              <div
                aria-label={calendar.name}
                role="group"
                className="flex min-w-0 overflow-hidden border-border border-l px-2 text-text last:border-r has-[:focus-visible]:bg-accent/15"
                data-focused-column={isFocused ? "true" : undefined}
                key={calendar.id}
              >
                <TooltipWrapper
                  asChild
                  description={calendar.name}
                  shortcut={jumpDigit ? ["Mod", jumpDigit] : undefined}
                >
                  <button
                    aria-label={`Focus ${calendar.name} column`}
                    className="c-focus-ring flex w-full min-w-0 items-center justify-center overflow-hidden rounded-sm"
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
                    <DayCalendarColumnLabel
                      backgroundColor={calendar.backgroundColor}
                      name={displayName}
                    />
                  </button>
                </TooltipWrapper>
              </div>
            );
          })}
        </section>
      ) : null}
    </div>
  );
};
