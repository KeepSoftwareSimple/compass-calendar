import { type FC } from "react";
import { toUTCOffset } from "@web/common/utils/datetime/web.date.util";
import { GridBusyPeriods } from "@web/grid/components/GridBusyPeriods";
import { type GridVisibleDate } from "@web/grid/types/grid.types";
import { MainGridEvents } from "@web/views/Week/components/Grid/MainGrid/MainGridEvents";
import { MainGridQuickTimeSlots } from "@web/views/Week/components/Grid/MainGrid/MainGridQuickTimeSlots";
import { type Measurements_Grid } from "@web/views/Week/hooks/grid/useGridLayout";
import { type WeekProps } from "@web/views/Week/hooks/useWeek";

interface Props {
  measurements: Measurements_Grid;
  visibleDates: GridVisibleDate[];
  weekProps: WeekProps;
}

/**
 * Everything the week grid paints inside its timed track, in paint order:
 * availability behind the cards, quick-time placeholders, then the events.
 * The Day view assembles its timed track the same way (DayCalendarGrid).
 */
export const MainGridTimedEventsLayer: FC<Props> = ({
  measurements,
  visibleDates,
  weekProps,
}) => (
  <>
    <GridBusyPeriods
      measurements={measurements}
      range={{
        start: toUTCOffset(weekProps.component.startOfView),
        end: toUTCOffset(weekProps.component.endOfView),
      }}
      visibleDates={visibleDates}
    />
    <MainGridQuickTimeSlots measurements={measurements} weekProps={weekProps} />
    <MainGridEvents measurements={measurements} weekProps={weekProps} />
  </>
);
