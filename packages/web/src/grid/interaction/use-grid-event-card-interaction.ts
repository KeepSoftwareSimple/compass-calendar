import { useMemo } from "react";
import { useCalendarViewEventRegistrationRef } from "@web/grid/interaction/use-calendar-view-event-registration";
import {
  type CalendarGridView,
  calendarViewInteraction,
  type ViewInteractionEventType,
} from "@web/grid/interaction/view-event-registry";

export const useGridEventCardInteraction = ({
  view,
  eventId,
  eventType,
  isHidden = false,
  isPlaceholder,
  isReadOnly,
}: {
  view: CalendarGridView;
  eventId: string | undefined;
  eventType: ViewInteractionEventType;
  isHidden?: boolean;
  isPlaceholder: boolean;
  isReadOnly: boolean;
}) => {
  const hasEventIdentity = Boolean(eventId);
  const isRegisteredForDragResize =
    hasEventIdentity && !isPlaceholder && !isReadOnly && !isHidden;
  const registrationRef = useCalendarViewEventRegistrationRef({
    view,
    eventId,
    eventType,
    isEnabled: isRegisteredForDragResize,
  });
  const interaction = calendarViewInteraction(view);
  const interactionAttributes = useMemo(
    () =>
      hasEventIdentity
        ? interaction.getInteractionTargetAttributes({
            eventId,
            eventType,
            isReadOnly,
          })
        : undefined,
    [eventId, eventType, hasEventIdentity, interaction, isReadOnly],
  );

  return { interactionAttributes, registrationRef };
};
