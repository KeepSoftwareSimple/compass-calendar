import { ID_GRID_MAIN, ID_SIDEBAR } from "@web/common/constants/web.constants";

const tabStopDaySelector = '.react-datepicker__day[tabindex="0"]';

let sidebarPickerReturnFocus: HTMLElement | null = null;
let sidebarPickerFallback: HTMLElement | null = null;

/** Remember where focus was before `i` moves it into the month picker. */
export const rememberSidebarPickerReturnFocus = () => {
  const active = document.activeElement;
  sidebarPickerReturnFocus = active instanceof HTMLElement ? active : null;
};

/**
 * Escape from the sidebar month picker returns here, or the main grid when
 * the prior target is gone.
 */
export const restoreSidebarPickerReturnFocus = (): boolean => {
  const previous = sidebarPickerReturnFocus;
  sidebarPickerReturnFocus = null;
  sidebarPickerFallback = null;
  if (previous && document.contains(previous)) {
    previous.focus({ preventScroll: true });
    return true;
  }
  const grid = document.getElementById(ID_GRID_MAIN);
  grid?.focus({ preventScroll: true });
  return Boolean(grid);
};

/**
 * Focuses the month picker's tab-stoppable day (react-datepicker keeps
 * exactly one day at tabindex=0) so arrow keys navigate dates right away,
 * falling back to the first interactive element in the sidebar.
 * Used by the Day and Week views' "i" shortcut. Returns whether a focus
 * target was found.
 * The picker takes focus when its lazy chunk mounts if initial focus had
 * to land on the fallback and the user is still there.
 */
export const focusFirstSidebarItem = (): boolean => {
  const sidebar = document.getElementById(ID_SIDEBAR);
  if (!sidebar) return false;

  rememberSidebarPickerReturnFocus();

  const day = sidebar.querySelector<HTMLElement>(tabStopDaySelector);
  if (day) {
    sidebarPickerFallback = null;
    day.focus();
    return true;
  }
  sidebarPickerFallback = sidebar.querySelector<HTMLElement>(
    'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
  );
  sidebarPickerFallback?.focus();
  return Boolean(sidebarPickerFallback);
};

export const focusSidebarPickerAfterMount = (picker: HTMLElement) => {
  const fallback = sidebarPickerFallback;
  sidebarPickerFallback = null;
  if (fallback && document.activeElement === fallback) {
    picker.querySelector<HTMLElement>(tabStopDaySelector)?.focus();
  }
};
