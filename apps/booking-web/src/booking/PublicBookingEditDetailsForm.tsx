import { PublicBookingLayout } from "@booking-web/booking/PublicBookingLayout";
import { PUBLIC_BOOKING_HEADING_CLASS } from "@booking-web/booking/PublicBookingStatusMessage";
import { useBookingHeadingFocus } from "@booking-web/booking/use-booking-heading-focus";
import { type FormEvent, useRef, useState } from "react";

interface PublicBookingEditDetailsFormProps {
  guestName: string;
  notes: string;
  disabled: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: { name: string; notes: string }) => void;
}

const INVALID_FIELD_CLASS_NAME = "c-field border-error";

export function PublicBookingEditDetailsForm({
  guestName,
  notes,
  disabled,
  error,
  onCancel,
  onSubmit,
}: PublicBookingEditDetailsFormProps) {
  const headingRef = useBookingHeadingFocus("edit-details");
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(guestName);
  const [noteValue, setNoteValue] = useState(notes);
  const [nameError, setNameError] = useState<string | undefined>();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) {
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError("Enter your name.");
      nameRef.current?.focus();
      return;
    }
    onSubmit({ name: trimmedName, notes: noteValue.trim() });
  };

  return (
    <PublicBookingLayout>
      <form
        aria-labelledby="booking-edit-details-heading"
        className="flex flex-col gap-4"
        noValidate
        onSubmit={handleSubmit}
      >
        <h1
          ref={headingRef}
          id="booking-edit-details-heading"
          tabIndex={-1}
          className={PUBLIC_BOOKING_HEADING_CLASS}
        >
          Edit details
        </h1>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-muted">Name</span>
          <input
            ref={nameRef}
            required
            type="text"
            autoComplete="name"
            maxLength={256}
            value={name}
            disabled={disabled}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? "booking-edit-name-error" : undefined}
            onChange={(event) => {
              setName(event.target.value);
              setNameError(undefined);
            }}
            className={nameError ? INVALID_FIELD_CLASS_NAME : "c-field"}
          />
          {nameError ? (
            <span
              id="booking-edit-name-error"
              role="alert"
              className="text-error text-xs"
            >
              {nameError}
            </span>
          ) : null}
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-muted">Notes (optional)</span>
          <textarea
            rows={3}
            maxLength={4000}
            value={noteValue}
            disabled={disabled}
            onChange={(event) => setNoteValue(event.target.value)}
            className="c-field"
          />
        </label>
        {error ? (
          <p role="alert" className="text-error text-sm">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={disabled}
          aria-busy={disabled || undefined}
          className="c-button c-button-primary"
        >
          {disabled ? "Saving..." : "Save details"}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onCancel}
          className="c-button c-button-secondary"
        >
          Back
        </button>
      </form>
    </PublicBookingLayout>
  );
}
