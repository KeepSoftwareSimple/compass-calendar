import { type DatePickerHintId } from "@web/shortcuts/tips/date-picker-hint.store";

/**
 * Sidebar month navigation defers while a grid date picker or recurrence end
 * picker is publishing keyboard help, so two lines never fight.
 */
export function shouldDeferSidebarMonthHint(
  stack: readonly { id: DatePickerHintId }[],
): boolean {
  return stack.some((s) => {
    const id = s.id as string;
    return (
      id.startsWith("date-picker-life") ||
      id.startsWith("date-picker-event-form") ||
      id === "date-picker-recurrence-until"
    );
  });
}
