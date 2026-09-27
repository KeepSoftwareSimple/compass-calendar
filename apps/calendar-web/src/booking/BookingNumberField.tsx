import { BookingFieldLabel } from "@web/booking/BookingFieldLabel";
import {
  type BookingField,
  bookingFieldAttrs,
} from "@web/booking/booking-sequence.fields";

interface BookingNumberFieldProps {
  field: BookingField;
  id: string;
  label: string;
  value: string;
  onChange: (raw: string) => void;
  invalid: boolean;
  invalidMessage: string;
  min: number;
  max?: number;
}

/**
 * The number-input row the booking form uses for the minimum-notice and
 * horizon fields: a labelled `<input type="number">` with an inline error
 * message wired up through `aria-invalid`/`aria-describedby`. Both fields
 * hold the raw text in the parent so an empty field can surface as an
 * inline error instead of a silent Save block.
 */
export function BookingNumberField({
  field,
  id,
  label,
  value,
  onChange,
  invalid,
  invalidMessage,
  min,
  max,
}: BookingNumberFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div>
      <BookingFieldLabel htmlFor={id}>{label}</BookingFieldLabel>
      <input
        {...bookingFieldAttrs(field)}
        aria-describedby={invalid ? errorId : undefined}
        aria-invalid={invalid || undefined}
        className="c-focus-ring w-full rounded border border-border bg-surface-overlay px-2 py-1 text-sm text-text aria-invalid:border-error"
        id={id}
        max={max}
        min={min}
        onChange={(event) => onChange(event.target.value)}
        type="number"
        value={value}
      />
      {invalid ? (
        <p className="font-medium text-sm text-text" id={errorId} role="alert">
          {invalidMessage}
        </p>
      ) : null}
    </div>
  );
}
