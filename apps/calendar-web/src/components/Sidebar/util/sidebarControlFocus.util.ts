/**
 * Focus hand-off between the header sidebar toggle and the in-sidebar
 * dismiss control. Targets stable data attributes instead of dynamic
 * aria-labels (Open ↔ Close) so a label change cannot break the hand-off.
 */

export const SIDEBAR_TOGGLE_CONTROL = "toggle";
export const SIDEBAR_DISMISS_CONTROL = "dismiss";

type SidebarControl =
  | typeof SIDEBAR_TOGGLE_CONTROL
  | typeof SIDEBAR_DISMISS_CONTROL;

/** Focus a sidebar control after the open/close commit (setTimeout 0). */
export function focusSidebarControl(control: SidebarControl): void {
  window.setTimeout(() => {
    document
      .querySelector<HTMLButtonElement>(`[data-sidebar-control="${control}"]`)
      ?.focus();
  }, 0);
}
