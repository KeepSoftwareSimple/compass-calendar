export function PublicBookingSlotPaneSkeleton() {
  return (
    <div className="min-h-64" aria-hidden="true">
      <div className="h-5 w-28 rounded-sm bg-surface-panel motion-safe:animate-pulse" />
      <div className="mt-1 h-4 w-40 rounded-sm bg-surface-panel motion-safe:animate-pulse" />
      <div className="mt-4 grid grid-cols-2 gap-2">
        {Array.from({ length: 8 }, (_, index) => (
          <div
            className="h-10 rounded-md bg-surface-panel motion-safe:animate-pulse"
            key={`slot-${String(index)}`}
          />
        ))}
      </div>
    </div>
  );
}
