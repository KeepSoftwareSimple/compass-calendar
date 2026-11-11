import { createElement } from "react";
import { type Id } from "react-toastify";
import {
  type BookingGuestRsvpClaimReply,
  type BookingGuestRsvpClaimResponse,
} from "@core/types/booking.contracts";
import { type AttendeeResponseStatus } from "@core/types/event-attendance.contracts";
import {
  rememberPendingGuestRsvp,
  shouldDeferAttentionToasts,
  takePendingGuestRsvp,
} from "@web/billing/billing-gate-attention";
import {
  dismissToastAndOpenWeekForSlot,
  formatHostMeetingWhen,
} from "@web/booking/booking-host-meeting.util";
import {
  GUEST_RSVP_TOAST_ID,
  getToastDefaultOptions,
} from "@web/common/constants/toast.constants";
import { ToastActionButton } from "@web/common/utils/toast/ToastActionButton";
import { ToastNotice } from "@web/common/utils/toast/ToastNotice";
import { getToast } from "@web/common/utils/toast/toast.port";
import { useEffectiveTimeZone } from "@web/timezone/effective-timezone.store";

export type GuestRsvpReplyNotice = {
  guestName: string;
  status: AttendeeResponseStatus;
  slotStart: string;
};

export type GuestRsvpToastPayload = {
  count: number;
  latest: GuestRsvpReplyNotice;
  whileYouWereAway: boolean;
};

export function guestRsvpActionPhrase(status: AttendeeResponseStatus): string {
  switch (status) {
    case "accepted":
      return "accepted";
    case "declined":
      return "declined";
    case "tentative":
      return "replied maybe";
    default:
      return "";
  }
}

function meetingWhenPhrase(slotStart: string, timeZone: string): string {
  return `meeting ${formatHostMeetingWhen(slotStart, timeZone)}`;
}

function latestReplySentence(
  latest: GuestRsvpReplyNotice,
  timeZone: string,
): string {
  const when = meetingWhenPhrase(latest.slotStart, timeZone);
  const action = guestRsvpActionPhrase(latest.status);
  return `${latest.guestName} ${action} (${when})`;
}

export function guestRsvpToastCopy(
  count: number,
  latest: GuestRsvpReplyNotice | null,
  timeZone: string,
  whileYouWereAway: boolean,
): string {
  if (!latest || count < 1) {
    return "";
  }
  const latestSentence = latestReplySentence(latest, timeZone);
  if (count === 1) {
    if (whileYouWereAway) {
      return `While you were away: ${latestSentence}`;
    }
    return latestSentence;
  }
  const pluralLead = whileYouWereAway
    ? `${count} guest replies while you were away.`
    : `${count} guests replied since you last looked.`;
  return `${pluralLead} Latest: ${latestSentence}`;
}

interface GuestRsvpToastProps {
  toastId: Id;
  count: number;
  latest: GuestRsvpReplyNotice;
  whileYouWereAway: boolean;
}

export function GuestRsvpToast({
  toastId,
  count,
  latest,
  whileYouWereAway,
}: GuestRsvpToastProps) {
  const timeZone = useEffectiveTimeZone();

  const handleShow = () => {
    dismissToastAndOpenWeekForSlot(toastId, latest.slotStart, timeZone);
  };

  return (
    <ToastNotice>
      <p className="text-sm text-text">
        {guestRsvpToastCopy(count, latest, timeZone, whileYouWereAway)}
      </p>
      <ToastActionButton onClick={handleShow}>Show</ToastActionButton>
    </ToastNotice>
  );
}

function claimToPayload(
  claim: BookingGuestRsvpClaimResponse,
): GuestRsvpToastPayload | null {
  if (claim.count < 1 || !claim.latest) {
    return null;
  }
  return {
    count: claim.count,
    latest: claimReplyToNotice(claim.latest),
    whileYouWereAway: claim.whileYouWereAway,
  };
}

function claimReplyToNotice(
  reply: BookingGuestRsvpClaimReply,
): GuestRsvpReplyNotice {
  return {
    guestName: reply.guestName,
    status: reply.status,
    slotStart: reply.slotStart,
  };
}

export function showGuestRsvpToastFromClaim(
  claim: BookingGuestRsvpClaimResponse,
): void {
  const payload = claimToPayload(claim);
  if (!payload) {
    return;
  }
  if (shouldDeferAttentionToasts()) {
    rememberPendingGuestRsvp(payload);
    return;
  }
  mountGuestRsvpToast(payload);
}

export function flushDeferredGuestRsvpToast(): void {
  const pending = takePendingGuestRsvp();
  if (!pending) {
    return;
  }
  mountGuestRsvpToast(pending);
}

function mountGuestRsvpToast(payload: GuestRsvpToastPayload): void {
  getToast()(
    createElement(GuestRsvpToast, {
      toastId: GUEST_RSVP_TOAST_ID,
      count: payload.count,
      latest: payload.latest,
      whileYouWereAway: payload.whileYouWereAway,
    }),
    {
      ...getToastDefaultOptions(),
      toastId: GUEST_RSVP_TOAST_ID,
    },
  );
}
