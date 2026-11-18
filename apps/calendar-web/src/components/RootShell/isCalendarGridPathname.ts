import { isCalendarGridSpaPathname } from "@core/shortcuts/sidebar-hint-surface";

/** True for `/`, `/week`, `/day`, and dated variants (not Life). */
export function isCalendarGridPathname(pathname: string): boolean {
  return isCalendarGridSpaPathname(pathname);
}
