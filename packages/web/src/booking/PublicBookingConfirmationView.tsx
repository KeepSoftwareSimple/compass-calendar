import { CheckCircleIcon } from "@phosphor-icons/react";
import { type CalendarConference } from "@core/types/calendar.contracts";
import {
  BOOKING_CONFERENCE_INVITE_COPY,
  resolveBookingConference,
} from "@web/booking/booking-conference.copy";
import { PublicBookingLayout } from "@web/booking/PublicBookingLayout";
import { PublicBookingSlotSummary } from "@web/booking/PublicBookingSlotSummary";
import { PUBLIC_BOOKING_HEADING_CLASS } from "@web/booking/PublicBookingStatusMessage";
import { useBookingHeadingFocus } from "@web/booking/use-booking-heading-focus";

interface PublicBookingConfirmationViewProps {
  hostDisplayName: string;
  guestName: string;
  notes: string | null;
  durationMinutes: number;
  slotStart: string;
  timeZone: string;
  conference?: CalendarConference;
  createsGoogleMeet?: boolean;
  cancelUrl?: string;
  rescheduleUrl?: string;
  onEditDetails?: () => void;
}

export function PublicBookingConfirmationView({
  hostDisplayName,
  guestName,
  notes,
  durationMinutes,
  slotStart,
  timeZone,
  conference,
  createsGoogleMeet = true,
  cancelUrl,
  rescheduleUrl,
  onEditDetails,
}: PublicBookingConfirmationViewProps) {
  const headingRef = useBookingHeadingFocus(hostDisplayName);

  return (
    <PublicBookingLayout>
      <section
        aria-labelledby="booking-confirmation-heading"
        className="flex flex-col gap-4"
      >
        <div className="flex items-start gap-3">
          <CheckCircleIcon
            aria-hidden
            className="mt-0.5 shrink-0 text-success"
            size={28}
            weight="fill"
          />
          <h1
            ref={headingRef}
            id="booking-confirmation-heading"
            tabIndex={-1}
            className={PUBLIC_BOOKING_HEADING_CLASS}
          >
            You're meeting with {hostDisplayName}
          </h1>
        </div>
        <PublicBookingSlotSummary
          durationMinutes={durationMinutes}
          slotStart={slotStart}
          timeZone={timeZone}
        />
        <dl className="rounded-md border border-border bg-surface-panel px-3 py-2 text-sm text-text">
          <div>
            <dt className="text-text-muted">Name</dt>
            <dd>{guestName}</dd>
          </div>
          {notes ? (
            <div className="mt-2">
              <dt className="text-text-muted">Notes</dt>
              <dd>{notes}</dd>
            </div>
          ) : null}
        </dl>
        <p className="text-sm text-text">
          {
            BOOKING_CONFERENCE_INVITE_COPY[
              resolveBookingConference(conference, createsGoogleMeet)
            ]
          }
        </p>
        {onEditDetails ? (
          <button
            type="button"
            onClick={onEditDetails}
            className="c-button c-button-secondary"
          >
            Edit details
          </button>
        ) : null}
        {cancelUrl || rescheduleUrl ? (
          // biome-ignore lint/a11y/useSemanticElements: fieldset's min-inline-size breaks the flex column; role="group" is the accessible equivalent
          <div
            className="flex flex-col items-start gap-3"
            role="group"
            aria-label="Meeting actions"
          >
            {cancelUrl ? (
              <a
                href={cancelUrl}
                className="c-focus-ring text-accent text-sm underline"
              >
                Cancel this meeting
              </a>
            ) : null}
            {rescheduleUrl ? (
              <a
                href={rescheduleUrl}
                className="c-focus-ring text-accent text-sm underline"
              >
                Reschedule this meeting
              </a>
            ) : null}
          </div>
        ) : null}
      </section>
    </PublicBookingLayout>
  );
}
