import { type FC, useMemo } from "react";
import { type Dayjs } from "@core/util/date/dayjs";
import { shouldShowContextualLoadError } from "@web/api/util/api.util";
import {
  isFirstImportFailed,
  isFirstImportInProgress,
} from "@web/auth/providers/connect.util";
import { useConnectGoogle } from "@web/auth/providers/useConnectProvider";
import { useWeekEventViewModel } from "@web/events/queries/useWeekEventsQuery";
import { selectGridDraft, useDraftStore } from "@web/events/stores/draft.store";
import { EventGrid, isEventGridLoading } from "@web/grid/components/EventGrid";
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
  const hasVisibleEvents = (data?.ids?.length ?? 0) > 0;
  // googleState alone can't tell a first-ever import apart from an
  // already-established account's routine catch-up - both collapse to the
  // same aggregate IMPORTING state. Without isFirstImportInProgress, an
  // established user viewing a genuinely empty week during ordinary
  // background catch-up would see the empty-import scouting overlay as if
  // this were a brand-new account.
  const isImportingEmpty =
    isSuccess &&
    !hasVisibleEvents &&
    googleState === "IMPORTING" &&
    isFirstImportInProgress(connection);
  const isImportFailed =
    isSuccess && !hasVisibleEvents && isFirstImportFailed(connection);

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

  const allDayEventsLayer = useMemo(
    () => (
      <AllDayEvents
        measurements={measurements}
        queryEndOfView={weekProps.query.endOfView}
        queryStartOfView={weekProps.query.startOfView}
        weekDays={weekDays}
      />
    ),
    [
      measurements,
      weekDays,
      weekProps.query.endOfView,
      weekProps.query.startOfView,
    ],
  );
  const timedEventsLayer = useMemo(
    () => (
      <MainGridTimedEventsLayer
        measurements={measurements}
        visibleDates={visibleDates}
        weekProps={weekProps}
      />
    ),
    [measurements, visibleDates, weekProps],
  );

  return (
    <EventGrid
      allDayEventsLayer={allDayEventsLayer}
      allDayGridOffsetTopPx={GRID_Y_START}
      allDayRowsCount={allDayRowsCount}
      gridRefs={gridRefs}
      isErrorEvents={showEventsLoadError}
      isImportFailed={isImportFailed}
      isImportingEmpty={isImportingEmpty}
      isLoadingEvents={isLoadingEvents}
      onRetryEvents={() => void refetch()}
      onRetryImport={() => refresh()}
      timedEventsLayer={timedEventsLayer}
      today={today}
      visibleDates={tintedVisibleDates}
    />
  );
};
