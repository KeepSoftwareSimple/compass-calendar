import { useMemo } from "react";
import {
  type CalendarCardIdentity,
  isGridEventScheduleLocked,
  resolveCalendarCardIdentity,
  resolveCalendarFocusColor,
  useCalendarLookup,
} from "@web/calendars/useCalendarLookup";
import { ID_GRID_EVENTS_TIMED } from "@web/common/constants/web.constants";
import { type GridEvent } from "@web/common/types/web.event.types";
import { suppressedSeriesIdForDraft } from "@web/events/grid-event-draft.adapter";
import { useHiddenEventIds } from "@web/events/hidden/hidden-events.query";
import {
  mergeGridEventWithDraftOverlay,
  useGridDraftOverlay,
} from "@web/events/hooks/useGridDraftOverlay";
import { useWeekEventViewModel } from "@web/events/queries/useWeekEventsQuery";
import {
  selectDraftId,
  selectGridDraft,
  useDraftStore,
} from "@web/events/stores/draft.store";
import {
  createTimedEventLayout,
  type TimedDeckLayout,
} from "@web/grid/layout/timed-deck.layout";
import { useGridEventDraftHandlers } from "@web/views/Week/components/Grid/useGridEventDraftHandlers";
import { type Measurements_Grid } from "@web/views/Week/hooks/grid/useGridLayout";
import { type WeekProps } from "@web/views/Week/hooks/useWeek";
import {
  getWeekInteractionTargetAttributes,
  useWeekEventRegistrationRef,
} from "@web/views/Week/interaction/registry/week-event.registry";
import { isTimedEventInVisibleDays } from "@web/views/Week/util/week-window.util";
import { GridEventMemo } from "../../Event/Grid/GridEvent/GridEvent";

interface Props {
  measurements: Measurements_Grid;
  weekProps: WeekProps;
}

export const MainGridEvents = ({ measurements, weekProps }: Props) => {
  const draftOverlay = useGridDraftOverlay();
  const {
    events: weekEvents,
    isPending: isLoadingWeekView,
    timedEvents,
  } = useWeekEventViewModel({
    startOfView: weekProps.query.startOfView,
    endOfView: weekProps.query.endOfView,
  });
  const draftId = useDraftStore(selectDraftId);
  const gridDraft = useDraftStore(selectGridDraft);
  const weekDays = weekProps.component.weekDays;
  // One lookup build for the whole list (packet 08 step 5) - not per card.
  const calendarLookup = useCalendarLookup();
  const hiddenEventIds = useHiddenEventIds();
  // While the user is actively changing a series' recurrence, its saved
  // sibling occurrences are stale (they reflect the rule before this edit) -
  // the draft's own recurring-preview cards are the live truth for the
  // series until the edit is saved or discarded. Null whenever recurrence
  // hasn't been touched, so unrelated edits/drags never hide anything.
  const suppressedSeriesId = suppressedSeriesIdForDraft(gridDraft);
  // The query covers the full week; only mount events for the visible window
  // so off-window events never land in the DOM or the interaction registry.
  const visibleTimedEvents = useMemo(
    () =>
      timedEvents.filter(
        (event) =>
          isTimedEventInVisibleDays(event, weekDays) &&
          !(event._id === draftId && draftOverlay?.isAllDay) &&
          !(
            suppressedSeriesId &&
            event.recurrence?.eventId === suppressedSeriesId &&
            event._id !== draftId
          ),
      ),
    [
      draftOverlay?.isAllDay,
      draftId,
      suppressedSeriesId,
      timedEvents,
      weekDays,
    ],
  );
  const timedEventItems = useMemo(
    () => createTimedEventLayout(visibleTimedEvents, hiddenEventIds),
    [hiddenEventIds, visibleTimedEvents],
  );
  // Resolved once per event here (not inside each card) and kept referentially
  // stable across renders where neither the events nor the calendars changed,
  // so GridEventMemo's per-card comparator doesn't over-invalidate.
  const timedEventItemsWithIdentity = useMemo(
    () =>
      timedEventItems.map((item) => ({
        ...item,
        calendarIdentity: resolveCalendarCardIdentity(
          calendarLookup,
          item.event,
        ),
        focusColor: resolveCalendarFocusColor(calendarLookup, item.event),
        isHidden: Boolean(item.event._id && hiddenEventIds.has(item.event._id)),
        // Read-only (unwritable calendar or busy content) events never
        // attach interaction attributes/registration below, so the drag/
        // resize engine can't find them as a target - blocked before any
        // optimistic state change (packet 08 step 8).
        isReadOnly: isGridEventScheduleLocked(calendarLookup, item.event),
      })),
    [timedEventItems, calendarLookup, hiddenEventIds],
  );

  const { onEventKeyDown, onOpenReadOnlyDetails } =
    useGridEventDraftHandlers(weekEvents);

  return (
    <div id={ID_GRID_EVENTS_TIMED}>
      {!isLoadingWeekView &&
        timedEventItemsWithIdentity.map(
          ({
            deckLayout,
            event,
            calendarIdentity,
            focusColor,
            isHidden,
            isReadOnly,
          }) => {
            const isPlaceholder = event._id === draftId;
            const eventForDisplay = mergeGridEventWithDraftOverlay(
              event,
              draftOverlay,
            );
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
              <MainGridEventItem
                calendarIdentity={identityForDisplay}
                deckLayout={deckLayout}
                event={eventForDisplay}
                focusColor={focusColorForDisplay}
                isHidden={isHidden}
                isPlaceholder={isPlaceholder}
                isReadOnly={isReadOnly}
                key={`initial-${event._id}`}
                measurements={measurements}
                onEventKeyDown={onEventKeyDown}
                onOpenReadOnlyDetails={onOpenReadOnlyDetails}
                weekProps={weekProps}
              />
            );
          },
        )}
    </div>
  );
};

