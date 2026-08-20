import { type MouseEvent, useMemo } from "react";
import {
  type CalendarCardIdentity,
  isGridEventInteractionReadOnly,
  resolveCalendarCardIdentity,
  resolveCalendarFocusColor,
  useCalendarLookup,
} from "@web/calendars/useCalendarLookup";
import { ID_GRID_EVENTS_ALLDAY } from "@web/common/constants/web.constants";
import { type GridEvent } from "@web/common/types/web.event.types";
import {
  mergeGridEventWithDraftOverlay,
  useGridDraftSchemaOverlay,
} from "@web/events/hooks/useGridDraftSchemaOverlay";
import { useWeekEventViewModel } from "@web/events/queries/useWeekEventsQuery";
import { selectDraftId, useDraftStore } from "@web/events/stores/draft.store";
import { useGridMarginLeft } from "@web/grid/grid-margin";
import { AllDayEventMemo } from "@web/views/Week/components/Grid/AllDayRow/AllDayEvent";
import { useGridEventDraftHandlers } from "@web/views/Week/components/Grid/useGridEventDraftHandlers";
import { type Measurements_Grid } from "@web/views/Week/hooks/grid/useGridLayout";
import { type WeekProps } from "@web/views/Week/hooks/useWeek";
import {
  getWeekInteractionTargetAttributes,
  useWeekEventRegistrationRef,
} from "@web/views/Week/interaction/registry/week-event.registry";
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
  const draftOverlay = useGridDraftSchemaOverlay();
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
  // The query covers the full week; only mount events overlapping the visible
  // window so off-window events never land in the DOM or the interaction
  // registry.
  const visibleAllDayEvents = useMemo(
    () =>
      allDayEvents.filter((event: GridEvent) => {
        if (!isAllDayEventInVisibleDays(event, weekDays)) return false;
        // Multi-day timed display bars stay in the all-day row, but while
        // editing GridDraft owns the live bar — hide the saved view-model
        // card to avoid a stale duplicate underneath the portal draft.
        if (event.isTimedMultiDayDisplay) return event._id !== draftId;
        return !(event._id === draftId && !draftOverlay?.isAllDay);
      }),
    [allDayEvents, draftOverlay?.isAllDay, draftId, weekDays],
  );
  // Resolved once per event here (not inside each card) and kept referentially
  // stable across renders where neither the events nor the calendars changed,
  // so AllDayEventMemo's per-card comparator doesn't over-invalidate.
  const visibleAllDayEventsWithIdentity = useMemo(
    () =>
      visibleAllDayEvents.map((event) => ({
        event,
        calendarIdentity: resolveCalendarCardIdentity(calendarLookup, event),
        focusColor: resolveCalendarFocusColor(calendarLookup, event),
        // Read-only (unwritable calendar or busy content) events never
        // attach interaction attributes/registration below, so the drag/
        // resize engine can't find them as a target - blocked before any
        // optimistic state change (packet 08 step 8).
        isReadOnly: isGridEventInteractionReadOnly(calendarLookup, event),
      })),
    [visibleAllDayEvents, calendarLookup],
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
          ({ event, calendarIdentity, focusColor, isReadOnly }) => {
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
              <AllDayEventItem
                calendarIdentity={identityForDisplay}
                event={eventForDisplay}
                focusColor={focusColorForDisplay}
                isPlaceholder={isPlaceholder}
                isReadOnly={isReadOnly}
                key={event._id}
                measurements={measurements}
                onKeyDown={onEventKeyDown}
                onOpenReadOnlyDetails={onOpenReadOnlyDetails}
                weekDays={weekDays}
              />
            );
          },
        )}
    </div>
  );
};

interface AllDayEventItemProps {
  calendarIdentity: CalendarCardIdentity | null;
  event: GridEvent;
  focusColor: string | null;
  isPlaceholder: boolean;
  isReadOnly: boolean;
  measurements: Measurements_Grid;
  onKeyDown: (event: GridEvent) => void;
  onOpenReadOnlyDetails: (event: GridEvent) => void;
  weekDays: WeekProps["component"]["weekDays"];
}

const AllDayEventItem = ({
  calendarIdentity,
  event,
  focusColor,
  isPlaceholder,
  isReadOnly,
  measurements,
  onKeyDown,
  onOpenReadOnlyDetails,
  weekDays,
}: AllDayEventItemProps) => {
  // Stamp view-registry id attrs for any saved card (including read-only) so
  // context menus / focus restore can resolve an id. Drag/resize stays gated
  // separately via registry registration.
  const hasEventIdentity = Boolean(event._id);
  const isRegisteredForDragResize =
    hasEventIdentity && !isPlaceholder && !isReadOnly;
  const registrationRef = useWeekEventRegistrationRef({
    eventId: event._id,
    eventType: "all-day",
    isEnabled: isRegisteredForDragResize,
  });

  const interactionAttributes = useMemo(
    () =>
      hasEventIdentity
        ? getWeekInteractionTargetAttributes({
            eventId: event._id,
            eventType: "all-day",
          })
        : undefined,
    [event._id, hasEventIdentity],
  );
  // Unregistered for drag/resize also means the interaction engine's own
  // click resolution never fires, so a read-only card would otherwise stop
  // being clickable - events must stay inspectable even when they can't be
  // mutated. Wiring the click straight to an "open" action bypasses the
  // engine entirely for this card.
  const onMouseDown = isReadOnly
    ? (_e: MouseEvent, clickedEvent: GridEvent) =>
        onOpenReadOnlyDetails(clickedEvent)
    : undefined;

  return (
    <AllDayEventMemo
      calendarIdentity={calendarIdentity}
      event={event}
      focusColor={focusColor}
      interactionAttributes={interactionAttributes}
      isPlaceholder={isPlaceholder}
      measurements={measurements}
      onKeyDown={isReadOnly ? onOpenReadOnlyDetails : onKeyDown}
      onMouseDown={onMouseDown}
      ref={registrationRef}
      weekDays={weekDays}
    />
  );
};
