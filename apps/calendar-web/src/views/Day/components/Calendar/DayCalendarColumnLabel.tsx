/** Calendar color dot and name shown inside a day-view column header. */
export const DayCalendarColumnLabel = ({
  backgroundColor,
  name,
}: {
  backgroundColor: string;
  name: string;
}) => (
  <>
    <span
      aria-hidden="true"
      className="size-2 shrink-0 rounded-full"
      style={{ backgroundColor }}
    />
    <span className="truncate text-sm text-text">{name}</span>
  </>
);
