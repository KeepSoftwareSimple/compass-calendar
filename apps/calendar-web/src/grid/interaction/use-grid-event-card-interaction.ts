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
  const interaction = calendarViewInteraction(view);
  const registrationRef = interaction.useRegistrationRef({
    eventId,
    eventType,
    isEnabled: isRegisteredForDragResize,
  });
  const interactionAttributes = useMemo(
    () =>
      hasEventIdentity
        ? interaction.getInteractionTargetAttributes({
            eventId,
            eventType,
            // Hidden strips stay out of the registry (no drag/resize) but
            // arrow keys still need to reach them, same as read-only cards.
            isReadOnly: isReadOnly || isHidden,
          })
        : undefined,
    [eventId, eventType, hasEventIdentity, interaction, isHidden, isReadOnly],
  );

  return { interactionAttributes, registrationRef };
};
