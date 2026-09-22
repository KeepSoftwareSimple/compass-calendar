interface PublicBookingMonthGridSkeletonProps {
  monthHeading: string;
}

export function PublicBookingMonthGridSkeleton({
  monthHeading,
}: PublicBookingMonthGridSkeletonProps) {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <div className="flex h-10 items-center justify-between gap-2">
        <div className="h-9 w-20 rounded-md bg-surface-panel motion-safe:animate-pulse" />
        <p className="font-medium text-base text-text">{monthHeading}</p>
        <div className="h-9 w-20 rounded-md bg-surface-panel motion-safe:animate-pulse" />
      </div>
      <div className="w-full">
        <div className="grid grid-cols-7">
          {Array.from({ length: 7 }, (_, index) => (
            <div className="pb-1" key={`weekday-${String(index)}`}>
              <div className="mx-auto h-3 w-6 rounded-sm bg-surface-panel motion-safe:animate-pulse" />
            </div>
          ))}
        </div>
        {Array.from({ length: 6 }, (_, week) => (
          <div className="grid grid-cols-7" key={`week-${String(week)}`}>
            {Array.from({ length: 7 }, (_, day) => (
              <div
                className="p-0.5"
                key={`cell-${String(week)}-${String(day)}`}
              >
                <div className="h-10 w-full rounded-md bg-surface-panel motion-safe:animate-pulse" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
