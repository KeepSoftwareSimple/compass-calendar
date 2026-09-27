import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { IS_BOOKING_ENABLED } from "@web/common/constants/env.constants";
import IconButton from "@web/components/IconButton/IconButton";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
import { settingsActions } from "@web/settings/settings.store";
import {
  MEETING_PAGE_NUDGE_SHORTCUT_KEY,
  useNoticeActionShortcut,
} from "@web/shortcuts/notice-focus/useNoticeActionShortcut";
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

  const openMeetingSettings = () => settingsActions.openSettings("booking");

  useNoticeActionShortcut(
    MEETING_PAGE_NUDGE_SHORTCUT_KEY,
    openMeetingSettings,
    {
      enabled: visible,
    },
  );

  if (!visible) return null;

  return (
    <section
      aria-label="Meeting page"
      className="flex flex-col gap-2 rounded-lg bg-surface-overlay p-3 text-xs"
      data-notice=""
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="font-medium text-sm text-text">Skip back & forth</h2>
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
        className="c-button-compact c-button-primary inline-flex items-center gap-2 self-start rounded-xs px-2 py-1 text-s"
        onClick={openMeetingSettings}
        type="button"
      >
        Set up meeting page
        <ShortcutKeys keys={MEETING_PAGE_NUDGE_SHORTCUT_KEY} />
      </button>
    </section>
  );
}
