import { formatOwnerInboxScheduleLine } from "@booking-web/booking/public-booking.format";
import { useBookingShortcut } from "@booking-web/shortcuts/useBookingShortcut";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { type HostUpcomingBookingReservation } from "@core/types/booking.contracts";

interface PublicBookingOwnerInboxRowProps {
  booking: HostUpcomingBookingReservation;
  hostTimeZone: string;
  onCancel: (reservationId: string) => void;
  cancelPending: boolean;
}

export function PublicBookingOwnerInboxRow({
  booking,
  hostTimeZone,
  onCancel,
  cancelPending,
}: PublicBookingOwnerInboxRowProps) {
  const [confirming, setConfirming] = useState(false);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const dialogHeadingId = useId();
  const dialogDescriptionId = useId();

  const revertConfirm = useCallback(() => {
    setConfirming(false);
  }, []);

  const executeCancel = useCallback(() => {
    onCancel(booking.reservationId);
    setConfirming(false);
  }, [booking.reservationId, onCancel]);

  const onCancelClick = useCallback(() => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    executeCancel();
  }, [confirming, executeCancel]);

  useEffect(() => {
    if (confirming) {
      confirmButtonRef.current?.focus();
    }
  }, [confirming]);

  useBookingShortcut(
    "Escape",
    (event) => {
      if (!confirming || cancelPending) {
        return;
      }
      event.preventDefault();
      revertConfirm();
    },
    { enabled: confirming && !cancelPending, ignoreInputs: false },
  );

  useHotkey(
    "Enter",
    (event) => {
      if (!confirming || cancelPending) {
        return;
      }
      event.preventDefault();
      executeCancel();
    },
    { enabled: confirming && !cancelPending, ignoreInputs: false },
  );

  const scheduleLine = formatOwnerInboxScheduleLine(
    booking.slotStart,
    booking.durationMinutes,
    hostTimeZone,
  );
  const guestLine = `${booking.guestName} · ${booking.guestEmail}`;

  if (confirming) {
    return (
      <li className="rounded-lg border border-border bg-surface p-3">
        <div
          aria-describedby={dialogDescriptionId}
          aria-labelledby={dialogHeadingId}
          aria-modal="true"
          className="flex flex-col gap-3"
          role="alertdialog"
        >
          <h3 className="font-medium text-sm text-text" id={dialogHeadingId}>
            Cancel this booking?
          </h3>
          <p className="text-sm text-text-muted" id={dialogDescriptionId}>
            {guestLine} on {scheduleLine}. The guest will be notified and the
            event will be removed from your calendar.
          </p>
          <p className="text-text-muted text-xs">
            Enter confirms. Esc keeps the booking.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              className="c-button c-button-primary min-h-11"
              disabled={cancelPending}
              onClick={onCancelClick}
              ref={confirmButtonRef}
              type="button"
            >
              {cancelPending ? "Canceling..." : "Confirm cancel"}
            </button>
            <button
              className="c-button c-button-secondary min-h-11"
              disabled={cancelPending}
              onClick={revertConfirm}
              type="button"
            >
              Keep booking
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-lg border border-border bg-surface p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="break-words text-sm text-text">{guestLine}</p>
          <p className="text-sm text-text-muted">{scheduleLine}</p>
          {booking.meetLink ? (
            <a
              className="c-focus-ring inline-flex min-h-11 items-center pt-1 text-accent text-sm underline"
              href={booking.meetLink}
              rel="noopener noreferrer"
              target="_blank"
            >
              Join meeting
            </a>
          ) : null}
        </div>
        <button
          className="c-button c-button-secondary min-h-11 shrink-0 self-start"
          disabled={cancelPending}
          onClick={onCancelClick}
          type="button"
        >
          Cancel
        </button>
      </div>
    </li>
  );
}
