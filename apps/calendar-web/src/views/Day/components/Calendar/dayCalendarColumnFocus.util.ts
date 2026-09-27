export const CALENDAR_COLUMN_ID_ATTRIBUTE = "data-calendar-column-id";

/**
 * Calendar id of the Day-view column header that currently has focus, or
 * null when focus is anywhere else. Place-create reads this at keydown so a
 * Mod+digit jump into a column seeds that calendar instead of the default.
 */
export const getFocusedDayColumnCalendarId = (): string | null => {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return null;
  return (
    active
      .closest(`[${CALENDAR_COLUMN_ID_ATTRIBUTE}]`)
      ?.getAttribute(CALENDAR_COLUMN_ID_ATTRIBUTE) ?? null
  );
};
