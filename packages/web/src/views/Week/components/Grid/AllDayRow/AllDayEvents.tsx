import { useMemo } from "react";
import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import {
  isGridEventScheduleLocked,
  resolveCalendarCardIdentity,
  resolveCalendarFocusColor,
  useCalendarLookup,
} from "@web/calendars/useCalendarLookup";
import { ID_GRID_EVENTS_ALLDAY } from "@web/common/constants/web.constants";
import { type GridEvent } from "@web/common/types/web.event.types";
import { isEventIdHidden } from "@web/events/hidden/hidden-event-id";
import { useHiddenEventIds } from "@web/events/hidden/hidden-events.query";
import {
  mergeGridEventWithDraftOverlay,
  useGridDraftOverlay,
} from "@web/events/hooks/useGridDraftOverlay";
import { useWeekEventViewModel } from "@web/events/queries/useWeekEventsQuery";
import { selectDraftId, useDraftStore } from "@web/events/stores/draft.store";
import { GridRegisteredAllDayEvent } from "@web/grid/components/GridRegisteredAllDayEvent";
import { useGridMarginLeft } from "@web/grid/grid-margin";
import { type GridVisibleDate } from "@web/grid/types/grid.types";
import { useGridEventDraftHandlers } from "@web/views/Week/components/Grid/useGridEventDraftHandlers";
import { type Measurements_Grid } from "@web/views/Week/hooks/grid/useGridLayout";
import { type WeekProps } from "@web/views/Week/hooks/useWeek";
import { isAllDayEventInVisibleDays } from "@web/views/Week/util/week-window.util";

interface Props {
  measurements: Measurements_Grid;
  queryEndOfView: WeekProps["query"]["endOfView"];
  queryStartOfView: WeekProps["query"]["startOfView"];
  weekDays: WeekProps["component"]["weekDays"];
}
export const AllDayEvents = ({
  measurements,
  queryEndOfView,
  queryStartOfView,
  weekDays,
}: Props) => {
  const draftOverlay = useGridDraftOverlay();
  const {
    allDayEvents,
    events: weekEvents,
    isPending: isLoadingWeekView,
  } = useWeekEventViewModel({
    startOfView: queryStartOfView,
    endOfView: queryEndOfView,
  });

  const draftId = useDraftStore(selectDraftId);
  // One lookup build for the whole list (packet 08 step 5) - not per card.
  const calendarLookup = useCalendarLookup();
  const hiddenEventIds = useHiddenEventIds();
  const visibleDates: GridVisibleDate[] = useMemo(
    () =>
      weekDays.map((date) => ({
        date,
        key: date.format(YEAR_MONTH_DAY_FORMAT),
      })),
    [weekDays],
  );
  // The query covers the full week; only mount events overlapping the visible
  // window so off-window events never land in the DOM or the interaction
  // registry.
  const visibleAllDayEvents = useMemo(
    () =>
      allDayEvents.filter((event: GridEvent) => {
        if (!isAllDayEventInVisibleDays(event, weekDays)) return false;
        // The draft overlay is the only representation of an opened hidden
        // event; its strip would stick out beside the full-size draft.
        if (
          event._id === draftId &&
          isEventIdHidden(event._id, hiddenEventIds)
        ) {
          return false;
        }
        // Multi-day timed display bars stay in the all-day row, but while
        // editing GridDraft owns the live bar — hide the saved view-model
        // card to avoid a stale duplicate underneath the portal draft.
        if (event.isTimedMultiDayDisplay) return event._id !== draftId;
        return !(event._id === draftId && !draftOverlay?.isAllDay);
      }),
    [allDayEvents, draftOverlay?.isAllDay, draftId, hiddenEventIds, weekDays],
  );
  // Resolved once per event here (not inside each card) and kept referentially
  // stable across renders where neither the events nor the calendars changed,
  // so GridAllDayEventMemo's per-card comparator doesn't over-invalidate.
  const visibleAllDayEventsWithIdentity = useMemo(
    () =>
      visibleAllDayEvents.map((event) => ({
        event,
        calendarIdentity: resolveCalendarCardIdentity(calendarLookup, event),
        focusColor: resolveCalendarFocusColor(calendarLookup, event),
        isHidden: isEventIdHidden(event._id, hiddenEventIds),
        // Read-only (unwritable calendar or busy content) events never
        // attach interaction attributes/registration below, so the drag/
        // resize engine can't find them as a target - blocked before any
        // optimistic state change (packet 08 step 8).
        isReadOnly: isGridEventScheduleLocked(calendarLookup, event),
      })),
    [visibleAllDayEvents, calendarLookup, hiddenEventIds],
  );

  const { onEventKeyDown, onOpenReadOnlyDetails } =
    useGridEventDraftHandlers(weekEvents);
  const marginLeft = useGridMarginLeft();

  return (
    <div
      className="relative h-full w-full"
      id={ID_GRID_EVENTS_ALLDAY}
      style={{ marginLeft }}
    >
      {!isLoadingWeekView &&
        visibleAllDayEventsWithIdentity.map(
          ({ event, calendarIdentity, focusColor, isHidden, isReadOnly }) => {
            const isPlaceholder = event._id === draftId;
            // Never overlay timed draft dates onto a multi-day timed display
            // bar — that would replace YYYY-MM-DD span dates with datetimes.
            const eventForDisplay = event.isTimedMultiDayDisplay
              ? event
              : mergeGridEventWithDraftOverlay(event, draftOverlay);
            // The placeholder can carry a live (dragging/resizing) calendarId
            // from the draft store; everything else reuses the stable,
            // list-level resolved identity above.
            const identityForDisplay = isPlaceholder
              ? resolveCalendarCardIdentity(calendarLookup, eventForDisplay)
              : calendarIdentity;
            const focusColorForDisplay = isPlaceholder
              ? resolveCalendarFocusColor(calendarLookup, eventForDisplay)
              : focusColor;

            return (
              <GridRegisteredAllDayEvent
                calendarIdentity={identityForDisplay}
                event={eventForDisplay}
                focusColor={focusColorForDisplay}
                isHidden={isHidden}
                isPlaceholder={isPlaceholder}
                isReadOnly={isReadOnly}
                key={event._id}
                measurements={measurements}
                onEventKeyDown={
                  isReadOnly ? onOpenReadOnlyDetails : onEventKeyDown
                }
                view="week"
                visibleDates={visibleDates}
              />
            );
          },
        )}
    </div>
  );
};
