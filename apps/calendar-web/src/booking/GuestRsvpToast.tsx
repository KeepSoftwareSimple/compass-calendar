import { createElement } from "react";
import { type Id } from "react-toastify";
import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import { type AttendeeResponseStatus } from "@core/types/event-attendance.contracts";
import {
  rememberPendingGuestRsvp,
  shouldDeferAttentionToasts,
  takePendingGuestRsvp,
} from "@web/billing/billing-gate-attention";
import { formatHostMeetingWhen } from "@web/booking/NewMeetingsToast";
import { ROOT_ROUTES } from "@web/common/constants/routes";
import {
  GUEST_RSVP_TOAST_ID,
  getToastDefaultOptions,
} from "@web/common/constants/toast.constants";
import { importOrReload } from "@web/common/utils/browser/missing-chunk-reload.util";
import { ToastActionButton } from "@web/common/utils/toast/ToastActionButton";
import { ToastNotice } from "@web/common/utils/toast/ToastNotice";
import { getToast } from "@web/common/utils/toast/toast.port";
import { useEffectiveTimeZone } from "@web/timezone/effective-timezone.store";
import { inEffectiveTimeZone } from "@web/timezone/in-time-zone";

export type GuestRsvpReplyNotice = {
  guestName: string;
  status: AttendeeResponseStatus;
  slotStart: string;
};

export type GuestRsvpToastPayload = {
  count: number;
  latest: GuestRsvpReplyNotice;
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

export function guestRsvpToastCopy(
  count: number,
  latest: GuestRsvpReplyNotice | null,
  timeZone: string,
): string {
  if (!latest || count < 1) {
    return "";
  }
  const when = formatHostMeetingWhen(latest.slotStart, timeZone);
  const action = guestRsvpActionPhrase(latest.status);
  if (count === 1) {
    return `${latest.guestName} ${action}: ${when}`;
  }
  return `${count} guests replied. Latest: ${latest.guestName} ${action}, ${when}`;
}

interface GuestRsvpToastProps {
  toastId: Id;
  count: number;
  latest: GuestRsvpReplyNotice;
}

export function GuestRsvpToast({
  toastId,
  count,
  latest,
}: GuestRsvpToastProps) {
  const timeZone = useEffectiveTimeZone();

  const handleShow = () => {
    getToast().dismiss(toastId);
    const dateString = inEffectiveTimeZone(latest.slotStart, timeZone).format(
      YEAR_MONTH_DAY_FORMAT,
    );
    void importOrReload(() => import("@web/routers")).then(({ router }) => {
      void router.navigate({
        to: ROOT_ROUTES.WEEK_DATE,
        params: { dateString },
      });
    });
  };

  return (
    <ToastNotice>
      <p className="text-sm text-text">
        {guestRsvpToastCopy(count, latest, timeZone)}
      </p>
      <ToastActionButton onClick={handleShow}>Show</ToastActionButton>
    </ToastNotice>
  );
}

export function showGuestRsvpToast(
  replies: readonly GuestRsvpReplyNotice[],
): void {
  if (replies.length === 0) {
    return;
  }
  const latest = replies[replies.length - 1]!;
  const payload: GuestRsvpToastPayload = { count: replies.length, latest };
  if (shouldDeferAttentionToasts()) {
    rememberPendingGuestRsvp(payload);
    return;
  }

  getToast()(
    createElement(GuestRsvpToast, {
      toastId: GUEST_RSVP_TOAST_ID,
      count: payload.count,
      latest: payload.latest,
    }),
    {
      ...getToastDefaultOptions(),
      toastId: GUEST_RSVP_TOAST_ID,
    },
  );
}

export function flushDeferredGuestRsvpToast(): void {
  const pending = takePendingGuestRsvp();
  if (!pending) {
    return;
  }
  getToast()(
    createElement(GuestRsvpToast, {
      toastId: GUEST_RSVP_TOAST_ID,
      count: pending.count,
      latest: pending.latest,
    }),
    {
      ...getToastDefaultOptions(),
      toastId: GUEST_RSVP_TOAST_ID,
    },
  );
}
