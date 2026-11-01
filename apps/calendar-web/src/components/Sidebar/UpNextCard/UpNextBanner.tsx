import { type FC, useState } from "react";
import { APP_SHORTCUT_BINDINGS } from "@core/shortcuts/app-shortcut-bindings";
import dayjs from "@core/util/date/dayjs";
import { BANNER_DISMISS_MS } from "@web/common/constants/motion.constants";
import { Z_INDEX_FLOATING_MENU } from "@web/common/constants/web.constants";
import { useDismissTransition } from "@web/common/hooks/useDismissTransition";
import { ShortcutHint } from "@web/components/Shortcuts/ShortcutHint";
import { TooltipWrapper } from "@web/components/Tooltip/TooltipWrapper";
import { useAppShortcutUp } from "@web/shortcuts/useAppShortcut";
import { formatEventStatus } from "./UpNextCard";
import { useUpNextBannerHorizontalCenter } from "./useUpNextBannerHorizontalCenter";
import { useUpNextEvent } from "./useUpNextEvent";
import { useUpNextOsNotification } from "./useUpNextOsNotification";

const MINUTES_BEFORE_START = 2;
const BANNER_BOTTOM_OFFSET_PX = 24;

/**
 * Centered banner for the next timed event when it is about to start or in
 * progress. N opens details; V joins when a conference URL exists.
 */
export const UpNextBanner: FC = () => {
  const { now, openEventDetails, upNext, conferenceUrl, isCurrentEvent } =
    useUpNextEvent();
  const [dismissedId, setDismissedId] = useState<string | undefined>(undefined);
  const { closing, beginDismiss } = useDismissTransition(BANNER_DISMISS_MS);

  const isWithinWindow =
    Boolean(upNext) &&
    (isCurrentEvent ||
      dayjs(upNext?.startDate).diff(now, "minute", true) <=
        MINUTES_BEFORE_START);
  const isVisible = isWithinWindow && upNext?._id !== dismissedId;
  const centerX = useUpNextBannerHorizontalCenter(isVisible);

  useUpNextOsNotification(
    upNext?._id
      ? {
          _id: upNext._id,
          title: upNext.title,
          startDate: upNext.startDate,
        }
      : undefined,
    isVisible,
  );

  const openConference = () =>
    window.open(conferenceUrl, "_blank", "noopener,noreferrer");

  const dismiss = () => {
    beginDismiss(() => setDismissedId(upNext?._id));
  };

  const upNextShortcuts = APP_SHORTCUT_BINDINGS;
  useAppShortcutUp(
    upNextShortcuts.navUpNext.hotkey,
    () => openEventDetails("keyboardEdit"),
    { shortcutId: "nav-up-next" },
  );
  useAppShortcutUp(upNextShortcuts.navJoinMeeting.hotkey, openConference, {
    enabled: Boolean(conferenceUrl),
    shortcutId: "nav-join-meeting",
  });
  useAppShortcutUp("Escape", dismiss, { enabled: isVisible });

  if (!isVisible || !upNext || centerX === null) {
    return null;
  }

  const countdown = formatEventStatus(
    dayjs(upNext.startDate),
    dayjs(upNext.endDate),
    now,
    isCurrentEvent,
  );

  return (
    <div
      aria-atomic="true"
      className="pointer-events-none fixed flex w-72 starting:translate-y-2 items-center gap-3 rounded-lg border border-border bg-surface-panel/80 px-3 py-2 text-sm text-text starting:opacity-0 shadow-xl backdrop-blur-md transition-all duration-300 ease-out data-closing:opacity-0 motion-reduce:transition-none"
      data-closing={closing || undefined}
      data-notice=""
      data-up-next-banner=""
      role="status"
      style={{
        zIndex: Z_INDEX_FLOATING_MENU,
        bottom: `max(${BANNER_BOTTOM_OFFSET_PX}px, env(safe-area-inset-bottom))`,
        left: centerX,
        transform: "translateX(-50%)",
      }}
    >
      <div className="pointer-events-auto min-w-0 flex-1">
        <div className="text-text-muted text-xs">{countdown}</div>
        <div className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full bg-accent"
          />
          <span className="truncate font-medium">{upNext.title}</span>
        </div>
      </div>
      <TooltipWrapper
        description={conferenceUrl ? "Join meeting" : "Open Up Next event"}
        shortcut={conferenceUrl ? "V" : "N"}
        shortcutId={conferenceUrl ? "nav-join-meeting" : "nav-up-next"}
      >
        <button
          className="c-focus-ring pointer-events-auto flex shrink-0 items-center gap-1.5 rounded bg-accent-secondary px-2 py-1 font-medium text-on-accent"
          onClick={
            conferenceUrl ? openConference : () => openEventDetails("gridClick")
          }
          type="button"
        >
          {conferenceUrl ? "Join" : "Open"}
          <ShortcutHint>{conferenceUrl ? "V" : "N"}</ShortcutHint>
        </button>
      </TooltipWrapper>
      <TooltipWrapper description="Dismiss banner" shortcut="Esc">
        <button
          aria-label="Dismiss"
          className="c-focus-ring pointer-events-auto shrink-0 rounded-xs px-1 text-text-muted hover:text-text"
          onClick={dismiss}
          type="button"
        >
          &times;
        </button>
      </TooltipWrapper>
    </div>
  );
};
