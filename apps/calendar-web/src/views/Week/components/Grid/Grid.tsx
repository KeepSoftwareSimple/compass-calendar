import { type FC, useMemo } from "react";
import { type Dayjs } from "@core/util/date/dayjs";
import { shouldShowContextualLoadError } from "@web/api/util/api.util";
import { useConnectGoogle } from "@web/auth/providers/useConnectProvider";
import { useWeekEventViewModel } from "@web/events/queries/useWeekEventsQuery";
import { selectGridDraft, useDraftStore } from "@web/events/stores/draft.store";
import { EventGrid, isEventGridLoading } from "@web/grid/components/EventGrid";
import { eventGridFirstImportFlags } from "@web/grid/event-grid-import-overlay";
import { positionAllDayDraftEvent } from "@web/grid/layout/all-day-draft.position";
import { withAllDayColumnTints } from "@web/grid/utils/allDayColumnTint.util";
import { AllDayEvents } from "@web/views/Week/components/Grid/AllDayRow/AllDayEvents";
import { MainGridTimedEventsLayer } from "@web/views/Week/components/Grid/MainGrid/MainGridTimedEventsLayer";
import {
  type Measurements_Grid,
  type Refs_Grid,
} from "@web/views/Week/hooks/grid/useGridLayout";
import { useWeekVisibleDates } from "@web/views/Week/hooks/grid/useWeekVisibleDates";
import { type WeekProps } from "@web/views/Week/hooks/useWeek";
import { GRID_Y_START } from "@web/views/Week/layout.constants";

interface Props {
  gridRefs: Refs_Grid;
  measurements: Measurements_Grid;
  today: Dayjs;
  weekProps: WeekProps;
}

export const Grid: FC<Props> = ({
  gridRefs,
  measurements,
  today,
  weekProps,
}) => {
  // Subscribes to the same cache entry the event layers read, so this reports
  // their load (and the all-day row count) without issuing a second fetch.
  const {
    allDayEvents,
    error: eventsError,
    isPending,
    isFetching,
    isError: isErrorEvents,
    isSuccess,
    data,
    refetch,
    rowCount: allDayRowsCount,
  } = useWeekEventViewModel({
    startOfView: weekProps.query.startOfView,
    endOfView: weekProps.query.endOfView,
  });
  const { connection, refresh, state: googleState } = useConnectGoogle();
  // Session expiry already surfaces SessionExpiredToast — don't also show
  // "Couldn't load events" / Retry for the same failure.
  const showEventsLoadError = shouldShowContextualLoadError(
    isErrorEvents,
    eventsError,
  );
  const isLoadingEvents = isEventGridLoading(
    isPending,
    showEventsLoadError,
    isFetching,
  );
  const { isImportingEmpty, isImportFailed } = eventGridFirstImportFlags({
    connection,
    googleState,
    hasVisibleEvents: (data?.ids?.length ?? 0) > 0,
    queryReady: isSuccess,
  });

  const gridDraft = useDraftStore(selectGridDraft);
  // Include the live all-day draft so create/edit chips tint columns before save.
  const allDayEventsForTint = useMemo(
    () =>
      positionAllDayDraftEvent({ draft: gridDraft, events: allDayEvents })
        .events,
    [allDayEvents, gridDraft],
  );

  const weekDays = weekProps.component.weekDays;
  const visibleDates = useWeekVisibleDates(weekDays);
  const tintedVisibleDates = useMemo(
    () => withAllDayColumnTints(visibleDates, allDayEventsForTint, "date"),
    [allDayEventsForTint, visibleDates],
  );

  return (
    <EventGrid
      allDayEventsLayer={
        <AllDayEvents
          measurements={measurements}
          queryEndOfView={weekProps.query.endOfView}
          queryStartOfView={weekProps.query.startOfView}
          weekDays={weekDays}
        />
      }
      allDayGridOffsetTopPx={GRID_Y_START}
      allDayRowsCount={allDayRowsCount}
      gridRefs={gridRefs}
      isErrorEvents={showEventsLoadError}
      isImportFailed={isImportFailed}
      isImportingEmpty={isImportingEmpty}
      isLoadingEvents={isLoadingEvents}
      onRetryEvents={() => void refetch()}
      onRetryImport={() => refresh()}
      timedEventsLayer={
        <MainGridTimedEventsLayer
          measurements={measurements}
          visibleDates={visibleDates}
          weekProps={weekProps}
        />
      }
      today={today}
      visibleDates={tintedVisibleDates}
    />
  );
};
