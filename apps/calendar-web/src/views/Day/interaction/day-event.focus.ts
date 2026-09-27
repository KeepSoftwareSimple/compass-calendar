import { dayEventTargeting } from "@web/grid/interaction/view-event-registry";

export function focusFirstDayCalendarEvent() {
  const target = dayEventTargeting.getFirstNavigableGridEventTarget();

  if (!target) {
    return;
  }

  target.element.scrollIntoView({ block: "nearest" });
  dayEventTargeting.focusGridEventTarget(target);
}
