import {
  type FC,
  type MouseEventHandler,
  type ReactNode,
  type RefCallback,
} from "react";
import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import { type Dayjs } from "@core/util/date/dayjs";
import {
  DATA_TIMED_GRID_ROW,
  ID_GRID_COLUMNS_TIMED,
  ID_GRID_MAIN,
  ZIndex,
} from "@web/common/constants/web.constants";
import { useMinuteTick } from "@web/common/hooks/useMinuteTick";
import { type CSSVariables } from "@web/common/styles/css.types";
import { accentGradient } from "@web/common/styles/theme.util";
import { getHourLabels } from "@web/common/utils/datetime/web.date.util";
import { getCurrentPercentOfDay } from "@web/common/utils/grid/grid.util";
import { ScrollableRegion } from "@web/components/ScrollableRegion/ScrollableRegion";
import { CalendarTimeColumn } from "@web/grid/components/CalendarTimeColumn";
import {
  EVENT_WIDTH_MINIMUM,
  TIMED_VISIBLE_HOURS,
} from "@web/grid/grid.constants";
import { useGridMarginLeft } from "@web/grid/grid-margin";
import { type GridVisibleDate } from "@web/grid/types/grid.types";
import { allDayColumnTintStyle } from "@web/grid/utils/allDayColumnTint.util";
import {
  selectEventJumpActiveDayKeys,
  useEventJumpStore,
} from "@web/shortcuts/shift-hint/event-jump.store";

interface TimedGridProps {
  columnsId?: string;
  eventsLayer: ReactNode;
  onMouseDown: MouseEventHandler<HTMLElement>;
  today: Dayjs;
  timedColumnsRef: RefCallback<HTMLDivElement>;
  timedGridId?: string;
  timedGridRef: RefCallback<HTMLElement>;
  visibleDates: GridVisibleDate[];
}

export const TimedGrid: FC<TimedGridProps> = ({
  columnsId = ID_GRID_COLUMNS_TIMED,
  eventsLayer,
  onMouseDown,
  timedColumnsRef,
  timedGridId = ID_GRID_MAIN,
  timedGridRef,
  today,
  visibleDates,
}) => {
  const activeDayKeys = useEventJumpStore(selectEventJumpActiveDayKeys);
  const marginLeft = useGridMarginLeft();
  const todayColumnIndexes = visibleDates.flatMap(({ date }, index) =>
    date.isSame(today, "day") ? [index] : [],
  );
  const labelDay =
    visibleDates.find(({ date }) => date.isSame(today, "day"))?.date ??
    visibleDates[0]?.date ??
    today;

  return (
    <ScrollableRegion
      aria-label="Timed events grid"
      // EventGrid renders the visible focus ring as a sibling overlay so it
      // wraps the all-day row and timed grid together and is not clipped by
      // this section's overflow-y-auto.
      className="peer c-scroll relative min-h-0 w-full flex-1 overflow-y-auto overflow-x-hidden [--scrollbar-width:0px] focus-visible:outline-none"
      id={timedGridId}
      ref={timedGridRef}
    >
      <CalendarTimeColumn at={labelDay.toDate()} />
      <div
        className="absolute top-0 left-(--calendar-grid-margin-left) grid h-[calc(24*100%/var(--calendar-visible-hours))] w-[calc(100%-var(--calendar-grid-margin-left))] grid-cols-[repeat(var(--calendar-column-count),minmax(var(--calendar-column-min-width),1fr))]"
        id={columnsId}
        ref={timedColumnsRef}
        style={
          {
            "--calendar-column-count": visibleDates.length,
            "--calendar-column-min-width": `${EVENT_WIDTH_MINIMUM}px`,
            "--calendar-grid-margin-left": `${marginLeft}px`,
            "--calendar-visible-hours": TIMED_VISIBLE_HOURS,
          } as CSSVariables
        }
      >
        {todayColumnIndexes.map((columnIndex) => (
          <CalendarNowLine
            columnCount={visibleDates.length}
            columnIndex={columnIndex}
            key={visibleDates[columnIndex]?.key}
          />
        ))}
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
                      className="relative box-border block h-full min-w-[var(--calendar-column-min-width)] border-border border-l transition-colors duration-150 data-[past=true]:data-[jump-day=true]:bg-accent/10 data-[jump-day=true]:bg-accent/10 data-[past=true]:bg-surface motion-reduce:transition-none"
                      data-all-day-tint={tintStyle ? "true" : undefined}
                      data-jump-day={isJumpDay ? "true" : undefined}
                      data-past={date.isBefore(today, "day")}
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

      <div
        className="absolute left-(--calendar-grid-margin-left) h-full w-[calc(100%-var(--calendar-grid-margin-left))]"
        style={
          {
            "--calendar-grid-margin-left": `${marginLeft}px`,
            "--calendar-visible-hours": TIMED_VISIBLE_HOURS,
          } as CSSVariables
        }
      >
        {getHourLabels(true).map((dayTime) => (
          // biome-ignore lint/a11y/noStaticElementInteractions: Hour rows are pointer-only drag targets for creating timed events.
          <div
            className="relative flex h-[calc(100%/var(--calendar-visible-hours))] w-full items-start border-border border-b"
            key={dayTime}
            {...{ [DATA_TIMED_GRID_ROW]: "true" }}
            onMouseDown={onMouseDown}
          />
        ))}
      </div>

      {eventsLayer}
    </ScrollableRegion>
  );
};

const CalendarNowLine = ({
  columnCount,
  columnIndex,
}: {
  columnCount: number;
  columnIndex: number;
}) => {
  useMinuteTick();
  const percentOfDay = getCurrentPercentOfDay();

  return (
    <div
      aria-hidden="true"
      className="absolute h-px"
      style={{
        background: accentGradient,
        top: `${percentOfDay}%`,
        left: `calc(${columnIndex} * 100% / ${columnCount})`,
        width: `calc(100% / ${columnCount})`,
        zIndex: ZIndex.LAYER_2,
      }}
    />
  );
};
