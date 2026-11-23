import { PublicBookingLayout } from "@booking-web/booking/PublicBookingLayout";
import { useBookingHeadingFocus } from "@booking-web/booking/use-booking-heading-focus";
import { type ReactNode } from "react";

export const PUBLIC_BOOKING_HEADING_CLASS =
  "font-semibold text-text text-xl focus:outline-none focus:ring-2 focus:ring-accent";

interface PublicBookingStatusMessageProps {
  title: string;
  description: string;
  retryQuery?: { refetch: () => Promise<unknown>; isFetching: boolean };
  children?: ReactNode;
}

export function PublicBookingStatusMessage({
  title,
  description,
  retryQuery,
  children,
}: PublicBookingStatusMessageProps) {
  const headingRef = useBookingHeadingFocus(title);

  return (
    <PublicBookingLayout>
      <section aria-labelledby="booking-status-heading">
        <h1
          ref={headingRef}
          id="booking-status-heading"
          tabIndex={-1}
          className={PUBLIC_BOOKING_HEADING_CLASS}
        >
          {title}
        </h1>
        <p className="mt-2 text-sm text-text-muted">{description}</p>
        {retryQuery && (
          <button
            type="button"
            className="c-focus-ring mt-3 rounded-xs text-sm text-text underline"
            disabled={retryQuery.isFetching}
            onClick={() => void retryQuery.refetch()}
          >
            {retryQuery.isFetching ? "Checking…" : "Try again"}
          </button>
        )}
        {children}
      </section>
    </PublicBookingLayout>
  );
}
