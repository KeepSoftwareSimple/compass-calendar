import { getEventFormElement } from "@web/common/utils/form/form.util";

/** True when Tab moves between form fields rather than within an overlay. */
export function eventFormTabNavigationApplies(
  activeElement: Element | null,
): boolean {
  if (!(activeElement instanceof HTMLElement)) return false;
  const form = getEventFormElement();
  if (!form?.contains(activeElement)) return false;
  if (activeElement.closest('[role="listbox"]')) return false;
  if (form.querySelector(".react-datepicker-popper")) {
    return false;
  }
  return true;
}

export function eventFormFocusInsideForm(
  activeElement: Element | null,
): boolean {
  if (!(activeElement instanceof HTMLElement)) return false;
  return Boolean(getEventFormElement()?.contains(activeElement));
}
