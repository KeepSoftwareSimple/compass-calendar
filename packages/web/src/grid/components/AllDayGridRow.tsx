import {
  type FC,
  type MouseEventHandler,
  type ReactNode,
  type RefCallback,
} from "react";
import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import {
  ID_ALLDAY_COLUMNS,
  ID_GRID_ALLDAY_ROW,
} from "@web/common/constants/web.constants";
import { type CSSVariables } from "@web/common/styles/css.types";
import {
  EVENT_ALLDAY_GAP,
  EVENT_ALLDAY_ROW_HEIGHT,
  EVENT_WIDTH_MINIMUM,
  GRID_PADDING_BOTTOM,
  GRID_TIME_STEP,
} from "@web/grid/grid.constants";
import { useGridMarginLeft } from "@web/grid/grid-margin";
import { type GridVisibleDate } from "@web/grid/types/grid.types";
import { allDayColumnTintStyle } from "@web/grid/utils/allDayColumnTint.util";
import {
  selectEventJumpActiveDayKeys,
  useEventJumpStore,
} from "@web/shortcuts/shift-hint/event-jump.store";

interface AllDayRowProps {
  allDayColumnsRef: RefCallback<HTMLDivElement>;
  allDayRowRef: RefCallback<HTMLElement>;
  columnsId?: string;
  eventsLayer: ReactNode;
  gridOffsetTopPx?: number;
  onMouseDown: MouseEventHandler<HTMLElement>;
  rowsCount?: number;
  rowId?: string;
  visibleDates: GridVisibleDate[];
}

const getAllDayRowHeight = (gridOffsetTopPx: number) => {
  const gridHeight = `100% - (${gridOffsetTopPx}px + ${GRID_PADDING_BOTTOM}px)`;
  const gridRowHeight = `(${gridHeight}) / 11`;
  const interval = 60 / GRID_TIME_STEP;

  return `${gridRowHeight} / ${interval}`;
};

/** Fixed-pixel floor so chips at EVENT_ALLDAY_ROW_HEIGHT tops are never clipped. */
const getAllDayRowMinHeightPx = (rowsCount: number) => {
  const rows = Math.max(1, rowsCount);

  return 2 * EVENT_ALLDAY_GAP + rows * EVENT_ALLDAY_ROW_HEIGHT;
};

export const AllDayGridRow: FC<AllDayRowProps> = ({
  allDayColumnsRef,
  allDayRowRef,
  columnsId = ID_ALLDAY_COLUMNS,
  eventsLayer,
  gridOffsetTopPx = 0,
  onMouseDown,
  rowsCount = 0,
  rowId = ID_GRID_ALLDAY_ROW,
  visibleDates,
}) => {
  const activeDayKeys = useEventJumpStore(selectEventJumpActiveDayKeys);
  const marginLeft = useGridMarginLeft();

  return (
    <section
      className="relative flex w-full shrink-0 items-start bg-background"
      aria-label="All-day events"
      id={rowId}
      ref={allDayRowRef}
      onMouseDown={onMouseDown}
      style={{
        height: `calc(${getAllDayRowHeight(gridOffsetTopPx)} * 2 + ${rowsCount * 2 || 1} * ${getAllDayRowHeight(gridOffsetTopPx)})`,
        minHeight: `${getAllDayRowMinHeightPx(rowsCount)}px`,
      }}
    >
      <div
        className="absolute top-0 left-[var(--calendar-grid-margin-left)] grid h-full w-[calc(100%_-_var(--calendar-grid-margin-left))] grid-cols-[repeat(var(--calendar-column-count),minmax(var(--calendar-column-min-width),1fr))] before:pointer-events-none before:absolute before:inset-x-0 before:bottom-0 before:h-0.5 before:bg-border before:content-['']"
        id={columnsId}
        ref={allDayColumnsRef}
        style={
          {
            "--calendar-column-count": visibleDates.length,
            "--calendar-column-min-width": `${EVENT_WIDTH_MINIMUM}px`,
            "--calendar-grid-margin-left": `${marginLeft}px`,
          } as CSSVariables
        }
      >
        <table className="contents">
          <thead className="contents">
            <tr className="contents">
              {visibleDates.map(
                ({ date, key, surfaceLabel, allDayTintColor }) => {
                  const dayKey = date.format(YEAR_MONTH_DAY_FORMAT);
                  const isJumpDay = activeDayKeys.includes(dayKey);
                  const tintStyle = allDayColumnTintStyle(
                    allDayTintColor,
                    isJumpDay,
                  );
                  return (
                    <th
                      className="relative box-border block h-full min-w-[var(--calendar-column-min-width)] border-border border-l transition-colors duration-150 data-[jump-day=true]:bg-accent/10 motion-reduce:transition-none"
                      data-all-day-tint={tintStyle ? "true" : undefined}
                      data-jump-day={isJumpDay ? "true" : undefined}
                      aria-label={
                        surfaceLabel ?? date.format("dddd, MMMM D, YYYY")
                      }
                      key={key}
                      scope="col"
                      style={tintStyle}
                    />
                  );
                },
              )}
            </tr>
          </thead>
        </table>
      </div>
      {eventsLayer}
    </section>
  );
};
