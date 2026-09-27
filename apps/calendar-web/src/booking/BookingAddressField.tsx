import { type RefCallback } from "react";
import { BookingFieldLabel } from "@web/booking/BookingFieldLabel";
import { BookingSlugFieldMessages } from "@web/booking/BookingSlugFieldMessages";
import { bookingAddressPrefix } from "@web/booking/booking-address.util";
import { bookingFieldAttrs } from "@web/booking/booking-sequence.fields";
import { useBookingSlugField } from "@web/booking/useBookingSlugField";

interface BookingAddressFieldProps {
  bookingUrl: string | null;
  forceInvalid?: boolean;
  inputRef?: RefCallback<HTMLInputElement | null>;
  onChange: (slug: string) => void;
  slug: string;
}

/**
 * Bare slug input for the setup wizard, where the page has no saved address
 * yet. Hosts editing a live page get BookingMeetingLinkField instead.
 */
export function BookingAddressField({
  bookingUrl,
  forceInvalid = false,
  inputRef,
  onChange,
  slug,
}: BookingAddressFieldProps) {
  const prefix = bookingAddressPrefix(bookingUrl);
  const field = useBookingSlugField({
    forceInvalid,
    idPrefix: "booking-address",
    savedSlug: null,
    slug,
  });

  return (
    <div className="min-w-0">
      <BookingFieldLabel htmlFor="booking-address">
        Page address
      </BookingFieldLabel>
      <input
        {...bookingFieldAttrs("address")}
        aria-describedby={field.describedBy}
        aria-invalid={field.showError || undefined}
        autoCapitalize="none"
        className={`c-focus-ring w-full min-w-0 rounded border bg-surface-overlay px-2 py-1 text-sm text-text ${
          field.showError ? "border-error" : "border-border"
        }`}
        id="booking-address"
        onBlur={field.markBlurred}
        ref={inputRef}
        onChange={(event) => onChange(event.target.value.toLowerCase())}
        spellCheck={false}
        value={slug}
      />
      <p className="break-all text-text-muted text-xs">
        Your link: {prefix}
        {slug}
      </p>
      <BookingSlugFieldMessages field={field} />
    </div>
  );
}
