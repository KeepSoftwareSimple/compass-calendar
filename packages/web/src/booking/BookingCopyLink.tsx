import { ArrowSquareOut, Check, Copy } from "@phosphor-icons/react";
import { track } from "@web/auth/posthog/track";
import { bookingFieldAttrs } from "@web/booking/booking-sequence.fields";
import { useCopiedFlag } from "@web/booking/use-copied-flag";
import { showStatusToast } from "@web/common/utils/toast/status-toast.util";
import IconButton, {
  iconButtonClassName,
} from "@web/components/IconButton/IconButton";
import { TooltipWrapper } from "@web/components/Tooltip/TooltipWrapper";

interface BookingCopyLinkProps {
  bookingUrl: string;
  showOpen?: boolean;
}

const ICON_SIZE = 18;

export function BookingCopyLink({
  bookingUrl,
  showOpen = true,
}: BookingCopyLinkProps) {
  const { copied, copy } = useCopiedFlag(bookingUrl, (didCopy) => {
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

  return (
    <div>
      <p className="mb-1 text-sm text-text">Meeting link</p>
      <div className="flex items-center gap-1">
        <input
          aria-label="Meeting link"
          className="c-focus-ring min-w-0 flex-1 rounded border border-border bg-surface-overlay px-2 py-1 text-sm text-text"
          readOnly
          value={bookingUrl}
        />
        <TooltipWrapper description={copied ? "Copied" : "Copy meeting link"}>
          <IconButton
            aria-label="Copy meeting link"
            onClick={copy}
            size="small"
            {...bookingFieldAttrs("link")}
          >
            {copied ? <Check size={ICON_SIZE} /> : <Copy size={ICON_SIZE} />}
          </IconButton>
        </TooltipWrapper>
        {showOpen ? (
          <TooltipWrapper description="Open meeting page">
            <a
              aria-label="Open meeting page"
              className={iconButtonClassName("small")}
              href={bookingUrl}
              rel="noreferrer"
              target="_blank"
            >
              <ArrowSquareOut size={ICON_SIZE} />
            </a>
          </TooltipWrapper>
        ) : null}
      </div>
    </div>
  );
}
