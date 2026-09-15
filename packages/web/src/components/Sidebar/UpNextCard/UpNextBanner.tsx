import { type FC, useState } from "react";
import dayjs from "@core/util/date/dayjs";
import { BANNER_DISMISS_MS } from "@web/common/constants/motion.constants";
import { Z_INDEX_FLOATING_MENU } from "@web/common/constants/web.constants";
import { useDismissTransition } from "@web/common/hooks/useDismissTransition";
import { ShortcutHint } from "@web/components/Shortcuts/ShortcutHint";
import { TooltipWrapper } from "@web/components/Tooltip/TooltipWrapper";
import { APP_SHORTCUT_BINDINGS } from "@web/shortcuts/app-shortcut-bindings";
import { POINTER_ACTIONS } from "@web/shortcuts/keyboard-only/pointer-action";
import { useAppShortcutUp } from "@web/shortcuts/useAppShortcut";
import { formatEventStatus } from "./UpNextCard";
import { useUpNextEvent } from "./useUpNextEvent";

const MINUTES_BEFORE_START = 2;

/**
 * A centered banner that surfaces the next timed event when it is about to
 * start, mirroring Vimcal. N opens the event's details from anywhere. V joins
 * the Up Next meeting whenever that event has a conference URL, not only
 * while this banner is visible. The banner's primary action switches to Join
 * when a link exists.
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

  const openConference = () =>
    window.open(conferenceUrl, "_blank", "noopener,noreferrer");

  // Keeps the banner mounted for one fade-out beat instead of yanking it
  // instantly.
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
  // Only active while the banner itself is showing. Fires alongside any
  // other Escape handling (e.g. useEscapeToCloseForm closing the event form)
  // the same way every other Escape shortcut in the app does - Escape is
  // never scoped to "not while typing" here, matching that convention.
  useAppShortcutUp("Escape", dismiss, { enabled: isVisible });

  if (!isVisible || !upNext) {
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
      className="fixed bottom-6 left-1/2 flex w-72 -translate-x-1/2 starting:translate-y-2 items-center gap-3 rounded-lg border border-border bg-surface-panel/80 px-3 py-2 text-sm text-text starting:opacity-0 shadow-xl backdrop-blur-md transition-all duration-300 ease-out data-closing:opacity-0 motion-reduce:transition-none"
      data-closing={closing || undefined}
      data-notice=""
      role="status"
      style={{ zIndex: Z_INDEX_FLOATING_MENU }}
    >
      <div className="min-w-0 flex-1">
        <div className="text-text-muted text-xs">{countdown}</div>
        <div className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full bg-accent"
          />
          <span className="truncate font-medium">{upNext.title}</span>
        </div>
      </div>
      <button
        className="c-focus-ring flex shrink-0 items-center gap-1.5 rounded bg-accent-secondary px-2 py-1 font-medium text-on-accent"
        onClick={
          conferenceUrl ? openConference : () => openEventDetails("gridClick")
        }
        type="button"
      >
        {conferenceUrl ? "Join" : "Open"}
        <ShortcutHint>{conferenceUrl ? "V" : "N"}</ShortcutHint>
      </button>
      <TooltipWrapper shortcut="Esc">
        <button
          aria-label="Dismiss"
          className="c-focus-ring shrink-0 rounded-xs px-1 text-text-muted hover:text-text"
          data-pointer-action={POINTER_ACTIONS.upNextDismiss}
          onClick={dismiss}
          type="button"
        >
          &times;
        </button>
      </TooltipWrapper>
    </div>
  );
};
