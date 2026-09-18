import { useMemo } from "react";
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
  const registrationRef = calendarViewInteraction(view).useRegistrationRef({
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
