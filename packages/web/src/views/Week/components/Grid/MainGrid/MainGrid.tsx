import { type FC, type ReactNode, type RefCallback } from "react";
import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import { type Dayjs } from "@core/util/date/dayjs";
import { toUTCOffset } from "@web/common/utils/datetime/web.date.util";
import { GridBusyPeriods } from "@web/grid/components/GridBusyPeriods";
import { TimedGrid } from "@web/grid/components/TimedGrid";
import { MainGridEvents } from "@web/views/Week/components/Grid/MainGrid/MainGridEvents";
import { MainGridQuickTimeSlots } from "@web/views/Week/components/Grid/MainGrid/MainGridQuickTimeSlots";
import { type Measurements_Grid } from "@web/views/Week/hooks/grid/useGridLayout";
import { type WeekProps } from "@web/views/Week/hooks/useWeek";

interface Props {
  children?: (props: MainGridRenderProps) => ReactNode;
  mainGridElementRef: RefCallback<HTMLElement>;
  measurements: Measurements_Grid;
  today: Dayjs;
  timedColumnsElementRef: RefCallback<HTMLDivElement>;
  weekProps: WeekProps;
}

interface MainGridRenderProps {
  timedEventsLayer: ReactNode;
}

const toVisibleDates = (weekDays: Dayjs[]) =>
  weekDays.map((date) => ({
    date,
    key: date.format(YEAR_MONTH_DAY_FORMAT),
  }));

const MainGridTimedEventsLayer: FC<{
  measurements: Measurements_Grid;
  weekProps: WeekProps;
}> = ({ measurements, weekProps }) => (
  <>
    <GridBusyPeriods
      measurements={measurements}
      range={{
        start: toUTCOffset(weekProps.component.startOfView),
        end: toUTCOffset(weekProps.component.endOfView),
      }}
      visibleDates={toVisibleDates(weekProps.component.weekDays)}
    />
    <MainGridQuickTimeSlots measurements={measurements} weekProps={weekProps} />
    <MainGridEvents measurements={measurements} weekProps={weekProps} />
  </>
);

export const MainGrid: FC<Props> = ({
  children,
  mainGridElementRef,
  measurements,
  today,
  timedColumnsElementRef,
  weekProps,
}) => {
  const { component } = weekProps;
  const { weekDays } = component;

  if (children) {
    return (
      <MainGridChildren measurements={measurements} weekProps={weekProps}>
        {children}
      </MainGridChildren>
    );
  }

  return (
    <MainGridCalendar
      mainGridElementRef={mainGridElementRef}
      measurements={measurements}
      timedColumnsElementRef={timedColumnsElementRef}
      today={today}
      weekDays={weekDays}
      weekProps={weekProps}
    />
  );
};

interface MainGridChildrenProps {
  children: (props: MainGridRenderProps) => ReactNode;
  measurements: Measurements_Grid;
  weekProps: WeekProps;
}

const MainGridChildren: FC<MainGridChildrenProps> = ({
  children,
  measurements,
  weekProps,
}) => (
  <>
    {children({
      timedEventsLayer: (
        <MainGridTimedEventsLayer
          measurements={measurements}
          weekProps={weekProps}
        />
      ),
    })}
  </>
);

interface MainGridCalendarProps {
  mainGridElementRef: RefCallback<HTMLElement>;
  measurements: Measurements_Grid;
  timedColumnsElementRef: RefCallback<HTMLDivElement>;
  today: Dayjs;
  weekDays: Dayjs[];
  weekProps: WeekProps;
}

const MainGridCalendar: FC<MainGridCalendarProps> = ({
  mainGridElementRef,
  measurements,
  timedColumnsElementRef,
  today,
  weekDays,
  weekProps,
}) => (
  <TimedGrid
    eventsLayer={
      <MainGridTimedEventsLayer
        measurements={measurements}
        weekProps={weekProps}
      />
    }
    timedColumnsRef={timedColumnsElementRef}
    timedGridRef={mainGridElementRef}
    today={today}
    visibleDates={toVisibleDates(weekDays)}
  />
);
