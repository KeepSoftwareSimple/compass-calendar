import { useMemo } from "react";
import { civilHourSlotCount } from "@core/util/date/civil-day";
import dayjs from "@core/util/date/dayjs";
import { useMinuteTick } from "@web/common/hooks/useMinuteTick";
import { type CSSVariables } from "@web/common/styles/css.types";
import {
  getColorsByHour,
  getHourLabels,
} from "@web/common/utils/datetime/web.date.util";
import { HourLabelColumn } from "@web/grid/components/HourLabelColumn";
import {
  GRID_TIME_COLUMN_WIDTH,
  gridMarginLeftFor,
  TIMED_VISIBLE_HOURS,
} from "@web/grid/grid.constants";
import { CalendarNowTimeLabel } from "@web/grid/now-cue/CalendarNowTimeLabel";
import {
  formatNowLineTimeLabel,
  hourLabelIndexOverlappingNow,
  nowLineGridMinutes,
  nowLineTopPercent,
} from "@web/grid/now-cue/now-line-time.util";
import { useEffectiveTimeZone } from "@web/timezone/effective-timezone.store";
import { mappedHourLabels } from "@web/timezone/mapped-hour-labels";
import { useTimeTravelZone } from "@web/timezone/time-travel.store";

export function CalendarTimeColumn({
  at,
  showNowTimeLabel = false,
}: {
  at: Date;
  showNowTimeLabel?: boolean;
}) {
  const effectiveTimeZone = useEffectiveTimeZone();
  const timeTravelZone = useTimeTravelZone();
  const marginLeft = gridMarginLeftFor(timeTravelZone !== null);
  const now = useMinuteTick();
  const currentHour = now.tz(effectiveTimeZone).hour();
  const nowGridMinutes = nowLineGridMinutes(now, effectiveTimeZone);
  const fadedHourIndex = showNowTimeLabel
    ? hourLabelIndexOverlappingNow(nowGridMinutes, dayjs(at), effectiveTimeZone)
    : null;
  const nowTopPercent = nowLineTopPercent(now, effectiveTimeZone);
  const nowTimeLabel = formatNowLineTimeLabel(now, effectiveTimeZone);
  const slotCount = useMemo(
    () => civilHourSlotCount(at, effectiveTimeZone),
    [at, effectiveTimeZone],
  );
  const colors = useMemo(
    () => getColorsByHour(currentHour, slotCount),
    [currentHour, slotCount],
  );
  const primaryLabels = useMemo(
    () => getHourLabels(true, at, effectiveTimeZone),
    [at, effectiveTimeZone],
  );

  return (
    <div
      aria-hidden="true"
      className="absolute top-0 z-1 flex h-full flex-row"
      style={
        {
          width: marginLeft,
          "--calendar-visible-hours": TIMED_VISIBLE_HOURS,
        } as CSSVariables
      }
    >
      {timeTravelZone !== null ? (
        <HourLabelColumn
          labels={mappedHourLabels(effectiveTimeZone, timeTravelZone, at)}
          width={GRID_TIME_COLUMN_WIDTH}
        />
      ) : null}
      <div
        className="relative h-full"
        style={{ width: GRID_TIME_COLUMN_WIDTH }}
      >
        <HourLabelColumn
          colors={colors}
          fadedHourIndex={fadedHourIndex}
          labels={primaryLabels}
          width={GRID_TIME_COLUMN_WIDTH}
        />
        {showNowTimeLabel ? (
          <CalendarNowTimeLabel
            label={nowTimeLabel}
            topPercent={nowTopPercent}
            variant="gutter"
          />
        ) : null}
      </div>
    </div>
  );
}
