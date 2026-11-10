/** SPA path prefixes shared by web and tests (no router imports). */
const LIFE_PREFIX = "/life";
const WEEK_PREFIX = "/week";
const DAY_PREFIX = "/day";

function normalizePathname(pathname: string): string {
  return pathname.split("?")[0]?.replace(/\/+$/, "") || "/";
}

/** True for `/life` and nested life routes. */
export function isLifeSpaPathname(pathname: string): boolean {
  const path = normalizePathname(pathname);
  return path === LIFE_PREFIX || path.startsWith(`${LIFE_PREFIX}/`);
}

/**
 * Day, week, and the default calendar home (`/`) where grid drafts and grid
 * mode hints apply.
 */
export function isCalendarGridSpaPathname(pathname: string): boolean {
  const path = normalizePathname(pathname);
  if (path === "/") return true;
  if (path === WEEK_PREFIX || path.startsWith(`${WEEK_PREFIX}/`)) return true;
  if (path === DAY_PREFIX || path.startsWith(`${DAY_PREFIX}/`)) return true;
  return false;
}

export const LIFE_DATE_PICKER_HINT_IDS = [
  "date-picker-life",
  "date-picker-life-caption",
] as const;

export type LifeDatePickerHintId = (typeof LIFE_DATE_PICKER_HINT_IDS)[number];

const CALENDAR_ONLY_DATE_PICKER_HINT_IDS = new Set([
  "date-picker-sidebar-month",
  "date-picker-event-form",
  "date-picker-event-form-caption",
  "date-picker-recurrence-until",
]);

/** Whether the sidebar should show calendar grid mode indicators (draft place, jump, etc.). */
export function calendarGridSidebarModeHintsEligible(
  pathname: string,
): boolean {
  return isCalendarGridSpaPathname(pathname) && !isLifeSpaPathname(pathname);
}

/**
 * Whether a date-picker contextual hint should occupy the sidebar status bar.
 * Life keeps only life birth-date picker help; the calendar keeps any active surface.
 */
export function sidebarDatePickerHintEligible(
  pathname: string,
  hintIds: readonly string[],
): boolean {
  if (hintIds.length === 0) return false;
  if (isLifeSpaPathname(pathname)) {
    return hintIds.some((id) =>
      (LIFE_DATE_PICKER_HINT_IDS as readonly string[]).includes(id),
    );
  }
  if (isCalendarGridSpaPathname(pathname)) return true;
  return false;
}

export function isCalendarOnlyDatePickerHintId(id: string): boolean {
  return CALENDAR_ONLY_DATE_PICKER_HINT_IDS.has(id);
}
