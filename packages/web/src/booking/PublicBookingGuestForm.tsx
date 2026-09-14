import { type FormEvent, useRef, useState } from "react";
import { isGuestEmail } from "@core/types/booking.contracts";
import {
  trackBookingSubmitAttempted,
  trackBookingSubmitFailed,
} from "@web/auth/posthog/booking-funnel";

export interface PublicBookingGuestDetails {
  guestName: string;
  guestEmail: string;
  notes: string;
}

export interface PublicBookingGuestFormValues
  extends PublicBookingGuestDetails {
  guestTimeZone: string;
}

interface PublicBookingGuestFormProps {
  disabled: boolean;
  submitDisabled: boolean;
  showHeading?: boolean;
  durationMinutes: number;
  guestTimeZone: string;
  values: PublicBookingGuestDetails;
  onChange: (values: PublicBookingGuestDetails) => void;
  onSubmit: (values: PublicBookingGuestFormValues) => void;
}

interface GuestFieldErrors {
  guestName?: string;
  guestEmail?: string;
}

const validateGuestFields = (
  values: PublicBookingGuestDetails,
): GuestFieldErrors => {
  const errors: GuestFieldErrors = {};
  if (!values.guestName.trim()) {
    errors.guestName = "Enter your name.";
  }
  if (!isGuestEmail(values.guestEmail.trim())) {
    errors.guestEmail = "Enter a valid email address.";
  }
  return errors;
};

const INVALID_FIELD_CLASS_NAME = "c-field border-error";

export function PublicBookingGuestForm({
  disabled,
  submitDisabled,
  showHeading = true,
  durationMinutes,
  guestTimeZone,
  values,
  onChange,
  onSubmit,
}: PublicBookingGuestFormProps) {
  const [errors, setErrors] = useState<GuestFieldErrors>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled || submitDisabled) {
      return;
    }
    trackBookingSubmitAttempted({ duration_minutes: durationMinutes });
    // Validate the trimmed values: a whitespace-only name must be an inline
    // field error here, not a schema throw dressed up as a server failure.
    const nextErrors = validateGuestFields(values);
    setErrors(nextErrors);
    if (nextErrors.guestName || nextErrors.guestEmail) {
      trackBookingSubmitFailed("validation", {
        duration_minutes: durationMinutes,
      });
      if (nextErrors.guestName) {
        nameRef.current?.focus();
        return;
      }
      emailRef.current?.focus();
      return;
    }
    onSubmit({
      guestName: values.guestName.trim(),
      guestEmail: values.guestEmail.trim(),
      notes: values.notes.trim(),
      guestTimeZone,
    });
  };

  return (
    <form
      aria-labelledby="booking-form-heading"
      className="flex flex-col gap-4"
      noValidate
      onSubmit={handleSubmit}
    >
      {showHeading ? (
        <h2
          id="booking-form-heading"
          className="font-medium text-base text-text"
        >
          Your details
        </h2>
      ) : null}
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-text-muted">Name</span>
        <input
          ref={nameRef}
          required
          type="text"
          autoComplete="name"
          value={values.guestName}
          disabled={disabled}
          aria-invalid={errors.guestName ? true : undefined}
          aria-describedby={
            errors.guestName ? "booking-guest-name-error" : undefined
          }
          onChange={(event) => {
            onChange({ ...values, guestName: event.target.value });
            setErrors((current) => ({ ...current, guestName: undefined }));
          }}
          className={errors.guestName ? INVALID_FIELD_CLASS_NAME : "c-field"}
        />
        {errors.guestName ? (
          <span
            id="booking-guest-name-error"
            role="alert"
            className="text-error text-xs"
          >
            {errors.guestName}
          </span>
        ) : null}
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-text-muted">Email</span>
        <input
          ref={emailRef}
          required
          type="email"
          autoComplete="email"
          value={values.guestEmail}
          disabled={disabled}
          aria-invalid={errors.guestEmail ? true : undefined}
          aria-describedby={
            errors.guestEmail ? "booking-guest-email-error" : undefined
          }
          onChange={(event) => {
            onChange({ ...values, guestEmail: event.target.value });
            setErrors((current) => ({ ...current, guestEmail: undefined }));
          }}
          className={errors.guestEmail ? INVALID_FIELD_CLASS_NAME : "c-field"}
        />
        {errors.guestEmail ? (
          <span
            id="booking-guest-email-error"
            role="alert"
            className="text-error text-xs"
          >
            {errors.guestEmail}
          </span>
        ) : null}
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-text-muted">Notes (optional)</span>
        <textarea
          rows={3}
          value={values.notes}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...values, notes: event.target.value })
          }
          className="c-field"
        />
      </label>
      <button
        type="submit"
        disabled={disabled || submitDisabled}
        aria-busy={disabled || undefined}
        className="c-button c-button-primary"
      >
        {disabled ? "Confirming..." : "Confirm meeting"}
      </button>
    </form>
  );
}
