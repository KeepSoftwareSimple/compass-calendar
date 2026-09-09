import { createElement } from "react";
import { type Id } from "react-toastify";
import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import { type BookingNewMeetingsClaimReservation } from "@core/types/booking.contracts";
import {
  rememberPendingNewMeetings,
  shouldDeferAttentionToasts,
  takePendingNewMeetings,
} from "@web/billing/billing-gate-attention";
import { ROOT_ROUTES } from "@web/common/constants/routes";
import {
  getToastDefaultOptions,
  NEW_MEETINGS_TOAST_ID,
} from "@web/common/constants/toast.constants";
import { ToastActionButton } from "@web/common/utils/toast/ToastActionButton";
import { ToastNotice } from "@web/common/utils/toast/ToastNotice";
import { getToast } from "@web/common/utils/toast/toast.port";
import { useEffectiveTimeZone } from "@web/timezone/effective-timezone.store";
import { inEffectiveTimeZone } from "@web/timezone/in-time-zone";

const MEETING_WHEN_FORMAT = "ddd, MMM D, h:mm A";

export function formatHostMeetingWhen(
  slotStart: string,
  timeZone: string,
): string {
  return inEffectiveTimeZone(slotStart, timeZone).format(MEETING_WHEN_FORMAT);
}

export function newMeetingsToastCopy(
  reservations: readonly BookingNewMeetingsClaimReservation[],
  timeZone: string,
): string {
  const latest = reservations[reservations.length - 1];
  if (!latest) {
    return "";
  }
  const when = formatHostMeetingWhen(latest.slotStart, timeZone);
  if (reservations.length === 1) {
    return `${latest.guestName} booked a meeting: ${when}`;
  }
  return `${reservations.length} meetings booked since you last looked. Latest: ${latest.guestName}, ${when}`;
}

interface NewMeetingsToastProps {
  toastId: Id;
  reservations: readonly BookingNewMeetingsClaimReservation[];
}

export function NewMeetingsToast({
  toastId,
  reservations,
}: NewMeetingsToastProps) {
  const timeZone = useEffectiveTimeZone();
  const latest = reservations[reservations.length - 1];

  const handleShow = () => {
    getToast().dismiss(toastId);
    if (!latest) {
      return;
    }
    const dateString = inEffectiveTimeZone(latest.slotStart, timeZone).format(
      YEAR_MONTH_DAY_FORMAT,
    );
    void import("@web/routers").then(({ router }) => {
      void router.navigate({
        to: ROOT_ROUTES.WEEK_DATE,
        params: { dateString },
      });
    });
  };

  return (
    <ToastNotice>
      <p className="text-sm text-text">
        {newMeetingsToastCopy(reservations, timeZone)}
      </p>
      <ToastActionButton onClick={handleShow}>Show</ToastActionButton>
    </ToastNotice>
  );
}

export function showNewMeetingsToast(
  reservations: readonly BookingNewMeetingsClaimReservation[],
): void {
  if (reservations.length === 0) {
    return;
  }
  if (shouldDeferAttentionToasts()) {
    rememberPendingNewMeetings(reservations);
    return;
  }

  getToast()(
    createElement(NewMeetingsToast, {
      toastId: NEW_MEETINGS_TOAST_ID,
      reservations,
    }),
    {
      ...getToastDefaultOptions(),
      toastId: NEW_MEETINGS_TOAST_ID,
    },
  );
}

export function flushDeferredNewMeetingsToast(): void {
  const pending = takePendingNewMeetings();
  if (!pending) {
    return;
  }
  showNewMeetingsToast(pending);
}
