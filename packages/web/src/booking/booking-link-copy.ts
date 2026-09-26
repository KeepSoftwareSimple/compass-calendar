import { track } from "@web/auth/posthog/track";
import { copyText } from "@web/common/utils/clipboard/clipboard.util";
import { showStatusToast } from "@web/common/utils/toast/status-toast.util";

const BOOKING_LINK_TOAST_ID = "booking-link-copied";

const COPY_BUTTON_MESSAGES: BookingLinkCopyMessages = {
  onCopy: "Meeting link copied",
  onFail: "Could not copy. Select the link to copy it.",
};

export interface BookingLinkCopyMessages {
  onCopy: string;
  onFail: string;
}

/**
 * Count the copy and report whichever of the two outcomes happened. Every
 * meeting-link copy lands here so the event name, the toast slot, and the
 * failure wording stay in one place.
 */
export function reportBookingLinkCopied(
  didCopy: boolean,
  source: "button" | "save",
  messages: BookingLinkCopyMessages = COPY_BUTTON_MESSAGES,
): void {
  if (didCopy) {
    track("booking_link_copied", { source });
  }
  showStatusToast(
    BOOKING_LINK_TOAST_ID,
    didCopy ? messages.onCopy : messages.onFail,
  );
}

/** Copy the public link after save, when the field is not on screen. */
export function copyMeetingLinkThenToast(
  bookingUrl: string,
  messages: BookingLinkCopyMessages,
): void {
  void copyText(bookingUrl).then((didCopy) => {
    reportBookingLinkCopied(didCopy, "save", messages);
  });
}
