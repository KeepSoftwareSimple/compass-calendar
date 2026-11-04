import cn from "classnames";
import { type FC } from "react";
import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import { type Dayjs } from "@core/util/date/dayjs";
import { type GridVisibleDate } from "@web/grid/types/grid.types";
import { allDayColumnTintStyle } from "@web/grid/utils/allDayColumnTint.util";
import {
  selectEventJumpActiveDayKeys,
  useEventJumpStore,
} from "@web/shortcuts/shift-hint/event-jump.store";

const COLUMN_CLASS =
  "relative box-border block h-full min-w-[var(--calendar-column-min-width)] border-border border-l transition-colors duration-150 data-[focused-column=true]:bg-accent/10 data-[jump-day=true]:bg-accent/10 motion-reduce:transition-none";

// Only the timed grid dims past days, and it keeps the accent tints winning
// over the dimmed fill.
const PAST_COLUMN_CLASS =
  "data-[past=true]:data-[focused-column=true]:bg-accent/10 data-[past=true]:data-[jump-day=true]:bg-accent/10 data-[past=true]:bg-surface";

interface GridDayColumnHeadersProps {
  highlightedColumnKey?: string | null;
  /**
   * Dims the columns before this day. Omitted by surfaces that do not mark
   * the past, which also leaves `data-past` off their columns.
   */
  pastBefore?: Dayjs;
  visibleDates: GridVisibleDate[];
}

/**
 * The day columns both grid surfaces paint behind their events: one header
 * cell per visible date, carrying its calendar tint and its jump-day,
 * focused-column and past states. `display: contents` keeps the table
 * semantics while the cells lay out in the parent's column grid, so the
 * parent owns the grid template and this owns the cells.
 */
export const GridDayColumnHeaders: FC<GridDayColumnHeadersProps> = ({
  highlightedColumnKey = null,
  pastBefore,
  visibleDates,
}) => {
  const activeDayKeys = useEventJumpStore(selectEventJumpActiveDayKeys);

  return (
    <table className="contents">
      <thead className="contents">
        <tr className="contents">
          {visibleDates.map(({ date, key, surfaceLabel, allDayTintColor }) => {
            const dayKey = date.format(YEAR_MONTH_DAY_FORMAT);
            const isJumpDay = activeDayKeys.includes(dayKey);
            const isFocusedColumn = key === highlightedColumnKey;
            const tintStyle = allDayColumnTintStyle(
              allDayTintColor,
              isJumpDay || isFocusedColumn,
            );
            return (
              <th
                className={cn(COLUMN_CLASS, {
                  [PAST_COLUMN_CLASS]: pastBefore !== undefined,
                })}
                data-all-day-tint={tintStyle ? "true" : undefined}
                data-focused-column={isFocusedColumn ? "true" : undefined}
                data-jump-day={isJumpDay ? "true" : undefined}
                data-grid-date={dayKey}
                data-past={
                  pastBefore ? date.isBefore(pastBefore, "day") : undefined
                }
                aria-label={surfaceLabel ?? date.format("dddd, MMMM D, YYYY")}
                key={key}
                scope="col"
                style={tintStyle}
              />
            );
          })}
        </tr>
      </thead>
    </table>
  );
};
