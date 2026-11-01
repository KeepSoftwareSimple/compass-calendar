import { ID_GRID_MAIN, ID_SIDEBAR } from "@web/common/constants/web.constants";

let sidebarPickerReturnFocus: HTMLElement | null = null;

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
 *
 * MonthPicker is lazy (Sidebar.tsx), so for the moment its chunk is still
 * in flight the day query misses and the button fallback wins — accepted:
 * the window is one fetch per session and "i" still lands in the sidebar.
 */
export const focusFirstSidebarItem = (): boolean => {
  const sidebar = document.getElementById(ID_SIDEBAR);
  if (!sidebar) return false;

  rememberSidebarPickerReturnFocus();

  const target =
    sidebar.querySelector<HTMLElement>(
      '.react-datepicker__day[tabindex="0"]',
    ) ??
    sidebar.querySelector<HTMLElement>(
      'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    );
  target?.focus();
  return Boolean(target);
};
