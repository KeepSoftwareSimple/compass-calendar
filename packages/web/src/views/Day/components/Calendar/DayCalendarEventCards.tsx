import { useMemo, useState } from "react";
import { type CalendarCardIdentity } from "@web/calendars/useCalendarLookup";
import { ZIndex } from "@web/common/constants/web.constants";
import { type GridEvent } from "@web/common/types/web.event.types";
import { AllDayEventCard } from "@web/grid/components/AllDayEventCard";
import { TimedEventCard } from "@web/grid/components/TimedEventCard";
import { applyHiddenEventStripWidth } from "@web/grid/grid.constants";
import {
  getAllDayEventPosition,
  getTimedEventPosition,
} from "@web/grid/layout/event.position";
import {
  applyTimedEventDisplayPosition,
  type TimedDeckLayout,
  timedDeckBoxShadow,
} from "@web/grid/layout/timed-deck.layout";
import {
  type GridMeasurements,
  type GridVisibleDate,
} from "@web/grid/types/grid.types";
import {
  getDayInteractionTargetAttributes,
  useDayEventRegistrationRef,
} from "@web/views/Day/interaction/registry/day-event.registry";

interface DayEventCardProps {
  calendarIdentity?: CalendarCardIdentity | null;
  columnIndex: number;
  event: GridEvent;
  focusColor?: string | null;
  isActiveDraft: boolean;
  isHidden?: boolean;
  isPlaceholder: boolean;
  isReadOnly: boolean;
  measurements: GridMeasurements;
  onOpenEvent: (event: GridEvent) => void;
  visibleDates: GridVisibleDate[];
}

interface DayTimedEventCardProps extends DayEventCardProps {
  deckLayout: TimedDeckLayout | null;
}

export const DayAllDayCalendarEvent = ({
  calendarIdentity = null,
  columnIndex,
  event,
  focusColor = null,
  isActiveDraft,
  isHidden = false,
  isPlaceholder,
  isReadOnly,
  measurements,
  onOpenEvent,
  visibleDates,
}: DayEventCardProps) => {
  // Stamp view-registry id attrs whenever the card has an id (saved, draft,
  // or read-only) so context menus / focus restore can resolve it.
  // Drag/resize stays gated: registry registration + hover require a saved,
  // non-read-only card.
  const hasEventIdentity = Boolean(event._id);
  const isRegisteredForDragResize =
    hasEventIdentity && !isPlaceholder && !isReadOnly && !isHidden;
  const registrationRef = useDayEventRegistrationRef({
    eventId: event._id,
    eventType: "all-day",
    isEnabled: isRegisteredForDragResize,
  });
  const interactionAttributes = useMemo(
    () =>
      hasEventIdentity
        ? getDayInteractionTargetAttributes({
            eventId: event._id,
            eventType: "all-day",
            isReadOnly,
          })
        : undefined,
    [event._id, hasEventIdentity, isReadOnly],
  );
  const position = getAllDayEventPosition(event, {
    columnIndex,
    isDraft: isPlaceholder,
    measurements,
    visibleDates,
  });
  const displayPosition = applyHiddenEventStripWidth(position, isHidden);

  return (
    <AllDayEventCard
      calendarIdentity={calendarIdentity}
      event={event}
      focusColor={focusColor}
      interactionAttributes={interactionAttributes}
      isHidden={isHidden}
      isPlaceholder={isPlaceholder}
      onEventKeyDown={onOpenEvent}
      position={{
        ...displayPosition,
        zIndex: isActiveDraft
          ? ZIndex.MAX
          : (displayPosition.zIndex ?? ZIndex.LAYER_1),
      }}
      ref={registrationRef}
    />
  );
};

export const DayTimedCalendarEvent = ({
  calendarIdentity = null,
  columnIndex,
  deckLayout,
  event,
  focusColor = null,
  isActiveDraft,
  isHidden = false,
  isPlaceholder,
  isReadOnly,
  measurements,
  onOpenEvent,
  visibleDates,
}: DayTimedEventCardProps) => {
  // Stamp view-registry id attrs whenever the card has an id (saved, draft,
  // or read-only) so context menus / focus restore can resolve it.
  // Drag/resize stays gated: registry registration + hover require a saved,
  // non-read-only card.
  const hasEventIdentity = Boolean(event._id);
  const isRegisteredForDragResize =
    hasEventIdentity && !isPlaceholder && !isReadOnly && !isHidden;
  const isDeck = Boolean(deckLayout);
  const [isFocused, setIsFocused] = useState(false);
  const registrationRef = useDayEventRegistrationRef({
    eventId: event._id,
    eventType: "timed",
    isEnabled: isRegisteredForDragResize,
  });
  const interactionAttributes = useMemo(
    () =>
      hasEventIdentity
        ? getDayInteractionTargetAttributes({
            eventId: event._id,
            eventType: "timed",
            isReadOnly,
          })
        : undefined,
    [event._id, hasEventIdentity, isReadOnly],
  );
  const deckBoxShadow = isDeck ? timedDeckBoxShadow(isFocused) : undefined;
  const shouldFloatAboveDeck = isActiveDraft && !isDeck;
  const position = getDayTimedEventPosition({
    columnIndex,
    deckLayout,
    event,
    isHidden,
    isPlaceholder,
    measurements,
    visibleDates,
  });
  const zIndex = shouldFloatAboveDeck
    ? ZIndex.MAX
    : (position.zIndex ?? ZIndex.LAYER_1);

  return (
    <TimedEventCard
      boxShadow={deckBoxShadow}
      calendarIdentity={calendarIdentity}
      displayMode={isPlaceholder ? "placeholder" : "saved"}
      event={event}
      focusColor={focusColor}
      interactionAttributes={interactionAttributes}
      isHidden={isHidden}
      isSelected={isActiveDraft}
      motionMode="idle"
      onBlur={isDeck ? () => setIsFocused(false) : undefined}
      onEventKeyDown={onOpenEvent}
      onFocus={isDeck ? () => setIsFocused(true) : undefined}
      position={{ ...position, zIndex }}
      ref={registrationRef}
    />
  );
};

const getDayTimedEventPosition = ({
  columnIndex,
  deckLayout,
  event,
  isHidden,
  isPlaceholder,
  measurements,
  visibleDates,
}: {
  columnIndex: number;
  deckLayout: TimedDeckLayout | null;
  event: GridEvent;
  isHidden: boolean;
  isPlaceholder: boolean;
  measurements: GridMeasurements;
  visibleDates: GridVisibleDate[];
}) => {
  const position = getTimedEventPosition(event, {
    columnIndex,
    isDraft: isPlaceholder,
    measurements,
    visibleDates,
  });

  return applyTimedEventDisplayPosition(position, deckLayout, isHidden);
};
