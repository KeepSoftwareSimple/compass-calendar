import { useState } from "react";
import { bookingSlugParseMessage } from "@web/booking/booking.util";

export interface BookingSlugFieldState {
  /** Ids of the messages on screen, for the input's aria-describedby. */
  describedBy: string | undefined;
  errorId: string;
  markBlurred: () => void;
  parseMessage: string | null;
  showError: boolean;
  showWarning: boolean;
  warningId: string;
}

interface BookingSlugFieldOptions {
  /** A save error on the address field invalidates before the first blur. */
  forceInvalid: boolean;
  /** Prefix for the error and warning element ids, unique per field. */
  idPrefix: string;
  /** The slug already live, or null when the page has never been saved. */
  savedSlug: string | null;
  slug: string;
}

/**
 * Validation state shared by the meeting-link field and the setup wizard's
 * address field: both hold back the parse message until the first blur, both
 * warn once an edit leaves the saved slug behind, and both describe the input
 * with whichever of the two messages is on screen.
 */
export function useBookingSlugField({
  forceInvalid,
  idPrefix,
  savedSlug,
  slug,
}: BookingSlugFieldOptions): BookingSlugFieldState {
  const [blurred, setBlurred] = useState(false);
  const parseMessage = bookingSlugParseMessage(slug);
  const showError = (blurred || forceInvalid) && parseMessage != null;
  const showWarning = savedSlug != null && slug !== savedSlug;
  const errorId = `${idPrefix}-error`;
  const warningId = `${idPrefix}-warning`;
  const describedBy =
    [showError ? errorId : null, showWarning ? warningId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return {
    describedBy,
    errorId,
    markBlurred: () => setBlurred(true),
    parseMessage,
    showError,
    showWarning,
    warningId,
  };
}
