import { useMemo } from "react";
import { useAvailabilityQuery } from "@web/calendars/availability.query";
import { useCalendarLookup } from "@web/calendars/useCalendarLookup";
import { getTimesLabel } from "@web/common/utils/datetime/web.date.util";
import { BusyPeriodBlock } from "@web/grid/components/BusyPeriodBlock";
import { splitBusyPeriodsByDay } from "@web/grid/layout/busy-period.layout";
import { getBusyPeriodPosition } from "@web/grid/layout/event.position";
import {
  type GridMeasurements,
  type GridVisibleDate,
} from "@web/grid/types/grid.types";

const ID_GRID_BUSY_PERIODS = "busyPeriods";

interface GridBusyPeriodsProps {
  calendarColumnIndexById?: ReadonlyMap<string, number>;
  measurements: GridMeasurements;
  range: { start: string; end: string };
  visibleDates: GridVisibleDate[];
}

export const GridBusyPeriods = ({
  calendarColumnIndexById,
  measurements,
  range,
  visibleDates,
}: GridBusyPeriodsProps) => {
  const { data } = useAvailabilityQuery(range);
  const calendarLookup = useCalendarLookup();
  const segments = useMemo(
    () => splitBusyPeriodsByDay(data?.busyPeriods ?? [], visibleDates),
    [data, visibleDates],
  );

  return (
    <div id={ID_GRID_BUSY_PERIODS}>
      {segments.map((segment) => {
        const columnIndex = calendarColumnIndexById?.get(segment.calendarId);
        if (calendarColumnIndexById && columnIndex === undefined) return null;

        const position = getBusyPeriodPosition(segment, {
          columnIndex,
          measurements,
          visibleDates,
        });
        const calendarName =
          calendarLookup.get(segment.calendarId)?.name ?? "Calendar";

        return (
          <BusyPeriodBlock
            ariaLabel={`Busy, ${calendarName} calendar, ${getTimesLabel(segment.start, segment.end)}`}
            key={segment.key}
            position={position}
          />
        );
      })}
    </div>
  );
};
