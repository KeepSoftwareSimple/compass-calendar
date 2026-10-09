/** Short label for a day-view column header; full name stays in tooltips and a11y. */
export const formatDayCalendarColumnDisplayName = (name: string): string => {
  const trimmed = name.trim();
  const at = trimmed.lastIndexOf("@");
  if (at > 0 && at < trimmed.length - 1 && !trimmed.includes(" ")) {
    return trimmed.slice(0, at);
  }
  return trimmed;
};
