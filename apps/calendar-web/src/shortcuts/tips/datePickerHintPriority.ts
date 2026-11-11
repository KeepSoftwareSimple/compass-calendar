import { type DatePickerHintId } from "@web/shortcuts/tips/date-picker-hint.store";

/**
 * Sidebar month navigation defers while a grid date picker or recurrence end
 * picker is publishing keyboard help, so two lines never fight.
 */
export function shouldDeferSidebarMonthHint(
  stack: readonly { id: DatePickerHintId }[],
): boolean {
  return stack.some((s) => {
    switch (s.id) {
      case "date-picker-sidebar-month":
        return false;
      case "date-picker-life":
      case "date-picker-life-caption":
      case "date-picker-event-form":
      case "date-picker-event-form-caption":
      case "date-picker-recurrence-until":
        return true;
    }
  });
}
