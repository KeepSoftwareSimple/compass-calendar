import { ArrowSquareOut } from "@phosphor-icons/react/dist/csr/ArrowSquareOut";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import { Copy } from "@phosphor-icons/react/dist/csr/Copy";
import { type RefCallback, useState } from "react";
import { track } from "@web/auth/posthog/track";
import {
  BOOKING_ADDRESS_CHANGE_WARNING,
  bookingAddressPrefix,
} from "@web/booking/BookingAddressField";
import { BookingFieldLabel } from "@web/booking/BookingFieldLabel";
import { bookingSlugParseMessage } from "@web/booking/booking.util";
import { bookingFieldAttrs } from "@web/booking/booking-sequence.fields";
import { useCopiedFlag } from "@web/booking/use-copied-flag";
import { copyText } from "@web/common/utils/clipboard/clipboard.util";
import { showStatusToast } from "@web/common/utils/toast/status-toast.util";
import IconButton, {
  iconButtonClassName,
} from "@web/components/IconButton/IconButton";
import { TooltipWrapper } from "@web/components/Tooltip/TooltipWrapper";

const ICON_SIZE = 18;

interface BookingMeetingLinkFieldProps {
  bookingUrl: string | null;
  forceInvalid?: boolean;
  inputRef?: RefCallback<HTMLInputElement | null>;
  onChange: (slug: string) => void;
  savedSlug: string | null;
  showOpen?: boolean;
  slug: string;
}

export function BookingMeetingLinkField({
  bookingUrl,
  forceInvalid = false,
  inputRef,
  onChange,
  savedSlug,
  showOpen = true,
  slug,
}: BookingMeetingLinkFieldProps) {
  const [blurred, setBlurred] = useState(false);
  const prefix = bookingAddressPrefix(bookingUrl);
  const meetingUrl = slug ? `${prefix}${slug}` : prefix;
  const parseMessage = bookingSlugParseMessage(slug);
  const showError = (blurred || forceInvalid) && parseMessage != null;
  const showWarning = savedSlug != null && slug !== savedSlug;
  const errorId = "booking-meeting-link-error";
  const warningId = "booking-meeting-link-warning";
  const describedBy = [
    showError ? errorId : null,
    showWarning ? warningId : null,
  ]
    .filter(Boolean)
    .join(" ");

  const { copied, copy } = useCopiedFlag(meetingUrl, (didCopy) => {
    if (didCopy) {
      track("booking_link_copied", { source: "button" });
    }
    showStatusToast(
      "booking-link-copied",
      didCopy
        ? "Meeting link copied"
        : "Could not copy. Select the link to copy it.",
    );
  });

  const handleInputChange = (raw: string) => {
    let next = raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
    const meetSuffix = next.match(/\/meet\/([^/?#]*)$/);
    if (meetSuffix) {
      next = meetSuffix[1];
    }
    onChange(next.toLowerCase());
  };

  return (
    <div className="min-w-0">
      <BookingFieldLabel htmlFor="booking-meeting-link">
        Meeting link
      </BookingFieldLabel>
      <div className="flex items-center gap-1">
        <input
          {...bookingFieldAttrs("address")}
          aria-describedby={describedBy || undefined}
          aria-invalid={showError || undefined}
          aria-label="Meeting link"
          autoCapitalize="none"
          className={`c-focus-ring min-w-0 flex-1 rounded border bg-surface-overlay px-2 py-1 text-sm text-text ${
            showError ? "border-error" : "border-border"
          }`}
          id="booking-meeting-link"
          onBlur={() => setBlurred(true)}
          onChange={(event) => handleInputChange(event.target.value)}
          ref={inputRef}
          spellCheck={false}
          value={meetingUrl}
        />
        <TooltipWrapper description={copied ? "Copied" : "Copy meeting link"}>
          <IconButton
            aria-label="Copy meeting link"
            onClick={copy}
            size="small"
          >
            {copied ? <Check size={ICON_SIZE} /> : <Copy size={ICON_SIZE} />}
          </IconButton>
        </TooltipWrapper>
        {showOpen && slug ? (
          <TooltipWrapper description="Open meeting page">
            <a
              aria-label="Open meeting page"
              className={iconButtonClassName("small")}
              href={meetingUrl}
              rel="noreferrer"
              target="_blank"
            >
              <ArrowSquareOut size={ICON_SIZE} />
            </a>
          </TooltipWrapper>
        ) : null}
      </div>
      {showError ? (
        <p className="font-medium text-sm text-text" id={errorId} role="alert">
          {parseMessage}
        </p>
      ) : null}
      {showWarning ? (
        <p
          className="font-medium text-sm text-text"
          id={warningId}
          role="status"
        >
          {BOOKING_ADDRESS_CHANGE_WARNING}
        </p>
      ) : null}
    </div>
  );
}

/** Copy the public link after save when the field is not on screen. */
export function copyMeetingLinkThenToast(
  bookingUrl: string,
  copy: { onCopy: string; onFail: string },
) {
  void copyText(bookingUrl).then((didCopy) => {
    if (didCopy) {
      track("booking_link_copied", { source: "save" });
    }
    showStatusToast("booking-link-copied", didCopy ? copy.onCopy : copy.onFail);
  });
}
