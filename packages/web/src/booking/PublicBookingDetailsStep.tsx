import { type Ref } from "react";
import {
  type PublicBookingGuestDetails,
  PublicBookingGuestForm,
  type PublicBookingGuestFormValues,
} from "@web/booking/PublicBookingGuestForm";
import { PublicBookingSlotSummary } from "@web/booking/PublicBookingSlotSummary";

interface PublicBookingDetailsStepProps {
  headingRef: Ref<HTMLHeadingElement>;
  slotStart: string;
  durationMinutes: number;
  timeZone: string;
  disabled: boolean;
  values: PublicBookingGuestDetails;
  onChange: (values: PublicBookingGuestDetails) => void;
  onSubmit: (values: PublicBookingGuestFormValues) => void;
  onChangeTime: () => void;
}

export function PublicBookingDetailsStep({
  headingRef,
  slotStart,
  durationMinutes,
  timeZone,
  disabled,
  values,
  onChange,
  onSubmit,
  onChangeTime,
}: PublicBookingDetailsStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <h2
          ref={headingRef}
          id="booking-form-heading"
          tabIndex={-1}
          className="font-medium text-base text-text focus:outline-none focus:ring-2 focus:ring-accent"
        >
          Your details
        </h2>
        <button
          type="button"
          disabled={disabled}
          onClick={onChangeTime}
          className="c-focus-ring shrink-0 text-accent text-sm underline disabled:cursor-not-allowed disabled:opacity-60"
        >
          Change time
        </button>
      </div>
      <PublicBookingSlotSummary
        slotStart={slotStart}
        durationMinutes={durationMinutes}
        timeZone={timeZone}
      />
      <PublicBookingGuestForm
        disabled={disabled}
        submitDisabled={false}
        showHeading={false}
        durationMinutes={durationMinutes}
        guestTimeZone={timeZone}
        values={values}
        onChange={onChange}
        onSubmit={onSubmit}
      />
    </div>
  );
}
