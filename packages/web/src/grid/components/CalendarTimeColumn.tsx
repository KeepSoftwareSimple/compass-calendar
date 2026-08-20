import { useMemo } from "react";
import { useMinuteTick } from "@web/common/hooks/useMinuteTick";
import { type CSSVariables } from "@web/common/styles/css.types";
import { getColorsByHour } from "@web/common/utils/datetime/web.date.util";
import { HourLabelColumn } from "@web/grid/components/HourLabelColumn";
import {
  GRID_TIME_COLUMN_WIDTH,
  TIMED_VISIBLE_HOURS,
} from "@web/grid/grid.constants";
import { useGridMarginLeft } from "@web/grid/grid-margin";
import { useEffectiveTimeZone } from "@web/timezone/effective-timezone.store";
import { mappedHourLabels } from "@web/timezone/mapped-hour-labels";
import { useTimeTravelZone } from "@web/timezone/time-travel.store";

export function CalendarTimeColumn({ at }: { at: Date }) {
  const effectiveTimeZone = useEffectiveTimeZone();
  const timeTravelZone = useTimeTravelZone();
  const marginLeft = useGridMarginLeft();
  const currentHour = useMinuteTick().tz(effectiveTimeZone).hour();
  const colors = useMemo(() => getColorsByHour(currentHour), [currentHour]);
  const primaryLabels = useMemo(
    () => mappedHourLabels(effectiveTimeZone, effectiveTimeZone, at),
    [at, effectiveTimeZone],
  );
  const secondaryLabels = useMemo(
    () =>
      timeTravelZone === null
        ? []
        : mappedHourLabels(effectiveTimeZone, timeTravelZone, at),
    [at, effectiveTimeZone, timeTravelZone],
  );

  return (
    <div
      aria-hidden="true"
      className="absolute top-[calc(100%/var(--calendar-visible-hours)-5px)] z-1 flex h-full"
      style={
        {
          width: marginLeft,
          "--calendar-visible-hours": TIMED_VISIBLE_HOURS,
        } as CSSVariables
      }
    >
      {timeTravelZone !== null ? (
        <HourLabelColumn
          labels={secondaryLabels}
          width={GRID_TIME_COLUMN_WIDTH}
        />
      ) : null}
      <HourLabelColumn
        colors={colors}
        labels={primaryLabels}
        width={GRID_TIME_COLUMN_WIDTH}
      />
    </div>
  );
}
