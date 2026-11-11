import { ID_DATEPICKER_SIDEBAR } from "@web/common/constants/web.constants";

/** True when keyboard focus is inside the sidebar month picker fieldset. */
export function isSidebarMonthPickerFocused(
  activeElement: Element | null | undefined,
): boolean {
  if (!(activeElement instanceof HTMLElement)) return false;
  if (activeElement.closest(".c-month-picker") != null) return true;
  return activeElement.closest(`.${ID_DATEPICKER_SIDEBAR}`) != null;
}
