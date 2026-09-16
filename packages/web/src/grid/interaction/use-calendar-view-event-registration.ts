import { useEventRegistrationRef } from "@web/grid/interaction/use-event-registration-ref";
import {
  type CalendarGridView,
  calendarViewInteraction,
  type ViewInteractionEventType,
} from "@web/grid/interaction/view-event-registry";

export const useCalendarViewEventRegistrationRef = ({
  view,
  eventId,
  eventType,
  isEnabled,
}: {
  view: CalendarGridView;
  eventId: string | undefined;
  eventType: ViewInteractionEventType;
  isEnabled: boolean;
}) =>
  useEventRegistrationRef({
    eventId,
    eventType,
    isEnabled,
    registry: calendarViewInteraction(view).registry,
  });
