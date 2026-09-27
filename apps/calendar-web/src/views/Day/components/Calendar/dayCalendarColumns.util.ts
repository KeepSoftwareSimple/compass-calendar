import { type Calendar } from "@core/types/calendar.contracts";

export const getDayViewCalendars = (calendars: Calendar[]): Calendar[] => {
  const eligibleCalendars = calendars.filter(
    (calendar) => calendar.isActive && calendar.isVisible,
  );

  if (eligibleCalendars.length > 0) {
    return eligibleCalendars;
  }

  const primaryCalendar = calendars.find((calendar) => calendar.isPrimary);
  return primaryCalendar ? [primaryCalendar] : calendars.slice(0, 1);
};
