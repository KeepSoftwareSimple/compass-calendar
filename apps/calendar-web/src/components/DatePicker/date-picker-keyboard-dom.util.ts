import type React from "react";

const KEYBOARD_SELECTED_DAY_SELECTOR =
  ".react-datepicker__day--keyboard-selected:not(.react-datepicker__day--disabled)";

/** Keys the field acts on itself never reach the form or Life page shortcuts. */
export function consumeDatePickerKey(event: React.KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();
  event.nativeEvent.stopImmediatePropagation();
}

export function findKeyboardSelectedDay(calendarClassName?: string) {
  return (
    document.querySelector<HTMLElement>(
      `.react-datepicker-popper ${KEYBOARD_SELECTED_DAY_SELECTOR}`,
    ) ??
    (calendarClassName
      ? document.querySelector<HTMLElement>(
          `.calendar.${calendarClassName} ${KEYBOARD_SELECTED_DAY_SELECTOR}`,
        )
      : null)
  );
}

export function focusKeyboardSelectedDay(calendarClassName?: string) {
  requestAnimationFrame(() => {
    const day = findKeyboardSelectedDay(calendarClassName);
    if (!day) return;
    const scope = day.closest(".react-datepicker") ?? day.closest(".calendar");
    scope
      ?.querySelectorAll<HTMLElement>(".react-datepicker__day[tabindex]")
      .forEach((element) => {
        element.tabIndex = -1;
      });
    day.tabIndex = 0;
    day.focus({ preventScroll: true });
  });
}
