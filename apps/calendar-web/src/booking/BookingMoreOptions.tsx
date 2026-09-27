import { type ReactNode, useEffect, useRef } from "react";
import { bookingFieldAttrs } from "@web/booking/booking-sequence.fields";

export const BOOKING_MORE_OPTIONS_LABEL = "More options";

interface BookingMoreOptionsProps {
  children: ReactNode;
  forceOpen?: boolean;
}

export function BookingMoreOptions({
  children,
  forceOpen = false,
}: BookingMoreOptionsProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (forceOpen && detailsRef.current) {
      detailsRef.current.open = true;
    }
  }, [forceOpen]);

  return (
    <details
      className="c-details-animated flex flex-col gap-4"
      ref={detailsRef}
    >
      <summary className="c-focus-ring cursor-pointer list-inside font-medium text-sm text-text">
        {BOOKING_MORE_OPTIONS_LABEL}
      </summary>
      <div className="mt-3 flex flex-col gap-4" {...bookingFieldAttrs("more")}>
        {children}
      </div>
    </details>
  );
}
