import { createElement } from "react";
import { type Id } from "react-toastify";
import {
  type BookingNewMeetingsClaimReservation,
  type BookingNewMeetingsClaimResponse,
} from "@core/types/booking.contracts";
import {
  rememberPendingNewMeetings,
  shouldDeferAttentionToasts,
  takePendingNewMeetings,
} from "@web/billing/billing-gate-attention";
import {
  dismissToastAndOpenWeekForSlot,
  formatHostMeetingWhen,
} from "@web/booking/booking-host-meeting.util";
import {
  getToastDefaultOptions,
  NEW_MEETINGS_TOAST_ID,
} from "@web/common/constants/toast.constants";
import { ToastActionButton } from "@web/common/utils/toast/ToastActionButton";
import { ToastNotice } from "@web/common/utils/toast/ToastNotice";
import { getToast } from "@web/common/utils/toast/toast.port";
import { useEffectiveTimeZone } from "@web/timezone/effective-timezone.store";

function latestGuestActionSentence(
  latest: BookingNewMeetingsClaimReservation,
  timeZone: string,
): string {
  const when = formatHostMeetingWhen(latest.slotStart, timeZone);
  switch (latest.kind) {
    case "cancelled":
      return `${latest.guestName} cancelled: ${when}`;
    case "rescheduled":
      return `${latest.guestName} moved a meeting to ${when}`;
    default:
      return `${latest.guestName} booked a meeting: ${when}`;
  }
}

export function newMeetingsToastCopy(
  count: number,
  latest: BookingNewMeetingsClaimReservation | null,
  timeZone: string,
): string {
  if (!latest || count < 1) {
    return "";
  }
  if (count === 1) {
    return latestGuestActionSentence(latest, timeZone);
  }
  return `${count} meeting updates since you last looked. Latest: ${latestGuestActionSentence(latest, timeZone)}`;
}

interface NewMeetingsToastProps {
  toastId: Id;
  count: number;
  latest: BookingNewMeetingsClaimReservation;
}

export function NewMeetingsToast({
  toastId,
  count,
  latest,
}: NewMeetingsToastProps) {
  const timeZone = useEffectiveTimeZone();

  const handleShow = () => {
    dismissToastAndOpenWeekForSlot(toastId, latest.slotStart, timeZone);
  };

  return (
    <ToastNotice>
      <p className="text-sm text-text">
        {newMeetingsToastCopy(count, latest, timeZone)}
      </p>
      <ToastActionButton onClick={handleShow}>Show</ToastActionButton>
    </ToastNotice>
  );
}

export function showNewMeetingsToast(
  claim: BookingNewMeetingsClaimResponse,
): void {
  if (claim.count < 1 || !claim.latest) {
    return;
  }
  if (shouldDeferAttentionToasts()) {
    rememberPendingNewMeetings(claim);
    return;
  }

  getToast()(
    createElement(NewMeetingsToast, {
      toastId: NEW_MEETINGS_TOAST_ID,
      count: claim.count,
      latest: claim.latest,
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