interface MainGridEventItemProps {
  calendarIdentity: CalendarCardIdentity | null;
  deckLayout: TimedDeckLayout | null;
  event: GridEvent;
  focusColor: string | null;
  isHidden: boolean;
  isPlaceholder: boolean;
  isReadOnly: boolean;
  measurements: Measurements_Grid;
  onEventKeyDown: (event: GridEvent) => void;
  onOpenReadOnlyDetails: (event: GridEvent) => void;
  weekProps: WeekProps;
}

const MainGridEventItem = ({
  calendarIdentity,
  deckLayout,
  event,
  focusColor,
  isHidden,
  isPlaceholder,
  isReadOnly,
  measurements,
  onEventKeyDown,
  onOpenReadOnlyDetails,
  weekProps,
}: MainGridEventItemProps) => {
  // Stamp view-registry id attrs whenever the card has an id (saved, draft
  // placeholder, or read-only) so context menus / focus restore can resolve
  // it. Drag/resize stays gated via registry registration on saved writable
  // cards only.
  const hasEventIdentity = Boolean(event._id);
  const isRegisteredForDragResize =
    hasEventIdentity && !isPlaceholder && !isReadOnly && !isHidden;
  const registrationRef = useWeekEventRegistrationRef({
    eventId: event._id,
    eventType: "timed",
    isEnabled: isRegisteredForDragResize,
  });
  const interactionAttributes = useMemo(
    () =>
      hasEventIdentity
        ? getWeekInteractionTargetAttributes({
            eventId: event._id,
            eventType: "timed",
            isReadOnly,
          })
        : undefined,
    [event._id, hasEventIdentity, isReadOnly],
  );
  return (
    <GridEventMemo
      calendarIdentity={calendarIdentity}
      deckLayout={deckLayout}
      displayMode={isPlaceholder ? "placeholder" : "saved"}
      event={event}
      focusColor={focusColor}
      interactionAttributes={interactionAttributes}
      isHidden={isHidden}
      measurements={measurements}
      onEventKeyDown={isReadOnly ? onOpenReadOnlyDetails : onEventKeyDown}
      ref={registrationRef}
      weekProps={weekProps}
    />
  );
};
