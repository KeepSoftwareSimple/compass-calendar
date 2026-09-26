import { ArrowSquareOut } from "@phosphor-icons/react/dist/csr/ArrowSquareOut";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import { Copy } from "@phosphor-icons/react/dist/csr/Copy";
import { type RefCallback } from "react";
import { BookingFieldLabel } from "@web/booking/BookingFieldLabel";
import { BookingSlugFieldMessages } from "@web/booking/BookingSlugFieldMessages";
import { bookingAddressPrefix } from "@web/booking/booking-address.util";
import { reportBookingLinkCopied } from "@web/booking/booking-link-copy";
import { bookingFieldAttrs } from "@web/booking/booking-sequence.fields";
import { useCopiedFlag } from "@web/booking/use-copied-flag";
import { useBookingSlugField } from "@web/booking/useBookingSlugField";
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
  const prefix = bookingAddressPrefix(bookingUrl);
  const meetingUrl = slug ? `${prefix}${slug}` : prefix;
  const field = useBookingSlugField({
    forceInvalid,
    idPrefix: "booking-meeting-link",
    savedSlug,
    slug,
  });

  const { copied, copy } = useCopiedFlag(meetingUrl, (didCopy) => {
    reportBookingLinkCopied(didCopy, "button");
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
          aria-describedby={field.describedBy}
          aria-invalid={field.showError || undefined}
          aria-label="Meeting link"
          autoCapitalize="none"
          className={`c-focus-ring min-w-0 flex-1 rounded border bg-surface-overlay px-2 py-1 text-sm text-text ${
            field.showError ? "border-error" : "border-border"
          }`}
          id="booking-meeting-link"
          onBlur={field.markBlurred}
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
      <BookingSlugFieldMessages field={field} />
    </div>
  );
}
