import { createElement } from "react";
import { type Id } from "react-toastify";
import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import {
  rememberPendingGuestRsvp,
  shouldDeferAttentionToasts,
  takePendingGuestRsvp,
} from "@web/billing/billing-gate-attention";
import {
  type GuestRsvpNoticePayload,
  type GuestRsvpReplyChange,
  type GuestRsvpReplyStatus,
} from "@web/booking/guest-rsvp-notice.payload";
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
import {
  calendarDateInEffectiveTimeZone,
  inEffectiveTimeZone,
} from "@web/timezone/in-time-zone";

const MEETING_WHEN_FORMAT = "ddd, MMM D, h:mm A";

function formatGuestReplyWhen(
  whenAnchor: string,
  timeZone: string,
  includesTime: boolean,
): string {
  if (includesTime) {
    return formatHostMeetingWhen(whenAnchor, timeZone);
  }
  return calendarDateInEffectiveTimeZone(whenAnchor, timeZone).format(
    MEETING_WHEN_FORMAT,
  );
}

function replyVerb(status: GuestRsvpReplyStatus): string {
  if (status === "tentative") {
    return "replied maybe";
  }
  return status;
}

export function guestRsvpToastCopy(
  count: number,
  latest: GuestRsvpReplyChange,
  timeZone: string,
  includesTime: boolean,
): string {
  if (count < 1) {
    return "";
  }
  const when = formatGuestReplyWhen(latest.whenAnchor, timeZone, includesTime);
  const name = latest.guestDisplayName;
  const verb = replyVerb(latest.responseStatus);
  if (count === 1) {
    return `${name} ${verb}: ${when}`;
  }
  return `${count} guests replied. Latest: ${name} ${verb}, ${when}`;
}

interface GuestRsvpToastProps {
  toastId: Id;
  payload: GuestRsvpNoticePayload;
  includesTime: boolean;
}

export function GuestRsvpToast({
  toastId,
  payload,
  includesTime,
}: GuestRsvpToastProps) {
  const timeZone = useEffectiveTimeZone();

  const handleShow = () => {
    getToast().dismiss(toastId);
    const dateString = (
      includesTime
        ? inEffectiveTimeZone(payload.latest.whenAnchor, timeZone)
        : calendarDateInEffectiveTimeZone(payload.latest.whenAnchor, timeZone)
    ).format(YEAR_MONTH_DAY_FORMAT);
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
        {guestRsvpToastCopy(
          payload.count,
          payload.latest,
          timeZone,
          includesTime,
        )}
      </p>
      <ToastActionButton onClick={handleShow}>Show</ToastActionButton>
    </ToastNotice>
  );
}

export function showGuestRsvpToast(payload: GuestRsvpNoticePayload): void {
  if (payload.count < 1) {
    return;
  }
  if (shouldDeferAttentionToasts()) {
    rememberPendingGuestRsvp(payload);
    return;
  }

  const includesTime = payload.latest.whenAnchor.includes("T");
  getToast()(
    createElement(GuestRsvpToast, {
      toastId: GUEST_RSVP_TOAST_ID,
      payload,
      includesTime,
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
  showGuestRsvpToast(pending);
}
