import { useCallback } from "react";
import { useCalendarsQuery } from "@web/calendars/calendar.query";
import { useDefaultTargetCalendar } from "@web/calendars/useDefaultTargetCalendar";
import { focusCalendarEventElement } from "@web/common/utils/event/event.util";
import { buildQuickFirstEventCreateInput } from "@web/components/FirstEventPrompt/buildQuickFirstEventCreateInput";
import { useEventMutations } from "@web/events/mutations/useEventMutations";
import { useToday } from "@web/views/Week/hooks/useToday";

/**
 * Creates and saves a timed event with a sensible default title and schedule,
 * without opening the event form.
 */
export function useQuickCreateFirstEvent() {
  const { data: calendars } = useCalendarsQuery();
  const targetCalendar = useDefaultTargetCalendar(calendars ?? []);
  const { create } = useEventMutations();
  const { today } = useToday();

  return useCallback(() => {
    const calendarId = targetCalendar?.id;
    if (!calendarId) return;

    const input = buildQuickFirstEventCreateInput(
      today.startOf("day"),
      calendarId,
    );
    if (!input?.id) return;

    const eventId = input.id;
    create(input, {
      onOptimisticApplied: () => {
        focusCalendarEventElement(eventId);
      },
    });
  }, [create, targetCalendar?.id, today]);
}
