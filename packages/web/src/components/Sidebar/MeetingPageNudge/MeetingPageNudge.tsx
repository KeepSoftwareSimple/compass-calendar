import { XIcon } from "@phosphor-icons/react";
import { IS_BOOKING_ENABLED } from "@web/common/constants/env.constants";
import IconButton from "@web/components/IconButton/IconButton";
import { settingsActions } from "@web/settings/settings.store";
import { useMeetingPageNudge } from "./useMeetingPageNudge";

type MeetingPageNudgeProps = {
  bookingEnabled?: boolean;
  isMobile?: boolean;
};

export function MeetingPageNudge({
  bookingEnabled = IS_BOOKING_ENABLED,
  isMobile,
}: MeetingPageNudgeProps = {}) {
  const { visible, dismiss } = useMeetingPageNudge({
    bookingEnabled,
    isMobile,
  });

  if (!visible) return null;

  return (
    <section
      aria-label="Meeting page"
      className="flex flex-col gap-2 rounded-lg bg-surface-overlay p-3 text-xs"
      data-notice=""
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-sm font-medium text-text">
            Let people book time with you
          </h2>
          <p className="text-text leading-relaxed">
            Share a link and guests pick a time that is free on your calendar.
          </p>
        </div>
        <IconButton
          aria-label="Dismiss"
          className="shrink-0 text-text-muted hover:text-text"
          onClick={dismiss}
          size="small"
        >
          <XIcon aria-hidden="true" size={14} />
        </IconButton>
      </div>
      <button
        className="c-button-compact c-button-primary self-start rounded-xs px-2 py-1 text-s"
        onClick={() => settingsActions.openSettings("booking")}
        type="button"
      >
        Set up meeting page
      </button>
    </section>
  );
}
