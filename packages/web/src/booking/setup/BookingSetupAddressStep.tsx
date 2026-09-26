import { useCallback } from "react";
import { BookingAddressField } from "@web/booking/BookingAddressField";

interface BookingSetupAddressStepProps {
  bookingUrl: string | null;
  error: string | null;
  forceInvalid?: boolean;
  onChange: (slug: string) => void;
  slug: string;
}

export function BookingSetupAddressStep({
  bookingUrl,
  error,
  forceInvalid = false,
  onChange,
  slug,
}: BookingSetupAddressStepProps) {
  const focusInput = useCallback((node: HTMLInputElement | null) => {
    node?.focus();
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <BookingAddressField
        bookingUrl={bookingUrl}
        forceInvalid={forceInvalid}
        inputRef={focusInput}
        onChange={onChange}
        slug={slug}
      />
      {error ? (
        <p className="font-medium text-sm text-text" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
