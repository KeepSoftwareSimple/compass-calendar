/** Calendar color dot and name shown inside a day-view column header. */
export const DayCalendarColumnLabel = ({
  backgroundColor,
  name,
}: {
  backgroundColor: string;
  name: string;
}) => (
  <span className="flex w-full min-w-0 items-center justify-center gap-2 overflow-hidden">
    <span
      aria-hidden="true"
      className="size-2 shrink-0 rounded-full"
      style={{ backgroundColor }}
    />
    <span className="min-w-0 truncate text-sm text-text">{name}</span>
  </span>
);
