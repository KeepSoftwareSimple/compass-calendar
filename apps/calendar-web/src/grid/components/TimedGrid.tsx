import { type FC, type ReactNode, type RefCallback, useMemo } from "react";
import {
  civilHourSlotCount,
  maxCivilHourSlotCount,
} from "@core/util/date/civil-day";
import { type Dayjs } from "@core/util/date/dayjs";
import { PH_NO_RAGECLICK_CLASS } from "@web/auth/posthog/posthog-calendar-grid.util";
import {
  DATA_TIMED_GRID_ROW,
  ID_GRID_COLUMNS_TIMED,
  ID_GRID_MAIN,
} from "@web/common/constants/web.constants";
import { type CSSVariables } from "@web/common/styles/css.types";
import { getHourLabels } from "@web/common/utils/datetime/web.date.util";
import { ScrollableRegion } from "@web/components/ScrollableRegion/ScrollableRegion";
import { CalendarTimeColumn } from "@web/grid/components/CalendarTimeColumn";
import { GridDayColumnHeaders } from "@web/grid/components/GridDayColumnHeaders";
import {
  CALENDAR_COLUMN_GRID_CLASS,
  calendarColumnGridVars,
  TIMED_HOUR_SLOT_HEIGHT_CLASS,
  TIMED_VISIBLE_HOURS,
} from "@web/grid/grid.constants";
import { useGridMarginLeft } from "@web/grid/grid-margin";
import { CalendarNowLine } from "@web/grid/now-cue/CalendarNowLine";
import { nowTimeLabelPlacement } from "@web/grid/now-cue/now-line-time.util";
import { type GridVisibleDate } from "@web/grid/types/grid.types";
import { useEffectiveTimeZone } from "@web/timezone/effective-timezone.store";

interface TimedGridProps {
  columnsId?: string;
  eventsLayer: ReactNode;
  highlightedColumnKey?: string | null;
  today: Dayjs;
  timedColumnsRef: RefCallback<HTMLDivElement>;
  timedGridId?: string;
  timedGridRef: RefCallback<HTMLElement>;
  visibleDates: GridVisibleDate[];
}

export const TimedGrid: FC<TimedGridProps> = ({
  columnsId = ID_GRID_COLUMNS_TIMED,
  eventsLayer,
  highlightedColumnKey = null,
  timedColumnsRef,
  timedGridId = ID_GRID_MAIN,
  timedGridRef,
  today,
  visibleDates,
}) => {
  const marginLeft = useGridMarginLeft();
  const todayColumnIndexes = visibleDates.flatMap(({ date }, index) =>
    date.isSame(today, "day") ? [index] : [],
  );
  const effectiveTimeZone = useEffectiveTimeZone();
  const visibleDayDates = useMemo(
    () => visibleDates.map(({ date }) => date),
    [visibleDates],
  );
  const civilHourSlots = useMemo(
    () => maxCivilHourSlotCount(visibleDayDates, effectiveTimeZone),
    [effectiveTimeZone, visibleDayDates],
  );
  const labelDay = useMemo(() => {
    const fallback = visibleDates[0]?.date ?? today;
    const longestDay = visibleDayDates.find(
      (date) => civilHourSlotCount(date, effectiveTimeZone) === civilHourSlots,
    );
    return longestDay ?? fallback;
  }, [civilHourSlots, effectiveTimeZone, today, visibleDates, visibleDayDates]);
  const hourRowLabels = getHourLabels(true, labelDay, effectiveTimeZone);
  const timeLabelPlacement = nowTimeLabelPlacement(visibleDates);
  const showTodayNowCue = todayColumnIndexes.length > 0;
  const todayColumnIndex = todayColumnIndexes[0] ?? -1;
  const showGutterNowTimeLabel =
    showTodayNowCue &&
    (timeLabelPlacement === "gutter" ||
      (timeLabelPlacement === "column-edge" && todayColumnIndex === 0));
  const showWeekColumnNowTimeLabel =
    showTodayNowCue && timeLabelPlacement === "column-edge";

  return (
    <ScrollableRegion
      aria-label="Timed events grid"
      // EventGrid renders the visible focus ring as a sibling overlay so it
      // wraps the all-day row and timed grid together and is not clipped by
      // this section's overflow-y-auto.
      className={`peer c-scroll relative min-h-0 w-full flex-1 overflow-y-auto overflow-x-hidden [--scrollbar-width:0px] focus-visible:outline-none ${PH_NO_RAGECLICK_CLASS}`}
      id={timedGridId}
      ref={timedGridRef}
      style={
        {
          ...calendarColumnGridVars(visibleDates.length),
          "--calendar-grid-margin-left": `${marginLeft}px`,
          "--calendar-day-hour-slots": civilHourSlots,
          "--calendar-visible-hours": TIMED_VISIBLE_HOURS,
        } as CSSVariables
      }
    >
      <CalendarTimeColumn
        at={labelDay.toDate()}
        showNowTimeLabel={showGutterNowTimeLabel}
      />
      <div
        className={`absolute top-0 left-(--calendar-grid-margin-left) grid h-[calc(var(--calendar-day-hour-slots)*100%/var(--calendar-visible-hours))] w-[calc(100%-var(--calendar-grid-margin-left))] ${CALENDAR_COLUMN_GRID_CLASS}`}
        id={columnsId}
        ref={timedColumnsRef}
      >
        <GridDayColumnHeaders
          highlightedColumnKey={highlightedColumnKey}
          pastBefore={today}
          visibleDates={visibleDates}
        />
      </div>

      <div className="absolute left-(--calendar-grid-margin-left) h-full w-[calc(100%-var(--calendar-grid-margin-left))]">
        {hourRowLabels.map((dayTime) => (
          <div
            className={`relative flex ${TIMED_HOUR_SLOT_HEIGHT_CLASS} w-full items-start border-border border-b`}
            key={dayTime}
            {...{ [DATA_TIMED_GRID_ROW]: "true" }}
          />
        ))}
        {eventsLayer}
        {todayColumnIndexes.map((columnIndex) => (
          <CalendarNowLine
            columnCount={visibleDates.length}
            columnIndex={columnIndex}
            effectiveTimeZone={effectiveTimeZone}
            key={visibleDates[columnIndex]?.key}
            showWeekColumnTimeLabel={showWeekColumnNowTimeLabel}
          />
        ))}
      </div>
    </ScrollableRegion>
  );
};
